package expo.modules.stillmediavault

import android.content.pm.ApplicationInfo
import android.app.KeyguardManager
import android.content.Context
import android.os.PowerManager
import android.os.SystemClock
import com.google.crypto.tink.integration.android.AndroidKeystore
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withTimeout
import android.net.Uri
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.coroutineContext

class StillMediaVaultModule : Module() {
  private var clips: ClipFileVault? = null
  private var audio: AudioOperations? = null
  private var reminders: ReminderPlayback? = null
  private val reminderPlayAdmission = ReminderPlayAdmission()
  private val foreground = AtomicBoolean(true)
  private val importScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  @Volatile private var importWorker: Deferred<ImportedReminder>? = null
  @Volatile private var importTicket: Long? = null

  override fun definition() = ModuleDefinition {
    Name("StillMediaVault")
    lateinit var reminderPicker: AppContextActivityResultLauncher<String, Uri?>
    RegisterActivityContracts {
      reminderPicker = registerForActivityResult(ReminderPicker())
    }
    OnDestroy {
      foreground.set(false)
      reminderPlayAdmission.revoke()
      cancelImport()
      try {
        CLIP_OWNER.destroy(this@StillMediaVaultModule) {
          var failure: Exception? = null
          try { reminders?.destroy() } catch (error: Exception) { failure = error }
          try { audio?.destroy() } catch (error: Exception) { if (failure == null) failure = error }
          failure?.let { throw it }
        }
        reminders = null
        audio = null
        clips = null
      } catch (_: Exception) {
        // Retain the resource and static ownership if release is unconfirmed. Fail closed.
      }
    }
    OnActivityEntersForeground { foreground.set(true) }
    OnActivityEntersBackground { interruptAudio() }
    OnActivityDestroys { interruptAudio(); cancelImport() }
    AsyncFunction("initializeClips") { allowCreate: Boolean ->
      clipErrors {
        CLIP_OWNER.initialize(this@StillMediaVaultModule) {
          if (clips == null) {
            val context = checkNotNull(appContext.reactContext)
            val root = File(context.noBackupFilesDir.canonicalFile, "still-clips-v1")
            check(root.canonicalFile == root.absoluteFile)
            if (!root.exists()) check(root.mkdir())
            check(root.isDirectory)
            val streaming = ProtectedKeyset(root, AndroidClipWrappingKey(), ClipFileVault.KEYSET_AAD).open(allowCreate)
            val opened = ClipFileVault(root, streaming, AndroidClipFiles::duration,
              syncDirectory = { AndroidClipFiles.syncDirectory(root) })
            // Only after existing keys authenticate: transient files cannot hide orphan evidence.
            opened.cleanupTransient()
            audio = AudioOperations(AndroidAudioDriver(context), ::isForeground, SystemClock::elapsedRealtime,
              { callback ->
                CLIP_OWNER.callback(this@StillMediaVaultModule) {
                  try { callback() } catch (_: Exception) { /* Status retains failed cleanup. */ }
                }
              }, opened::captureFile, opened::playbackFile, opened::removePlayback)
            val temp = File(context.noBackupFilesDir.canonicalFile, "still-reminder-playback-v1.tmp")
            reminders = ReminderPlayback(AndroidAudioDriver(context), ::isForeground, SystemClock::elapsedRealtime,
              { callback ->
                CLIP_OWNER.callback(this@StillMediaVaultModule) {
                  try { callback() } catch (_: Exception) { /* Status retains cleanup obligation. */ }
                }
              }, temp) { checkNotNull(audio).requireReleased() }
            reminders!!.removeStartupOrphan()
            audio!!.reminderReleaseCheck = { checkNotNull(reminders).requireReleased() }
            clips = opened
          }
        }
      }
    }
    AsyncFunction("sealClip") { id: String, momentId: String, createdAt: String ->
      clipOperation {
        stopAffected(ClipIntent(id, momentId, createdAt))
        it.seal(ClipIntent(id, momentId, createdAt)).toMap()
      }
    }
    AsyncFunction("verifyClip") { id: String, momentId: String, createdAt: String ->
      clipOperation { it.verify(ClipIntent(id, momentId, createdAt)).toMap() }
    }
    AsyncFunction("removeClipStaging") { id: String, momentId: String, createdAt: String ->
      clipOperation {
        stopAffected(ClipIntent(id, momentId, createdAt))
        it.removeStaging(ClipIntent(id, momentId, createdAt))
      }
    }
    AsyncFunction("removeClipFiles") { id: String, momentId: String, createdAt: String ->
      clipOperation {
        stopAffected(ClipIntent(id, momentId, createdAt))
        it.removeAll(ClipIntent(id, momentId, createdAt))
      }
    }
    AsyncFunction("startCapture") { id: String, momentId: String, createdAt: String ->
      clipOperation { checkNotNull(audio).startCapture(ClipIntent(id, momentId, createdAt)) }
    }
    AsyncFunction("stopCapture") { id: String ->
      clipOperation { checkNotNull(audio).stopCapture(id) }
    }
    AsyncFunction("startPlayback") { id: String, momentId: String, createdAt: String ->
      clipOperation { checkNotNull(audio).startPlayback(ClipIntent(id, momentId, createdAt)) }
    }
    AsyncFunction("stopPlayback") { clipOperation { checkNotNull(audio).stopPlayback() } }
    AsyncFunction("audioStatus") { clipOperation { checkNotNull(audio).status() } }
    AsyncFunction("audioUsage") { clipOperation { it.usageBytes() } }
    AsyncFunction("pickReminder") Coroutine { kind: String ->
      val ticket = reminderErrors {
        require(kind == "image" || kind == "audio")
        REMINDER_PICK_GATE.begin()
      }
      importTicket = ticket
      var handedOff = false
      try {
        reminderErrors { CLIP_OWNER.run(this@StillMediaVaultModule) { checkNotNull(clips) } }
        val uri = try { reminderPicker.launch(kind) } catch (error: CancellationException) { throw error }
          catch (_: Exception) { throw CodedException("ERR_REMINDER_MEDIA", "The selection could not complete.", null) }
        if (uri == null) null else {
          val context = reminderErrors { checkNotNull(appContext.reactContext) }
          val worker = importScope.async {
            try {
              val jobContext = coroutineContext
              runInterruptible {
                val stream = context.contentResolver.openInputStream(uri) ?: error("Unreadable media")
                REMINDER_PICK_GATE.attach(ticket, stream)
                stream.use {
                  val bytes = readBounded(it, if (kind == "image") MAX_IMAGE_BYTES else MAX_AUDIO_BYTES) {
                    jobContext.ensureActive()
                  }
                  jobContext.ensureActive()
                  inspectReminder(bytes, kind, context.contentResolver.getType(uri), AndroidReminderDecoder::inspect)
                }
              }
            } finally {
              REMINDER_PICK_GATE.finish(ticket)
            }
          }
          // Also releases admission if async was cancelled before its body started.
          worker.invokeOnCompletion { REMINDER_PICK_GATE.finish(ticket) }
          handedOff = true
          importWorker = worker
          val imported = try { withTimeout(15000) { worker.await() } }
            catch (error: Exception) {
              REMINDER_PICK_GATE.cancel(ticket) // Close an acquired stream from this caller's thread.
              worker.cancel() // runInterruptible also interrupts a blocking provider call.
              if (error is CancellationException && error !is TimeoutCancellationException) throw error
              throw CodedException("ERR_REMINDER_MEDIA", "The selected media could not be imported.", null)
            }
          finally {
            if (importWorker === worker) importWorker = null
            if (importTicket == ticket) importTicket = null
          }
          reminderErrors { CLIP_OWNER.run(this@StillMediaVaultModule) { checkNotNull(clips) } }
          imported.toMap()
        }
      } finally {
        if (!handedOff) REMINDER_PICK_GATE.finish(ticket)
        if (importTicket == ticket && !handedOff) importTicket = null
      }
    }
    AsyncFunction("playReminder") { base64: String ->
      val ticket = reminderPlayAdmission.ticket()
      val media = reminderErrors {
        val bytes = decodeReminderBase64(base64)
        val selected = inspectReminder(bytes, "audio", null, AndroidReminderDecoder::inspect)
        bytes to requireNotNull(selected.durationMs)
      }
      reminderOperation {
        reminderPlayAdmission.requireCurrent(ticket)
        it.play(media.first, media.second)
      }
    }
    AsyncFunction("stopReminder") {
      reminderPlayAdmission.revoke()
      reminderOperation { it.stop() }
    }
    AsyncFunction("reminderStatus") { reminderOperation { it.status() } }
    AsyncFunction("prepareClipFixture") { id: String, momentId: String, createdAt: String ->
      clipOperation { requireDebug(); it.prepareFixture(ClipIntent(id, momentId, createdAt)) }
    }
    AsyncFunction("inspectClipFiles") { id: String ->
      clipOperation { requireDebug(); it.inspect(id) }
    }
    AsyncFunction("prepareProof") {
      guarded { proof -> mapOf("fixtureBytes" to proof.prepare()) }
    }
    AsyncFunction("verifyProof") {
      guarded { proof -> mapOf("checks" to proof.verify(), "fixtureBytes" to SyntheticVaultProof.FIXTURE_BYTES) }
    }
  }

