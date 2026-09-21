package expo.modules.stillmediavault

import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.StreamingAead
import com.google.crypto.tink.TinkJsonProtoKeysetFormat
import com.google.crypto.tink.streamingaead.PredefinedStreamingAeadParameters
import com.google.crypto.tink.streamingaead.StreamingAeadConfig
import java.io.File

internal interface WrappingKey {
  fun exists(): Boolean
  fun generate()
  fun aead(): Aead
}

/** No AndroidKeysetManager fallback: only an explicitly encrypted keyset is accepted. */
internal class ProtectedKeyset(private val root: File, private val wrapping: WrappingKey) {
  @Synchronized fun open(create: Boolean): StreamingAead {
    val files = OwnedFiles(root)
    val keyset = File(root, "protected.keyset")
    files.validate(keyset)
    val hasWrapping = wrapping.exists()
    val hasKeyset = keyset.exists()
    StreamingAeadConfig.register()

    if (!hasWrapping || !hasKeyset) {
      // Any orphaned key, partial keyset, media or staging file blocks initialization.
      check(create && !hasWrapping && !hasKeyset && checkNotNull(root.listFiles()).isEmpty())
      wrapping.generate()
      val generated = KeysetHandle.generateNew(PredefinedStreamingAeadParameters.AES256_GCM_HKDF_4KB)
      val encrypted = TinkJsonProtoKeysetFormat.serializeEncryptedKeyset(generated, wrapping.aead(), KEYSET_AAD, RegistryConfiguration.get())
        .toByteArray(Charsets.UTF_8)
      check(encrypted.size <= MAX_KEYSET_BYTES)
      files.writeNew(keyset) { it.write(encrypted) }
    }

    files.input(keyset, MAX_KEYSET_BYTES.toLong())
    val encrypted = keyset.inputStream().use { input ->
      // The keyset is tiny and bounded separately from streaming media.
      val bytes = input.readBytesBounded(MAX_KEYSET_BYTES)
      String(bytes, Charsets.UTF_8)
    }
    return TinkJsonProtoKeysetFormat.parseEncryptedKeyset(encrypted, wrapping.aead(), KEYSET_AAD, RegistryConfiguration.get())
      .getPrimitive(RegistryConfiguration.get(), StreamingAead::class.java)
  }

  private fun java.io.InputStream.readBytesBounded(limit: Int): ByteArray {
    val output = java.io.ByteArrayOutputStream()
    StreamingFileVault.copyBounded(this, output, limit.toLong())
    return output.toByteArray()
  }

  companion object {
    private const val MAX_KEYSET_BYTES = 16 * 1024
    private val KEYSET_AAD = "still-media-vault-proof:keyset:v1".toByteArray(Charsets.UTF_8)
  }
}
