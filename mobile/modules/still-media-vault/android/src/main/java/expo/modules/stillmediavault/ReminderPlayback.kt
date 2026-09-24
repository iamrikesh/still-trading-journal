package expo.modules.stillmediavault

import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.atomic.AtomicLong
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/** Stop/lifecycle revokes Play work even while base64 validation runs outside the audio lock. */
internal class ReminderPlayAdmission {
  private val epoch = AtomicLong(0)
  fun ticket(): Long = epoch.get()
  fun revoke() { epoch.incrementAndGet() }
  fun requireCurrent(ticket: Long) { check(epoch.get() == ticket) }
  suspend fun <T> validateOffQueue(validate: () -> T, start: (Long, T) -> Unit) {
    val ticket = ticket()
    val value = withContext(Dispatchers.IO) { validate() }
    start(ticket, value) // Caller checks ticket inside the serialized native audio lock.
  }
}

/** All methods and driver callbacks are serialized by the module's ClipOwnership lock. */
internal class ReminderPlayback(
  private val driver: AudioDriver,
  private val foreground: () -> Boolean,
  private val clock: () -> Long,
  private val dispatch: (() -> Unit) -> Unit,
  private val temporary: File,
  private val removeFile: (File) -> Unit = { check(!it.exists() || it.delete()) },
  private val journalReleaseCheck: () -> Unit = {},
) {
  private var handle: AudioHandle? = null
  private var ownsFile = false
  private var generation = 0L
  private var startedAt = 0L
  private var duration = 0
  private var destroyed = false
  private var releasePending = false

  fun requireReleased() {
    check(handle == null && !ownsFile)
  }

  fun status(): Map<String, Any> = mapOf(
    "state" to if (handle == null && !ownsFile) "idle" else if (handle == null || releasePending || destroyed) "cleanup" else "playing",
    "durationMs" to if (handle != null) (clock() - startedAt).coerceIn(0, 240000).toInt() else duration,
  )

  /** Run only after journal/vault initialization; never sweep unrelated cache files. */
  fun removeStartupOrphan() {
    requireReleased()
    if (temporary.exists()) check(temporary.delete())
  }

  fun play(bytes: ByteArray, durationMs: Int) {
    require(durationMs in 1..240000 && bytes.isNotEmpty() && bytes.size <= MAX_AUDIO_BYTES)
    check(!destroyed && foreground())
    requireReleased()
    journalReleaseCheck()
    check(!temporary.exists())
    ownsFile = true
    releasePending = false
    val token = ++generation
    try {
      FileOutputStream(temporary).use { output ->
        output.write(bytes)
        output.fd.sync()
      }
      check(foreground())
      duration = durationMs
      startedAt = clock()
      val ended: (Boolean) -> Unit = { _ ->
        dispatch { if (generation == token && !destroyed) stop() }
      }
      handle = driver.play(temporary, ended)
      if (!foreground()) stop()
    } catch (error: Exception) {
      ++generation
      if (error is AudioStartFailure) {
        handle = error.unreleased
        releasePending = true
      }
      if (handle == null) cleanupFile()
      throw error
    }
  }

  fun stop() {
    ++generation
    val current = handle
    if (current != null) {
      duration = (clock() - startedAt).coerceIn(0, 240000).toInt()
      try { current.stop() } catch (_: Exception) { /* Release is still mandatory. */ }
      try { current.release() } catch (error: Exception) {
        releasePending = true
        throw error // Keep ownership on failure, so Stop can retry.
      }
      handle = null
      releasePending = false
    }
    cleanupFile()
  }

  private fun cleanupFile() {
    if (!ownsFile) return
    removeFile(temporary)
    ownsFile = false
  }

  fun destroy() {
    destroyed = true
    stop()
  }
}