  private fun isForeground(): Boolean {
    val context = appContext.reactContext ?: return false
    val activity = appContext.currentActivity ?: return false
    val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
    val keyguard = context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager
    return foreground.get() && !activity.isFinishing && !activity.isDestroyed && activity.hasWindowFocus() &&
      power.isInteractive && !keyguard.isKeyguardLocked
  }

  private fun interruptAudio() {
    // Revoke admission before waiting for an in-progress encryption/prepare operation.
    foreground.set(false)
    reminderPlayAdmission.revoke()
    CLIP_OWNER.callback(this) {
      try { audio?.interrupt() } catch (_: Exception) { /* Preserve failed cleanup for retry. */ }
      try { reminders?.stop() } catch (_: Exception) { /* Preserve failed cleanup for retry. */ }
    }
  }

  private fun cancelImport() {
    importTicket?.let { REMINDER_PICK_GATE.cancel(it) }
    importWorker?.cancel()
  }

  private fun stopAffected(intent: ClipIntent) {
    intent.aad()
    audio?.requireOwner(intent)
    audio?.stopAffected(intent.id)
  }

  private fun requireDebug() {
    val context = checkNotNull(appContext.reactContext)
    check(BuildConfig.DEBUG && (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0)
  }

  private fun <T> clipErrors(operation: () -> T): T = try {
    operation()
  } catch (_: Exception) {
    throw CodedException("ERR_MEDIA_VAULT_CLIP", "The clip file operation could not complete.", null)
  }

  private fun <T> clipOperation(operation: (ClipFileVault) -> T): T = clipErrors {
    CLIP_OWNER.run(this) { operation(checkNotNull(clips)) }
  }

  private fun <T> reminderErrors(operation: () -> T): T = try {
    operation()
  } catch (_: Exception) {
    throw CodedException("ERR_REMINDER_MEDIA", "Reminder media could not complete.", null)
  }

  private fun <T> reminderOperation(operation: (ReminderPlayback) -> T): T = reminderErrors {
    CLIP_OWNER.run(this) { checkNotNull(clips); operation(checkNotNull(reminders)) }
  }

  private class AndroidClipWrappingKey : WrappingKey {
    private val alias = "still.media-vault.clips.v1"
    override fun exists() = AndroidKeystore.hasKey(alias)
    override fun generate() {
      check(!exists())
      AndroidKeystore.generateNewAes256GcmKey(alias)
    }
    override fun aead() = AndroidKeystore.getAead(alias)
  }

  private fun <T> guarded(operation: (SyntheticVaultProof) -> T): T = synchronized(PROOF_LOCK) {
    try {
      val context = checkNotNull(appContext.reactContext)
      // Both guards are native: JavaScript cannot enable proof operations in a release app.
      check(BuildConfig.DEBUG && (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0)
      val parent = context.noBackupFilesDir.canonicalFile
      val root = File(parent, "still-media-vault-synthetic-proof-v1")
      check(root.canonicalFile == root.absoluteFile)
      if (!root.exists()) check(root.mkdir())
      check(root.isDirectory)
      operation(SyntheticVaultProof(root) { namespace -> AndroidProofWrappingKey(namespace) })
    } catch (_: Exception) {
      // Do not attach the original cause: Expo otherwise serializes private native details.
      throw CodedException("ERR_MEDIA_VAULT_PROOF", "The synthetic media proof could not complete.", null)
    }
  }

  private class AndroidProofWrappingKey(namespace: String) : ProofWrappingKey {
    private val alias: String
    init {
      require(namespace in setOf("persistent", "checks", "missing-key", "missing-keyset"))
      alias = "still.media-vault.synthetic-proof.v1.$namespace"
    }
    override fun exists() = AndroidKeystore.hasKey(alias)
    override fun generate() {
      // Tink's generation API overwrites an existing alias; explicitly forbid that first.
      check(!exists())
      AndroidKeystore.generateNewAes256GcmKey(alias)
    }
    override fun aead() = AndroidKeystore.getAead(alias)
    override fun delete() {
      check(!alias.endsWith(".persistent"))
      AndroidKeystore.deleteKey(alias)
    }
  }

  companion object {
    // One owner even across React reloads/module instances. Lifecycle callbacks share this lock.
    private val PROOF_LOCK = Any()
    private val CLIP_OWNER = ClipOwnership()
    private val REMINDER_PICK_GATE = ReminderImportGate()
  }
}
