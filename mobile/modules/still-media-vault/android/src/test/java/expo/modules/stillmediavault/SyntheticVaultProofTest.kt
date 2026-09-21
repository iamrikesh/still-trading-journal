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

class SyntheticVaultProofTest {
  @get:Rule val temporary = TemporaryFolder()
  private val keys = mutableMapOf<String, Aead>()
  private fun proof() = SyntheticVaultProof(temporary.root) { namespace ->
    object : ProofWrappingKey {
      override fun exists() = keys.containsKey(namespace)
      override fun generate() {
        check(!exists())
        AeadConfig.register()
        keys[namespace] = KeysetHandle.generateNew(PredefinedAeadParameters.AES256_GCM).getPrimitive(RegistryConfiguration.get(), Aead::class.java)
      }
      override fun aead() = checkNotNull(keys[namespace])
      override fun delete() { keys.remove(namespace) }
    }
  }

  @Test fun verifyRequiresExplicitPreparation() {
    assertThrows(Exception::class.java) { proof().verify() }
    assertTrue(keys.isEmpty())
    assertFalse(File(temporary.root, "persistent").exists())
  }

  @Test fun prepareIsIdempotentAndNewInstanceVerifiesEveryCheck() {
    assertEquals(65536, proof().prepare())
    val ciphertext = File(temporary.root, "persistent/fixture.cipher").readBytes()
    assertEquals(65536, proof().prepare())
    assertArrayEquals(ciphertext, File(temporary.root, "persistent/fixture.cipher").readBytes())
    assertEquals(setOf("roundtrip", "wrong-key", "wrong-owner", "tamper", "truncation", "oversize", "destination-preserved", "plaintext-cleanup", "key-loss-fail-closed", "keyset-loss-fail-closed"), proof().verify().toSet())
    assertEquals(setOf("persistent"), keys.keys)
    assertFalse(temporary.root.walkTopDown().any { it.isFile && it.extension == "plain" })
  }

  @Test fun lostPersistentKeyIsNeverReplacedByPrepareOrVerify() {
    proof().prepare()
    keys.remove("persistent")
    val ciphertext = File(temporary.root, "persistent/fixture.cipher").readBytes()
    assertThrows(Exception::class.java) { proof().prepare() }
    assertThrows(Exception::class.java) { proof().verify() }
    assertTrue(keys.isEmpty())
    assertArrayEquals(ciphertext, File(temporary.root, "persistent/fixture.cipher").readBytes())
  }

  @Test fun damagedPersistentFixtureIsNeverRecreated() {
    proof().prepare()
    File(temporary.root, "persistent/fixture.cipher").writeText("corrupt")
    assertThrows(Exception::class.java) { proof().prepare() }
    assertEquals("corrupt", File(temporary.root, "persistent/fixture.cipher").readText())
    assertFalse(temporary.root.walkTopDown().any { it.isFile && it.extension == "plain" })
  }

  @Test fun restartRemovesOnlyKnownSyntheticPlaintextWhileKeepingFixture() {
    proof().prepare()
    File(temporary.root, "persistent/fixture-source.plain").writeText("interrupted synthetic input")
    File(temporary.root, "persistent/fixture-readable.plain").writeText("interrupted verification")
    val ciphertext = File(temporary.root, "persistent/fixture.cipher").readBytes()
    proof().verify()
    assertArrayEquals(ciphertext, File(temporary.root, "persistent/fixture.cipher").readBytes())
    assertFalse(temporary.root.walkTopDown().any { it.isFile && it.extension == "plain" })
  }
}
