package expo.modules.stillmediavault

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import java.io.Closeable

/** One temporary-grant selection. The source URI is never returned across the bridge. */
internal class ReminderPicker : AppContextActivityResultContract<String, Uri?> {
  override fun createIntent(context: Context, input: String): Intent {
    require(input == "image" || input == "audio")
    val types = if (input == "image") arrayOf("image/png", "image/jpeg")
      else arrayOf("audio/wav", "audio/x-wav", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a")
    return Intent(Intent.ACTION_GET_CONTENT).apply {
      addCategory(Intent.CATEGORY_OPENABLE)
      type = if (input == "image") "image/*" else "audio/*"
      putExtra(Intent.EXTRA_MIME_TYPES, types)
      putExtra(Intent.EXTRA_ALLOW_MULTIPLE, false)
      addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }
  }

  override fun parseResult(input: String, resultCode: Int, intent: Intent?): Uri? {
    if (resultCode == Activity.RESULT_CANCELED) return null
    check(resultCode == Activity.RESULT_OK && intent?.clipData == null)
    val uri = checkNotNull(intent).data ?: error("No selected document")
    check(uri.scheme == "content")
    return uri
  }
}

/** Cancellation closes an acquired stream without waiting for a hostile provider read. */
internal class ReminderImportGate {
  private var active = false
  private var cancelled = false
  private var finishing = false
  private var generation = 0L
  private var stream: Closeable? = null

  @Synchronized fun begin(): Long {
    check(!active)
    active = true
    cancelled = false
    finishing = false
    generation++
    return generation
  }

  fun attach(ticket: Long, opened: Closeable) {
    val accepted = synchronized(this) {
      if (active && generation == ticket && !cancelled && stream == null) {
        stream = opened
        true
      } else false
    }
    if (!accepted) { opened.close(); error("Import cancelled") }
  }

  fun cancel(ticket: Long) {
    val closing = synchronized(this) {
      if (!active || generation != ticket) null else {
        cancelled = true
        stream.also { stream = null }
      }
    }
    closeQuietly(closing)
  }

  private fun closeQuietly(closing: Closeable?) {
    try { closing?.close() } catch (_: Exception) { /* Worker still owns its final close. */ }
  }

  /** The guard remains set until the actual worker, not just its caller, exits. */
  fun finish(ticket: Long) {
    val closing = synchronized(this) {
      if (!active || generation != ticket || finishing) return
      finishing = true
      stream.also { stream = null }
    }
    try {
      closeQuietly(closing)
    } finally {
      synchronized(this) {
        if (generation == ticket) {
          active = false
          finishing = false
        }
      }
    }
  }
}
