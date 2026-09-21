package expo.modules.stillmediavault

import com.google.crypto.tink.StreamingAead
import java.io.File
import java.io.RandomAccessFile

internal interface ProofWrappingKey : WrappingKey {
  fun delete()
}

/** Disposable diagnostics only. This namespace must never contain journal or recorded media. */
internal class SyntheticVaultProof(
  private val root: File,
  private val wrapping: (String) -> ProofWrappingKey,
) {
  @Synchronized fun prepare(): Int {
    val persistent = namespace("persistent", create = true)
    val fixture = File(persistent, "fixture.cipher")
    val files = OwnedFiles(persistent)
    val key = wrapping("persistent")
    val isEmpty = checkNotNull(persistent.listFiles()).isEmpty()
    if (isEmpty && !key.exists()) {
      val streaming = ProtectedKeyset(persistent, key).open(create = true)
      val source = File(persistent, "fixture-source.plain")
      try {
        writeFixture(files, source)
        StreamingFileVault(persistent, streaming).encrypt(source, fixture, AAD)
      } finally {
        files.remove(source)
      }
    }
    // An incomplete/corrupted prior preparation is never repaired or re-keyed.
    verifyPersistent()
    return FIXTURE_BYTES
  }

  @Synchronized fun verify(): List<String> {
    val persistentStream = verifyPersistent()
    val checks = mutableListOf("roundtrip")
    disposable("checks") { scratch, scratchKey ->
      val files = OwnedFiles(scratch)
      val vault = StreamingFileVault(scratch, persistentStream)
      val saved = File(scratch, "saved.cipher")
      copyNew(files, File(namespace("persistent", false), "fixture.cipher"), saved)

      val wrongStream = ProtectedKeyset(scratch, scratchKey)
      // This keyset was initialized by disposable before the ciphertext copy.
      val wrongVault = StreamingFileVault(scratch, wrongStream.open(create = false))
      val output = File(scratch, "playback.plain")
      rejected { wrongVault.decrypt(saved, output, AAD) }
      check(!output.exists())
      checks += "wrong-key"

      rejected { vault.decrypt(saved, output, "wrong-owner".toByteArray()) }
      check(!output.exists())
      checks += "wrong-owner"

      val tampered = File(scratch, "tampered.cipher")
      copyNew(files, saved, tampered)
      RandomAccessFile(tampered, "rw").use {
        it.seek(it.length() - 20)
        val original = it.readByte()
        it.seek(it.length() - 20)
        it.writeByte(original.toInt() xor 1)
      }
      rejected { vault.decrypt(tampered, output, AAD) }
      check(!output.exists())
      checks += "tamper"

      val truncated = File(scratch, "truncated.cipher")
      copyNew(files, saved, truncated)
      RandomAccessFile(truncated, "rw").use { it.setLength(it.length() - 1) }
      rejected { vault.decrypt(truncated, output, AAD) }
      check(!output.exists())
      checks += "truncation"
      checks += "plaintext-cleanup"

      val oversized = File(scratch, "oversized.plain")
      files.writeNew(oversized) { }
      RandomAccessFile(oversized, "rw").use { it.setLength(StreamingFileVault.MAX_PLAINTEXT_BYTES + 1) }
      val tooLarge = File(scratch, "oversized.cipher")
      rejected { vault.encrypt(oversized, tooLarge, AAD) }
      check(!tooLarge.exists())
      files.remove(oversized)
      checks += "oversize"

      files.writeNew(output) { it.write(byteArrayOf(2, 4, 6)) }
      rejected { vault.decrypt(saved, output, AAD) }
      check(output.readBytes().contentEquals(byteArrayOf(2, 4, 6)))
      checks += "destination-preserved"
    }

    for ((name, lostKey) in listOf("missing-key" to true, "missing-keyset" to false)) {
      disposable(name) { scratch, key ->
        val files = OwnedFiles(scratch)
        val source = File(scratch, "fixture-source.plain")
        val cipher = File(scratch, "fixture.cipher")
        writeFixture(files, source)
        StreamingFileVault(scratch, ProtectedKeyset(scratch, key).open(create = false)).encrypt(source, cipher, AAD)
        files.remove(source)
        val ciphertextDigest = digest(cipher)
        if (lostKey) key.delete() else files.remove(File(scratch, "protected.keyset"))
        rejected { ProtectedKeyset(scratch, key).open(create = true) }
        rejected { ProtectedKeyset(scratch, key).open(create = false) }
        check(digest(cipher).contentEquals(ciphertextDigest))
        check(if (lostKey) !key.exists() else !File(scratch, "protected.keyset").exists())
      }
      checks += if (lostKey) "key-loss-fail-closed" else "keyset-loss-fail-closed"
    }
    return checks
  }

  private fun verifyPersistent(): StreamingAead {
    val persistent = namespace("persistent", create = false)
    val files = OwnedFiles(persistent)
    val fixture = File(persistent, "fixture.cipher")
    files.input(fixture, StreamingFileVault.MAX_CIPHERTEXT_BYTES)
    val streaming = ProtectedKeyset(persistent, wrapping("persistent")).open(create = false)
    val output = File(persistent, "fixture-readable.plain")
    // Only this generated, reproducible verification output may be removed on restart.
    files.remove(output)
    try {
      StreamingFileVault(persistent, streaming).decrypt(fixture, output, AAD)
      checkFixture(output)
      // A kill between encryption and cleanup can leave this generated input behind.
      // Remove it only after proving the retained ciphertext still contains the fixture.
      files.remove(File(persistent, "fixture-source.plain"))
    } finally {
      files.remove(output)
    }
    return streaming
  }

  private fun namespace(name: String, create: Boolean): File {
    require(name in setOf("persistent", "checks", "missing-key", "missing-keyset"))
    check(root.isDirectory && root.canonicalFile == root.absoluteFile)
    val directory = File(root, name)
    check(directory.canonicalFile == directory.absoluteFile)
    if (create && !directory.exists()) check(directory.mkdir())
    check(directory.isDirectory)
    return directory
  }

  private fun disposable(name: String, action: (File, ProofWrappingKey) -> Unit) {
    require(name != "persistent")
    val directory = namespace(name, create = true)
    val key = wrapping(name)
    fun cleanup() {
      val files = OwnedFiles(directory)
      // Fixed, isolated synthetic namespace; no recursive traversal or journal aliases.
      val children = checkNotNull(directory.listFiles())
      check(children.size <= 16)
      children.forEach { files.remove(it) }
      key.delete()
    }
    cleanup()
    try {
      ProtectedKeyset(directory, key).open(create = true)
      action(directory, key)
    } finally {
      cleanup()
      check(directory.delete())
    }
  }

  private fun copyNew(files: OwnedFiles, input: File, destination: File) {
    require(input.isFile && input.length() <= StreamingFileVault.MAX_CIPHERTEXT_BYTES)
    files.writeNew(destination) { output ->
      input.inputStream().use { StreamingFileVault.copyBounded(it, output, StreamingFileVault.MAX_CIPHERTEXT_BYTES) }
    }
  }

  private fun writeFixture(files: OwnedFiles, file: File) {
    val chunk = ByteArray(8192) { (it * 31).toByte() }
    files.writeNew(file) { output -> repeat(FIXTURE_BYTES / chunk.size) { output.write(chunk) } }
  }

  private fun checkFixture(file: File) {
    check(file.length() == FIXTURE_BYTES.toLong())
    file.inputStream().buffered(8192).use { input ->
      repeat(FIXTURE_BYTES) { check(input.read() == ((it * 31) and 255)) }
      check(input.read() == -1)
    }
  }

  private fun digest(file: File): ByteArray {
    val digest = java.security.MessageDigest.getInstance("SHA-256")
    file.inputStream().use { input ->
      val buffer = ByteArray(8192)
      while (true) {
        val count = input.read(buffer)
        if (count < 0) break
        digest.update(buffer, 0, count)
      }
    }
    return digest.digest()
  }

  private fun rejected(action: () -> Unit) {
    var failed = false
    try { action() } catch (_: Exception) { failed = true }
    check(failed)
  }

  companion object {
    const val FIXTURE_BYTES = 65536
    private val AAD = "still-proof-v1:synthetic-moment:synthetic-clip".toByteArray(Charsets.UTF_8)
  }
}
