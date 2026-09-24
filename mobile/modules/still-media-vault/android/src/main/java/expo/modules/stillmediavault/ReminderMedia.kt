package expo.modules.stillmediavault

import android.graphics.BitmapFactory
import android.media.MediaDataSource
import android.media.MediaMetadataRetriever
import java.io.ByteArrayOutputStream
import java.io.InputStream

internal const val MAX_IMAGE_BYTES = 2097152
internal const val MAX_AUDIO_BYTES = 4194304
private const val MAX_IMAGE_PIXELS = 4000000L
private const val MAX_IMAGE_SIDE = 4096

internal data class MediaFacts(
  val mime: String, val width: Int?, val height: Int?, val durationMs: Int?, val hasVideo: Boolean,
)

internal data class ImportedReminder(
  val kind: String, val mime: String, val bytes: Int, val base64: String,
  val width: Int?, val height: Int?, val durationMs: Int?,
) {
  fun toMap(): Map<String, Any?> = mapOf(
    "kind" to kind, "mime" to mime, "bytes" to bytes, "base64" to base64,
    "width" to width, "height" to height, "durationMs" to durationMs,
  )
}

/** The provider's length is advisory; the stream itself is the size authority. */
internal fun readBounded(stream: InputStream, maximum: Int, checkActive: () -> Unit = {}): ByteArray {
  require(maximum in 1..MAX_AUDIO_BYTES)
  val output = ByteArrayOutputStream(minOf(maximum, 8192))
  val buffer = ByteArray(8192)
  while (true) {
    checkActive()
    val count = stream.read(buffer, 0, minOf(buffer.size, maximum - output.size() + 1))
    if (count < 0) break
    if (count == 0) continue
    check(output.size() + count <= maximum)
    output.write(buffer, 0, count)
  }
  return output.toByteArray().also { check(it.isNotEmpty()) }
}

internal fun decodeReminderBase64(encoded: String): ByteArray {
  require(encoded.isNotEmpty() && encoded.length <= 4 * ((MAX_AUDIO_BYTES + 2) / 3) && encoded.length % 4 == 0)
  val padding = if (encoded.endsWith("==")) 2 else if (encoded.endsWith("=")) 1 else 0
  val length = encoded.length / 4 * 3 - padding
  require(length in 1..MAX_AUDIO_BYTES)
  val bytes = ByteArray(length)
  var output = 0
  for (index in encoded.indices step 4) {
    val a = BASE64_ALPHABET.indexOf(encoded[index])
    val b = BASE64_ALPHABET.indexOf(encoded[index + 1])
    val c = if (encoded[index + 2] == '=') 0 else BASE64_ALPHABET.indexOf(encoded[index + 2])
    val d = if (encoded[index + 3] == '=') 0 else BASE64_ALPHABET.indexOf(encoded[index + 3])
    require(a >= 0 && b >= 0 && c >= 0 && d >= 0)
    if (index < encoded.length - 4) require(encoded[index + 2] != '=' && encoded[index + 3] != '=')
    val lastPadding = if (index == encoded.length - 4) padding else 0
    require((encoded[index + 2] == '=') == (lastPadding == 2))
    require((encoded[index + 3] == '=') == (lastPadding >= 1))
    require(lastPadding != 2 || b and 15 == 0)
    require(lastPadding != 1 || c and 3 == 0)
    val bits = a shl 18 or (b shl 12) or (c shl 6) or d
    bytes[output++] = (bits ushr 16).toByte()
    if (output < length) bytes[output++] = (bits ushr 8).toByte()
    if (output < length) bytes[output++] = bits.toByte()
  }
  return bytes
}

private const val BASE64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

private fun encodeReminderBase64(bytes: ByteArray): String {
  val encoded = StringBuilder(4 * ((bytes.size + 2) / 3))
  for (index in bytes.indices step 3) {
    val a = bytes[index].toInt() and 255
    val b = if (index + 1 < bytes.size) bytes[index + 1].toInt() and 255 else 0
    val c = if (index + 2 < bytes.size) bytes[index + 2].toInt() and 255 else 0
    encoded.append(BASE64_ALPHABET[a ushr 2])
    encoded.append(BASE64_ALPHABET[(a and 3) shl 4 or (b ushr 4)])
    encoded.append(if (index + 1 < bytes.size) BASE64_ALPHABET[(b and 15) shl 2 or (c ushr 6)] else '=')
    encoded.append(if (index + 2 < bytes.size) BASE64_ALPHABET[c and 63] else '=')
  }
  return encoded.toString()
}

