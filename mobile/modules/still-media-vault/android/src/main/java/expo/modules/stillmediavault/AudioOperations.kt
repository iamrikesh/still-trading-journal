package expo.modules.stillmediavault

import java.io.File

internal interface AudioHandle {
  fun stop()
  fun release()
}

/** Startup failed and resource release is unconfirmed; the owner must retain and retry it. */
internal class AudioStartFailure(val unreleased: AudioHandle) : Exception()

/** Startup releases allocations or throws AudioStartFailure carrying the unresolved resource. */
internal interface AudioDriver {
  fun record(file: File, ended: (Boolean) -> Unit): AudioHandle
  fun play(file: File, ended: (Boolean) -> Unit): AudioHandle
}

/** All entry points and dispatched callbacks run under the same ClipOwnership lock. */
internal class AudioOperations(
  private val driver: AudioDriver,
  private val foreground: () -> Boolean,
  private val clock: () -> Long,
  private val dispatch: (() -> Unit) -> Unit,
  private val captureFile: (ClipIntent) -> File,
  private val playbackFile: (ClipIntent) -> File,
  private val removePlayback: (ClipIntent) -> Unit,
) {
  /** Called under the same module owner lock before any capture/decrypt allocation. */
  var reminderReleaseCheck: () -> Unit = {}
  private var owner: ClipIntent? = null
  private var handle: AudioHandle? = null
  private var playback: ClipIntent? = null
  private var state = "idle"
  private var startedAt = 0L
  private var duration = 0L
  private var generation = 0L
  private var destroyed = false

  fun status(): Map<String, Any?> = mapOf(
    "id" to owner?.id, "state" to state,
    "durationMs" to if (handle != null) (clock() - startedAt).coerceIn(0, MAX_DURATION_MS) else duration,
  )

  private fun admit(intent: ClipIntent) {
    check(!destroyed && foreground() && handle == null)
    reminderReleaseCheck()
    intent.aad()
    requireOwner(intent)
    cleanupPlayback()
  }

  fun startCapture(intent: ClipIntent) = start(intent, false)
  fun startPlayback(intent: ClipIntent) = start(intent, true)

  private fun start(intent: ClipIntent, playing: Boolean) {
    admit(intent)
    owner = intent
    duration = 0
    val token = ++generation
    try {
      val file = if (playing) playbackFile(intent).also { playback = intent } else captureFile(intent)
      check(foreground())
      state = if (playing) "playing" else "recording"
      startedAt = clock()
      val ended: (Boolean) -> Unit = { failed ->
        dispatch { if (generation == token && !destroyed) stop(failed) }
      }
      handle = if (playing) driver.play(file, ended) else driver.record(file, ended)
      // Lifecycle revocation is atomic outside the lock, including while prepare/decrypt blocks.
      if (!foreground()) stop(false)
    } catch (error: Exception) {
      state = "failed"
      ++generation
      if (error is AudioStartFailure) handle = error.unreleased
      if (handle == null) cleanupPlayback()
      throw error
    }
  }

  fun stopCapture(id: String) {
    ClipIntent.validateId(id)
    check(owner?.id == id && state != "playing")
    stop(false)
  }

  fun stopPlayback() {
    if (playback != null) stop(false)
  }

  fun stopAffected(id: String) {
    if (owner?.id == id) stop(false)
  }

  fun requireOwner(intent: ClipIntent) {
    if (owner?.id == intent.id) check(owner == intent)
  }

  fun requireReleased() { check(handle == null && playback == null) }

  fun interrupt() = stop(false)

  private fun stop(failed: Boolean) {
    val current = handle
    ++generation // Invalidate queued completion/focus callbacks before release.
    if (current != null) {
      duration = (clock() - startedAt).coerceIn(0, MAX_DURATION_MS)
      var failure = failed
      try { current.stop() } catch (_: Exception) { failure = true }
      try { current.release() } catch (error: Exception) {
        state = "failed"
        // Keep the obligation and plaintext: stop/delete/seal/start must not bypass failed release.
        throw error
      }
      handle = null
      state = if (failure) "failed" else "stopped"
    }
    cleanupPlayback()
  }

  private fun cleanupPlayback() {
    val pending = playback ?: return
    try {
      removePlayback(pending)
      playback = null
    } catch (error: Exception) {
      state = "failed"
      throw error // Retain the cleanup obligation; a later stop/start can retry it.
    }
  }

  fun destroy() {
    destroyed = true
    stop(false)
  }

  companion object { const val MAX_DURATION_MS = 240000L }
}
