package expo.modules.stillmediavault

import com.google.crypto.tink.StreamingAead
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.CharBuffer
import java.nio.charset.CodingErrorAction

internal data class ClipIntent(val id: String, val momentId: String, val createdAt: String) {
  fun validate() {
    validateId(id)
    // Legacy moments may have an empty ID. These limits bound native clip admission only.
    require(momentId.length <= 1024)
    require(createdAt.isNotEmpty() && createdAt.length <= 128)
  }
  fun aad(): ByteArray {
    validate()
    val bytes = ByteArrayOutputStream()
    DataOutputStream(bytes).use { output ->
      for (field in listOf("still-clips:v1", id, momentId, createdAt)) {
        val encodedBuffer = Charsets.UTF_8.newEncoder()
          .onMalformedInput(CodingErrorAction.REPORT)
          .onUnmappableCharacter(CodingErrorAction.REPORT)
          .encode(CharBuffer.wrap(field))
        val encoded = ByteArray(encodedBuffer.remaining())
        encodedBuffer.get(encoded)
        output.writeInt(encoded.size)
        output.write(encoded)
      }
    }
    return bytes.toByteArray()
  }
  companion object {
    fun validateId(id: String) { require(id.matches(Regex("[a-z0-9-]{1,64}"))) }
  }
}

internal data class ClipMetadata(val bytes: Long, val durationMs: Long) {
  fun toMap() = mapOf("bytes" to bytes, "durationMs" to durationMs)
}

/** Caller owns serialization. Android supplies real metadata and directory durability boundaries. */
internal class ClipFileVault(
  private val root: File,
  streaming: StreamingAead,
  private val inspectDuration: (File) -> Long,
  private val availableBytes: () -> Long = { root.usableSpace },
  private val syncDirectory: () -> Unit,
) {
  private val files = OwnedFiles(root)
  private val streams = StreamingFileVault(root, streaming)
  private class InvalidContent : Exception()

  private fun path(id: String, suffix: String): File {
    ClipIntent.validateId(id)
    return File(root, "$id.$suffix").also { files.validate(it) }
  }
  private fun admit(workingBytes: Long) { check(availableBytes() >= HEADROOM_BYTES + workingBytes) }
  private fun metadata(file: File): ClipMetadata {
    files.input(file, StreamingFileVault.MAX_PLAINTEXT_BYTES)
    val bytes = file.length()
    require(bytes in 1..StreamingFileVault.MAX_PLAINTEXT_BYTES)
    val duration = inspectDuration(file)
    require(duration in 1..240000L)
    // An inspector cannot legitimize a changed or oversized file.
    check(file.length() == bytes)
    return ClipMetadata(bytes, duration)
  }

  private fun authenticated(intent: ClipIntent, cipher: File): ClipMetadata {
    val verification = path(intent.id, "verify.plain")
    check(!verification.exists()) // Never remove a destination we did not create.
    admit(StreamingFileVault.MAX_PLAINTEXT_BYTES)
    try {
      try {
        streams.decrypt(cipher, verification, intent.aad())
        return metadata(verification)
      } catch (_: Exception) {
        throw InvalidContent()
      }
    } finally {
      // A cleanup failure is not InvalidContent and must never trigger pending rebuild.
      files.remove(verification)
    }
  }

  fun seal(intent: ClipIntent): ClipMetadata {
    intent.validate()
    val final = path(intent.id, "cipher")
    if (final.exists()) {
      val measured = authenticated(intent, final)
      syncDirectory() // Retry a rename that succeeded before directory sync failed.
      return measured
    }
    val pending = path(intent.id, "pending.cipher")
    val staging = path(intent.id, "staging.plain")
    if (pending.exists()) {
      val recovered = try { authenticated(intent, pending) } catch (_: InvalidContent) { null }
      if (recovered != null) return finalize(pending, final, recovered)
      metadata(staging) // Preserve invalid pending unless a usable original is confirmed.
      admit(StreamingFileVault.MAX_CIPHERTEXT_BYTES + StreamingFileVault.MAX_PLAINTEXT_BYTES)
      files.remove(pending)
    }
    val original = metadata(staging)
    admit(StreamingFileVault.MAX_CIPHERTEXT_BYTES + StreamingFileVault.MAX_PLAINTEXT_BYTES)
    streams.encrypt(staging, pending, intent.aad())
    val verified = authenticated(intent, pending)
    check(verified == original)
    return finalize(pending, final, verified)
  }

  private fun finalize(pending: File, final: File, metadata: ClipMetadata): ClipMetadata {
    files.validate(pending); files.validate(final)
    check(!final.exists())
    check(pending.renameTo(final))
    syncDirectory()
    return metadata
  }

  fun verify(intent: ClipIntent): ClipMetadata {
    intent.validate()
    return authenticated(intent, path(intent.id, "cipher"))
  }

  fun removeStaging(intent: ClipIntent) {
    intent.validate()
    // Repository intent grants deletion authority; authenticate retained content when available.
    val final = path(intent.id, "cipher")
    authenticated(intent, final)
    files.remove(path(intent.id, "staging.plain"))
    syncDirectory()
  }

  fun removeAll(intent: ClipIntent) {
    intent.validate()
    // Deletion must also work for damaged files. Its authority is the durable repository intent.
    for (suffix in listOf("staging.plain", "pending.cipher", "cipher", "verify.plain", "playback.plain")) {
      files.remove(path(intent.id, suffix))
    }
    syncDirectory()
  }

  fun inspect(id: String): Map<String, Boolean> = mapOf(
    "staging" to path(id, "staging.plain").exists(),
    "final" to path(id, "cipher").exists(),
    "pending" to path(id, "pending.cipher").exists(),
    "verification" to path(id, "verify.plain").exists(),
  )

  fun cleanupTransient() {
    for (file in checkNotNull(root.listFiles())) {
      if (file.name.matches(Regex("[a-z0-9-]{1,64}\\.(verify|playback)\\.plain"))) files.remove(file)
    }
  }

  /** Called only through the native debug guard. Never records or accepts audio from JavaScript. */
  fun prepareFixture(intent: ClipIntent) {
    intent.validate()
    val staging = path(intent.id, "staging.plain")
    val final = path(intent.id, "cipher")
    if (final.exists()) {
      authenticated(intent, final)
      if (!staging.exists()) return
    }
    if (staging.exists()) {
      metadata(staging)
      staging.inputStream().use { input ->
        val expected = fixtureHeader()
        for (byte in expected) check(input.read() == (byte.toInt() and 255))
        repeat(16000) { check(input.read() == 0) }
        check(input.read() == -1)
      }
      return
    }
    check(!path(intent.id, "pending.cipher").exists())
    admit(16044)
    files.writeNew(staging) { output ->
      output.write(fixtureHeader())
      val silence = ByteArray(1000)
      repeat(16) { output.write(silence) }
    }
  }

  private fun fixtureHeader(): ByteArray = ByteBuffer.allocate(44).order(ByteOrder.LITTLE_ENDIAN).apply {
    put("RIFF".toByteArray(Charsets.US_ASCII)); putInt(16036)
    put("WAVEfmt ".toByteArray(Charsets.US_ASCII)); putInt(16)
    putShort(1); putShort(1); putInt(8000); putInt(16000); putShort(2); putShort(16)
    put("data".toByteArray(Charsets.US_ASCII)); putInt(16000)
  }.array()

  companion object {
    private const val HEADROOM_BYTES = 100L * 1024 * 1024
    val KEYSET_AAD = "still-clips:keyset:v1".toByteArray(Charsets.UTF_8)
  }
}
