package expo.modules.stillmediavault

import android.media.MediaMetadataRetriever
import android.system.Os
import android.system.OsConstants
import java.io.File

internal object AndroidClipFiles {
  fun duration(file: File): Long {
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(file.absolutePath)
      val mime = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE)
      require(mime in setOf("audio/mp4", "audio/aac", "audio/x-wav", "audio/wav", "audio/raw"))
      return checkNotNull(retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)).toLong()
    } finally {
      retriever.release()
    }
  }

  fun syncDirectory(root: File) {
    check(root.isDirectory)
    val descriptor = Os.open(root.absolutePath, OsConstants.O_RDONLY, 0)
    try { Os.fsync(descriptor) } finally { Os.close(descriptor) }
  }
}
