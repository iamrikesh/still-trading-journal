package expo.modules.stillmediavault

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.Build
import android.os.Handler
import android.os.Looper
import java.io.File

/** Only receives vault-owned native paths. No paths or platform exceptions cross the bridge. */
internal class AndroidAudioDriver(private val context: Context) : AudioDriver {
  private val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val main = Handler(Looper.getMainLooper())
  private val attributes = AudioAttributes.Builder()
    .setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()

  /** Per-operation focus and receiver ownership prevents stale events acting on another clip. */
  private inner class Interruptions(private val ended: (Boolean) -> Unit) {
    private val listener = AudioManager.OnAudioFocusChangeListener { change ->
      if (change < 0) ended(false) // Includes ducking: this app always stops, never resumes.
    }
    private var request: AudioFocusRequest? = null
    private var registered = false
    private var focused = false
    private val receiver = object : BroadcastReceiver() {
      override fun onReceive(context: Context?, intent: Intent?) { ended(false) }
    }

    fun acquire(recording: Boolean) {
      val gain = if (recording) AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE else AudioManager.AUDIOFOCUS_GAIN_TRANSIENT
      val granted = if (Build.VERSION.SDK_INT >= 26) {
        val focus = AudioFocusRequest.Builder(gain).setAudioAttributes(attributes)
          .setOnAudioFocusChangeListener(listener, main).setWillPauseWhenDucked(true).build()
        request = focus
        manager.requestAudioFocus(focus)
      } else {
        @Suppress("DEPRECATION")
        manager.requestAudioFocus(listener, AudioManager.STREAM_MUSIC, gain)
      }
      check(granted == AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
      focused = true
      val filter = IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_OFF)
        addAction(AudioManager.ACTION_AUDIO_BECOMING_NOISY)
      }
      if (Build.VERSION.SDK_INT >= 33) context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
      else {
        @Suppress("DEPRECATION")
        context.registerReceiver(receiver, filter)
      }
      registered = true
    }

    fun release() {
      try {
        if (registered) {
          context.unregisterReceiver(receiver)
          registered = false
        }
      } finally {
        if (focused) {
          if (Build.VERSION.SDK_INT >= 26) request?.let { manager.abandonAudioFocusRequest(it) }
          else {
            @Suppress("DEPRECATION")
            manager.abandonAudioFocus(listener)
          }
        }
        focused = false
      }
    }
  }

  override fun record(file: File, ended: (Boolean) -> Unit): AudioHandle {
    val interruptions = Interruptions(ended)
    @Suppress("DEPRECATION")
    val recorder = if (Build.VERSION.SDK_INT >= 31) MediaRecorder(context) else MediaRecorder()
    var started = false
    var released = false
    val handle = object : AudioHandle {
      override fun stop() {
        if (started && !released) { recorder.stop(); started = false }
      }
      override fun release() {
        try {
          if (!released) {
            recorder.release()
            released = true
          }
        } finally { interruptions.release() }
      }
    }
    try {
      interruptions.acquire(true)
      recorder.setAudioSource(MediaRecorder.AudioSource.MIC)
      recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
      recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
      recorder.setAudioChannels(1)
      recorder.setAudioSamplingRate(44100)
      recorder.setAudioEncodingBitRate(64000)
      // Leave room for AAC frame/container finalization inside the strict four-minute/file bounds.
      recorder.setMaxDuration(239500)
      recorder.setMaxFileSize(StreamingFileVault.MAX_PLAINTEXT_BYTES - 65536L)
      recorder.setOutputFile(file.absolutePath)
      recorder.setOnInfoListener { _, what, _ ->
        if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED ||
          what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_FILESIZE_REACHED) ended(false)
      }
      recorder.setOnErrorListener { _, _, _ -> ended(true) }
      recorder.prepare()
      recorder.start()
      started = true
      return handle
    } catch (error: Exception) {
      try { handle.release() } catch (_: Exception) { throw AudioStartFailure(handle) }
      throw error
    }
  }

  override fun play(file: File, ended: (Boolean) -> Unit): AudioHandle {
    val interruptions = Interruptions(ended)
    val player = MediaPlayer()
    var started = false
    var released = false
    val handle = object : AudioHandle {
      override fun stop() {
        if (started && !released) { player.stop(); started = false }
      }
      override fun release() {
        try {
          if (!released) {
            player.release()
            released = true
          }
        } finally { interruptions.release() }
      }
    }
    try {
      interruptions.acquire(false)
      player.setAudioAttributes(attributes)
      player.setDataSource(file.absolutePath)
      player.setOnCompletionListener { ended(false) }
      player.setOnErrorListener { _, _, _ -> ended(true); true }
      player.prepare()
      player.start()
      started = true
      return handle
    } catch (error: Exception) {
      try { handle.release() } catch (_: Exception) { throw AudioStartFailure(handle) }
      throw error
    }
  }
}