private fun headerMime(bytes: ByteArray, kind: String): String {
  if (kind == "image") {
    if (bytes.size >= 8 && bytes.copyOfRange(0, 8).contentEquals(byteArrayOf(0x89.toByte(), 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))) return "image/png"
    if (bytes.size >= 3 && bytes[0] == 0xff.toByte() && bytes[1] == 0xd8.toByte() && bytes[2] == 0xff.toByte()) return "image/jpeg"
  } else if (kind == "audio") {
    if (bytes.size >= 12 && String(bytes, 0, 4, Charsets.US_ASCII) == "RIFF" && String(bytes, 8, 4, Charsets.US_ASCII) == "WAVE") return "audio/wav"
    if (bytes.size >= 10 && String(bytes, 0, 3, Charsets.US_ASCII) == "ID3" ||
      bytes.size >= 2 && bytes[0] == 0xff.toByte() && (bytes[1].toInt() and 0xe0) == 0xe0) return "audio/mpeg"
    if (bytes.size >= 12 && String(bytes, 4, 4, Charsets.US_ASCII) == "ftyp") return "audio/mp4"
  }
  error("Unsupported reminder media")
}

/** Decoder inspects captured bytes, never a provider path or claimed metadata. */
internal fun inspectReminder(
  bytes: ByteArray, kind: String, claimedMime: String?,
  decoder: (ByteArray, String) -> MediaFacts,
): ImportedReminder {
  require(kind == "image" || kind == "audio")
  require(bytes.isNotEmpty() && bytes.size <= if (kind == "image") MAX_IMAGE_BYTES else MAX_AUDIO_BYTES)
  val mime = headerMime(bytes, kind)
  require(claimedMime == null || claimedMime == mime || claimedMime == "application/octet-stream" ||
    claimedMime == "audio/x-wav" && mime == "audio/wav" ||
    claimedMime == "audio/mp3" && mime == "audio/mpeg" ||
    claimedMime == "audio/x-m4a" && mime == "audio/mp4")
  val facts = decoder(bytes, mime)
  require(!facts.hasVideo && facts.mime == mime)
  if (kind == "image") {
    val width = requireNotNull(facts.width)
    val height = requireNotNull(facts.height)
    require(width in 1..MAX_IMAGE_SIDE && height in 1..MAX_IMAGE_SIDE && width.toLong() * height <= MAX_IMAGE_PIXELS)
    require(facts.durationMs == null)
  } else {
    require(facts.width == null && facts.height == null && requireNotNull(facts.durationMs) in 1..240000)
  }
  return ImportedReminder(kind, mime, bytes.size, encodeReminderBase64(bytes),
    facts.width, facts.height, facts.durationMs)
}

internal object AndroidReminderDecoder {
  fun inspect(bytes: ByteArray, mime: String): MediaFacts = if (mime.startsWith("image/")) image(bytes, mime) else audio(bytes, mime)

  private fun image(bytes: ByteArray, mime: String): MediaFacts {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(bytes, 0, bytes.size, bounds)
    val width = bounds.outWidth
    val height = bounds.outHeight
    require(bounds.outMimeType == mime)
    // Admission precedes a full bitmap allocation.
    require(width in 1..MAX_IMAGE_SIDE && height in 1..MAX_IMAGE_SIDE && width.toLong() * height <= MAX_IMAGE_PIXELS)
    val decoded = BitmapFactory.decodeByteArray(bytes, 0, bytes.size) ?: error("Undecodable image")
    try { check(decoded.width == width && decoded.height == height) } finally { decoded.recycle() }
    return MediaFacts(mime, width, height, null, false)
  }

  private fun audio(bytes: ByteArray, mime: String): MediaFacts {
    val source = object : MediaDataSource() {
      override fun getSize(): Long = bytes.size.toLong()
      override fun readAt(position: Long, buffer: ByteArray, offset: Int, size: Int): Int {
        if (position < 0 || position >= bytes.size) return -1
        val count = minOf(size, bytes.size - position.toInt())
        System.arraycopy(bytes, position.toInt(), buffer, offset, count)
        return count
      }
      override fun close() {}
    }
    val retriever = MediaMetadataRetriever()
    try {
      retriever.setDataSource(source)
      val detected = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_MIMETYPE)
      val normalized = when (detected) {
        "audio/x-wav", "audio/wave", "audio/wav" -> "audio/wav"
        "audio/mp3", "audio/mpeg" -> "audio/mpeg"
        "audio/mp4", "audio/aac", "audio/x-m4a" -> "audio/mp4"
        else -> detected
      }
      val duration = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull()
      require(duration != null && duration in 1..240000)
      val video = retriever.extractMetadata(MediaMetadataRetriever.METADATA_KEY_HAS_VIDEO) == "yes"
      return MediaFacts(normalized ?: "", null, null, duration.toInt(), video)
    } finally {
      try { retriever.release() } finally { source.close() }
    }
  }
}
