package expo.modules.stillmediavault

import android.content.pm.ApplicationInfo
import com.google.crypto.tink.integration.android.AndroidKeystore
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class StillMediaVaultModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("StillMediaVault")
    AsyncFunction("prepareProof") {
      guarded { proof -> mapOf("fixtureBytes" to proof.prepare()) }
    }
    AsyncFunction("verifyProof") {
      guarded { proof -> mapOf("checks" to proof.verify(), "fixtureBytes" to SyntheticVaultProof.FIXTURE_BYTES) }
    }
  }

  private fun <T> guarded(operation: (SyntheticVaultProof) -> T): T = synchronized(PROOF_LOCK) {
    try {
      val context = checkNotNull(appContext.reactContext)
      // Both guards are native: JavaScript cannot enable proof operations in a release app.
      check(BuildConfig.DEBUG && (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE) != 0)
      val parent = context.noBackupFilesDir.canonicalFile
      val root = File(parent, "still-media-vault-synthetic-proof-v1")
      check(root.canonicalFile == root.absoluteFile)
      if (!root.exists()) check(root.mkdir())
      check(root.isDirectory)
      operation(SyntheticVaultProof(root) { namespace -> AndroidProofWrappingKey(namespace) })
    } catch (_: Exception) {
      // Do not attach the original cause: Expo otherwise serializes private native details.
      throw CodedException("ERR_MEDIA_VAULT_PROOF", "The synthetic media proof could not complete.", null)
    }
  }

  private class AndroidProofWrappingKey(namespace: String) : ProofWrappingKey {
    private val alias: String
    init {
      require(namespace in setOf("persistent", "checks", "missing-key", "missing-keyset"))
      alias = "still.media-vault.synthetic-proof.v1.$namespace"
    }
    override fun exists() = AndroidKeystore.hasKey(alias)
    override fun generate() {
      // Tink's generation API overwrites an existing alias; explicitly forbid that first.
      check(!exists())
      AndroidKeystore.generateNewAes256GcmKey(alias)
    }
    override fun aead() = AndroidKeystore.getAead(alias)
    override fun delete() {
      check(!alias.endsWith(".persistent"))
      AndroidKeystore.deleteKey(alias)
    }
  }

  companion object {
    // One owner even across React reloads/module instances. Never runs on the UI thread.
    private val PROOF_LOCK = Any()
  }
}
