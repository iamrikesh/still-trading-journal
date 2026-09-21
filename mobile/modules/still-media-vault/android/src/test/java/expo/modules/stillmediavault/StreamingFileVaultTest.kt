package expo.modules.stillmediavault

import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.StreamingAead
import com.google.crypto.tink.streamingaead.PredefinedStreamingAeadParameters
import com.google.crypto.tink.streamingaead.StreamingAeadConfig
import java.io.File
import java.io.RandomAccessFile
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class StreamingFileVaultTest {
  @get:Rule val temporary = TemporaryFolder()
  private val aad = "still-proof-v1:synthetic-moment:synthetic-clip".toByteArray()

  private fun primitive(): StreamingAead {
    StreamingAeadConfig.register()
    return KeysetHandle.generateNew(PredefinedStreamingAeadParameters.AES256_GCM_HKDF_4KB)
      .getPrimitive(RegistryConfiguration.get(), StreamingAead::class.java)
  }

  private fun file(name: String) = File(temporary.root, name)
  private fun source(size: Int = 65536) = file("input.plain").apply {
    writeBytes(ByteArray(size) { (it * 31).toByte() })
  }

  private fun rejects(block: () -> Unit) {
    assertThrows(Exception::class.java) { block() }
  }

  @Test fun roundtripAcrossSegmentsAndAtExactLimit() {
    val vault = StreamingFileVault(temporary.root, primitive())
    val input = source(4 * 1024 * 1024)
    vault.encrypt(input, file("saved.cipher"), aad)
    vault.decrypt(file("saved.cipher"), file("playback.plain"), aad)
    assertArrayEquals(input.readBytes(), file("playback.plain").readBytes())
  }

  @Test fun wrongOwnerRejectsAndRemovesPartialPlaintext() {
    val vault = StreamingFileVault(temporary.root, primitive())
    vault.encrypt(source(), file("saved.cipher"), aad)
    rejects { vault.decrypt(file("saved.cipher"), file("playback.plain"), byteArrayOf(9)) }
    assertFalse(file("playback.plain").exists())
  }

  @Test fun wrongKeyRejectsAndRemovesPartialPlaintext() {
    StreamingFileVault(temporary.root, primitive()).encrypt(source(), file("saved.cipher"), aad)
    rejects { StreamingFileVault(temporary.root, primitive()).decrypt(file("saved.cipher"), file("playback.plain"), aad) }
    assertFalse(file("playback.plain").exists())
  }

  @Test fun lateTamperingRejectsAfterEarlierSegmentsAndCleansPlaintext() {
    val vault = StreamingFileVault(temporary.root, primitive())
    vault.encrypt(source(), file("saved.cipher"), aad)
    RandomAccessFile(file("saved.cipher"), "rw").use {
      it.seek(it.length() - 20)
      val original = it.readByte()
      it.seek(it.length() - 20)
      it.writeByte(original.toInt() xor 1)
    }
    rejects { vault.decrypt(file("saved.cipher"), file("playback.plain"), aad) }
    assertFalse(file("playback.plain").exists())
  }

  @Test fun truncatedCiphertextRejectsAndCleansPlaintext() {
    val vault = StreamingFileVault(temporary.root, primitive())
    vault.encrypt(source(), file("saved.cipher"), aad)
    RandomAccessFile(file("saved.cipher"), "rw").use { it.setLength(it.length() - 1) }
    rejects { vault.decrypt(file("saved.cipher"), file("playback.plain"), aad) }
    assertFalse(file("playback.plain").exists())
  }

  @Test fun oversizedPlaintextRejectsWithoutOutput() {
    val vault = StreamingFileVault(temporary.root, primitive())
    rejects { vault.encrypt(source(4 * 1024 * 1024 + 1), file("saved.cipher"), aad) }
    assertFalse(file("saved.cipher").exists())
  }

  @Test fun oversizedDecryptedContentRejectsAndCleansOutput() {
    val key = primitive()
    file("saved.cipher").outputStream().use { output ->
      key.newEncryptingStream(output, aad).use { encrypted ->
        repeat(4 * 1024 + 1) { encrypted.write(ByteArray(1024)) }
      }
    }
    rejects { StreamingFileVault(temporary.root, key).decrypt(file("saved.cipher"), file("playback.plain"), aad) }
    assertFalse(file("playback.plain").exists())
  }

  @Test fun encryptionPreservesExistingDestination() {
    val sentinel = byteArrayOf(2, 4, 6)
    file("saved.cipher").writeBytes(sentinel)
    rejects { StreamingFileVault(temporary.root, primitive()).encrypt(source(), file("saved.cipher"), aad) }
    assertArrayEquals(sentinel, file("saved.cipher").readBytes())
  }

  @Test fun decryptionPreservesExistingDestination() {
    val vault = StreamingFileVault(temporary.root, primitive())
    vault.encrypt(source(), file("saved.cipher"), aad)
    val sentinel = byteArrayOf(2, 4, 6)
    file("playback.plain").writeBytes(sentinel)
    rejects { vault.decrypt(file("saved.cipher"), file("playback.plain"), aad) }
    assertArrayEquals(sentinel, file("playback.plain").readBytes())
  }

  @Test fun rejectsFilesOutsideOwnedRootAndInvalidNames() {
    val vault = StreamingFileVault(temporary.root, primitive())
    val input = source()
    val outside = File(temporary.root.parentFile, "escaped.cipher")
    rejects { vault.encrypt(input, outside, aad) }
    rejects { vault.encrypt(input, file("not allowed.cipher"), aad) }
    assertFalse(outside.exists())
  }
}
