package expo.modules.stillmediavault

import com.google.crypto.tink.Aead
import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.aead.AeadConfig
import com.google.crypto.tink.aead.PredefinedAeadParameters
import java.io.File
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ProtectedKeysetTest {
  @get:Rule val temporary = TemporaryFolder()

  private class TestWrappingKey : WrappingKey {
    var key: Aead? = null
    var generations = 0
    override fun exists() = key != null
    override fun generate() {
      check(key == null)
      AeadConfig.register()
      key = KeysetHandle.generateNew(PredefinedAeadParameters.AES256_GCM).getPrimitive(RegistryConfiguration.get(), Aead::class.java)
      generations++
    }
    override fun aead() = checkNotNull(key)
  }

  @Test fun persistsEncryptedKeysetAndReopensSameStreamKey() {
    val wrapping = TestWrappingKey()
    val initial = ProtectedKeyset(temporary.root, wrapping).open(create = true)
    val input = File(temporary.root, "input.plain").apply { writeText("generated test data") }
    StreamingFileVault(temporary.root, initial).encrypt(input, File(temporary.root, "saved.cipher"), byteArrayOf(1))
    val reopened = ProtectedKeyset(temporary.root, wrapping).open(create = false)
    StreamingFileVault(temporary.root, reopened).decrypt(File(temporary.root, "saved.cipher"), File(temporary.root, "output.plain"), byteArrayOf(1))
    assertEquals(input.readText(), File(temporary.root, "output.plain").readText())
    assertEquals(1, wrapping.generations)
    assertTrue(File(temporary.root, "protected.keyset").readText().contains("encryptedKeyset"))
    assertFalse(File(temporary.root, "protected.keyset").readText().contains("keyValue"))
  }

  @Test fun verifyNeverCreatesKey() {
    val wrapping = TestWrappingKey()
    assertThrows(Exception::class.java) { ProtectedKeyset(temporary.root, wrapping).open(create = false) }
    assertEquals(0, wrapping.generations)
    assertEquals(0, temporary.root.listFiles()!!.size)
  }

  @Test fun lostWrappingKeyCannotBeReplaced() {
    val wrapping = TestWrappingKey()
    ProtectedKeyset(temporary.root, wrapping).open(create = true)
    val encrypted = File(temporary.root, "protected.keyset").readBytes()
    wrapping.key = null
    assertThrows(Exception::class.java) { ProtectedKeyset(temporary.root, wrapping).open(create = true) }
    assertEquals(1, wrapping.generations)
    assertArrayEquals(encrypted, File(temporary.root, "protected.keyset").readBytes())
  }

  @Test fun lostKeysetCannotBeReplaced() {
    val wrapping = TestWrappingKey()
    ProtectedKeyset(temporary.root, wrapping).open(create = true)
    assertTrue(File(temporary.root, "protected.keyset").delete())
    assertThrows(Exception::class.java) { ProtectedKeyset(temporary.root, wrapping).open(create = true) }
    assertEquals(1, wrapping.generations)
    assertFalse(File(temporary.root, "protected.keyset").exists())
  }

  @Test fun existingDataWithoutKeysBlocksInitialization() {
    val wrapping = TestWrappingKey()
    File(temporary.root, "saved.cipher").writeText("preserve me")
    assertThrows(Exception::class.java) { ProtectedKeyset(temporary.root, wrapping).open(create = true) }
    assertEquals(0, wrapping.generations)
    assertEquals("preserve me", File(temporary.root, "saved.cipher").readText())
  }

  @Test fun damagedKeysetIsNotRepaired() {
    val wrapping = TestWrappingKey()
    ProtectedKeyset(temporary.root, wrapping).open(create = true)
    File(temporary.root, "protected.keyset").writeText("corrupt")
    assertThrows(Exception::class.java) { ProtectedKeyset(temporary.root, wrapping).open(create = true) }
    assertEquals("corrupt", File(temporary.root, "protected.keyset").readText())
    assertEquals(1, wrapping.generations)
  }

  @Test fun clipKeysetDomainCannotOpenAsProofOrAnotherDomain() {
    val wrapping = TestWrappingKey()
    val aad = "still-clips:keyset:v1".toByteArray()
    ProtectedKeyset(temporary.root, wrapping, aad).open(create = true)
    ProtectedKeyset(temporary.root, wrapping, aad).open(create = false)
    assertThrows(Exception::class.java) { ProtectedKeyset(temporary.root, wrapping).open(create = true) }
    assertThrows(Exception::class.java) { ProtectedKeyset(temporary.root, wrapping, byteArrayOf(1)).open(create = true) }
    assertEquals(1, wrapping.generations)
  }
}
