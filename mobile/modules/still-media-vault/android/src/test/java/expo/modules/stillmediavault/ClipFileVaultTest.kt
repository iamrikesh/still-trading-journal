package expo.modules.stillmediavault

import com.google.crypto.tink.KeysetHandle
import com.google.crypto.tink.RegistryConfiguration
import com.google.crypto.tink.StreamingAead
import com.google.crypto.tink.streamingaead.PredefinedStreamingAeadParameters
import com.google.crypto.tink.streamingaead.StreamingAeadConfig
import java.io.File
import java.io.RandomAccessFile
import java.nio.ByteBuffer
import java.nio.ByteOrder
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class ClipFileVaultTest {
  @get:Rule val temporary = TemporaryFolder()
  private val intent = ClipIntent("clip-1", "moment:/one", "2026-09-21T01:02:03.000Z")
  private fun file(name: String) = File(temporary.root, name)
  private fun rejects(block: () -> Unit) { assertThrows(Exception::class.java) { block() } }
  private fun key(): StreamingAead {
    StreamingAeadConfig.register()
    return KeysetHandle.generateNew(PredefinedStreamingAeadParameters.AES256_GCM_HKDF_4KB)
      .getPrimitive(RegistryConfiguration.get(), StreamingAead::class.java)
  }
  // Independent strict decoder for the fixture's specified PCM WAV layout.
  private fun wavDuration(file: File): Long {
    val bytes = file.readBytes()
    require(bytes.size == 16044)
    val b = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN)
    require(String(bytes, 0, 4) == "RIFF" && b.getInt(4) == 16036)
    require(String(bytes, 8, 8) == "WAVEfmt " && b.getInt(16) == 16)
    require(b.getShort(20).toInt() == 1 && b.getShort(22).toInt() == 1)
    require(b.getInt(24) == 8000 && b.getInt(28) == 16000)
    require(b.getShort(32).toInt() == 2 && b.getShort(34).toInt() == 16)
    require(String(bytes, 36, 4) == "data" && b.getInt(40) == 16000)
    return 1000
  }
  private fun vault(key: StreamingAead = key(), duration: (File) -> Long = ::wavDuration,
    space: () -> Long = { Long.MAX_VALUE }, sync: () -> Unit = {}): ClipFileVault =
    ClipFileVault(temporary.root, key, duration, space, sync)

  @Test fun captureReservesOwnedPathWithoutOverwritingDraftOrSavedFile() {
    val vault = vault()
    val capture = vault.captureFile(intent)
    assertEquals(file("clip-1.staging.plain"), capture)
    assertTrue(capture.isFile)
    capture.writeText("unfinished")
    rejects { vault.captureFile(intent) }
    assertEquals("unfinished", capture.readText())
    rejects { vault.captureFile(intent.copy(id = "../outside")) }
    capture.delete(); vault.prepareFixture(intent); vault.seal(intent); vault.removeStaging(intent)
    rejects { vault.captureFile(intent) }
  }

  @Test fun captureAndPlaybackRequireReservePlusWorkingSpace() {
    val key = key(); val normal = vault(key)
    val low = vault(key, space = { 100L * 1024 * 1024 })
    rejects { low.captureFile(intent) }
    assertFalse(file("clip-1.staging.plain").exists())
    normal.prepareFixture(intent); normal.seal(intent)
    rejects { low.playbackFile(intent) }
    assertFalse(file("clip-1.playback.plain").exists())
  }

  @Test fun playbackAuthenticatesWholeFileAndOwnerBeforeExposingPlaintext() {
    val vault = vault(); vault.prepareFixture(intent); vault.seal(intent)
    rejects { vault.playbackFile(intent.copy(momentId = "wrong")) }
    assertFalse(file("clip-1.playback.plain").exists())
    val playback = vault.playbackFile(intent)
    assertArrayEquals(file("clip-1.staging.plain").readBytes(), playback.readBytes())
    rejects { vault.playbackFile(intent) }
    assertTrue(playback.isFile)
    vault.removePlayback(intent); vault.removePlayback(intent)
    assertFalse(playback.exists())
    RandomAccessFile(file("clip-1.cipher"), "rw").use { it.setLength(it.length() - 1) }
    rejects { vault.playbackFile(intent) }
    assertFalse(playback.exists())
  }

  @Test fun usageCountsRetainedMediaIncludingDraftsAndWorkingCopiesButNotKeys() {
    val vault = vault(); vault.prepareFixture(intent); vault.seal(intent)
    file("protected.keyset").writeText("private")
    file("clip-2.pending.cipher").writeText("partial")
    val retained = 16044L + file("clip-1.cipher").length() + 7L
    assertEquals(retained, vault.usageBytes())
    vault.playbackFile(intent)
    assertEquals(retained + 16044L, vault.usageBytes())
    vault.removePlayback(intent)
    assertEquals(retained, vault.usageBytes())
  }

  @Test fun destructionCleansResourcesBeforeReleasingOwnership() {
    val gate = ClipOwnership(); val first = Any(); val second = Any()
    gate.initialize(first) {}
    var cleaned = false
    gate.destroy(first) {
      rejects { gate.run(first) {} }
      rejects { gate.initialize(second) {} }
      cleaned = true
    }
    assertTrue(cleaned)
    gate.initialize(second) {}
  }

  @Test fun failedDestructionCleanupBlocksReplacementOwnerUntilCleanupSucceeds() {
    val gate = ClipOwnership(); val first = Any(); val second = Any()
    gate.initialize(first) {}
    rejects { gate.destroy(first) { error("unreleased native resource") } }
    rejects { gate.initialize(second) {} }
    gate.destroy(first) {}
    gate.initialize(second) {}
  }

  @Test fun fixtureRoundtripAuthenticatesWholeStreamAndRetainsStagingUntilCommit() {
    val key = key(); val vault = vault(key)
    vault.prepareFixture(intent)
    val original = file("clip-1.staging.plain").readBytes()
    assertEquals(ClipMetadata(16044, 1000), vault.seal(intent))
    assertTrue(file("clip-1.staging.plain").exists())
    assertFalse(file("clip-1.verify.plain").exists())
    StreamingFileVault(temporary.root, key).decrypt(file("clip-1.cipher"), file("comparison.plain"), intent.aad())
    assertArrayEquals(original, file("comparison.plain").readBytes())
    vault.removeStaging(intent)
    assertFalse(file("clip-1.staging.plain").exists())
    assertEquals(ClipMetadata(16044, 1000), vault(key).verify(intent))
  }

  @Test fun finalOnlySealReopensWithoutRecreatingStaging() {
    val key = key(); val first = vault(key)
    first.prepareFixture(intent); first.seal(intent); first.removeStaging(intent)
    val encrypted = file("clip-1.cipher").readBytes()
    assertEquals(ClipMetadata(16044, 1000), vault(key).seal(intent))
    assertArrayEquals(encrypted, file("clip-1.cipher").readBytes())
    assertFalse(file("clip-1.staging.plain").exists())
  }

  @Test fun eachOwnerFieldIsAuthenticatedAndLengthPrefixesPreventAmbiguity() {
    val vault = vault(); vault.prepareFixture(intent); vault.seal(intent)
    rejects { vault.verify(intent.copy(momentId = "other")) }
    rejects { vault.verify(intent.copy(createdAt = "2026-09-22T01:02:03.000Z")) }
    file("clip-1.cipher").copyTo(file("clip-2.cipher"))
    rejects { vault.verify(intent.copy(id = "clip-2")) }
    assertFalse(ClipIntent("a", "b:c", "d").aad().contentEquals(ClipIntent("a", "b", "c:d").aad()))
    assertFalse(file("clip-1.verify.plain").exists())
  }

  @Test fun validPendingPromotesWithoutStaging() {
    val vault = vault(); vault.prepareFixture(intent); vault.seal(intent); vault.removeStaging(intent)
    assertTrue(file("clip-1.cipher").renameTo(file("clip-1.pending.cipher")))
    assertEquals(ClipMetadata(16044, 1000), vault.seal(intent))
    assertFalse(file("clip-1.pending.cipher").exists())
    assertTrue(file("clip-1.cipher").exists())
  }

  @Test fun invalidPendingRebuiltOnlyWithValidStaging() {
    val vault = vault(); vault.prepareFixture(intent)
    file("clip-1.pending.cipher").writeText("damaged")
    assertEquals(ClipMetadata(16044, 1000), vault.seal(intent))
    assertEquals(ClipMetadata(16044, 1000), vault.verify(intent))
  }

  @Test fun invalidPendingAndBadOrAbsentStagingRemainRecoverable() {
    val vault = vault(); file("clip-1.pending.cipher").writeText("damaged")
    rejects { vault.seal(intent) }
    file("clip-1.staging.plain").writeText("unfinished")
    rejects { vault.seal(intent) }
    assertEquals("damaged", file("clip-1.pending.cipher").readText())
    assertEquals("unfinished", file("clip-1.staging.plain").readText())
    assertFalse(file("clip-1.verify.plain").exists())
  }

  @Test fun damagedFinalNeverReplacedEvenWithGoodStaging() {
    val vault = vault(); vault.prepareFixture(intent); vault.seal(intent)
    RandomAccessFile(file("clip-1.cipher"), "rw").use { it.setLength(it.length() - 1) }
    val damaged = file("clip-1.cipher").readBytes()
    rejects { vault.seal(intent) }
    assertArrayEquals(damaged, file("clip-1.cipher").readBytes())
    assertTrue(file("clip-1.staging.plain").exists())
    assertFalse(file("clip-1.verify.plain").exists())
  }

  @Test fun verifyDoesNotSealMissingFinal() {
    val vault = vault(); vault.prepareFixture(intent)
    rejects { vault.verify(intent) }
    assertFalse(file("clip-1.cipher").exists())
  }

  @Test fun rejectsEmptyOversizeMalformedAndInvalidDurationsBeforeEncrypting() {
    val key = key(); val vault = vault(key)
    file("clip-1.staging.plain").writeBytes(byteArrayOf())
    rejects { vault.seal(intent) }
    RandomAccessFile(file("clip-1.staging.plain"), "rw").use { it.setLength(4194305) }
    rejects { vault.seal(intent) }
    file("clip-1.staging.plain").writeText("not audio")
    rejects { vault.seal(intent) }
    file("clip-1.staging.plain").delete(); vault.prepareFixture(intent)
    for (duration in listOf(0L, -1L, 240001L)) rejects { vault(key, { duration }).seal(intent) }
    assertFalse(file("clip-1.pending.cipher").exists())
    assertFalse(file("clip-1.cipher").exists())
  }

  @Test fun acceptsExactByteAndDurationCeilings() {
    file("clip-1.staging.plain").writeBytes(ByteArray(4194304))
    assertEquals(ClipMetadata(4194304, 240000), vault(duration = { 240000 }).seal(intent))
  }

  @Test fun invalidIdsCannotReadWriteOrDeleteOutsideOwnership() {
    val vault = vault()
    for (id in listOf("../escape", "UPPER", "", "a".repeat(65), "a/b")) {
      rejects { vault.prepareFixture(intent.copy(id = id)) }
      rejects { vault.removeAll(intent.copy(id = id)) }
      rejects { vault.inspect(id) }
    }
    assertEquals(0, temporary.root.listFiles()!!.size)
  }

  @Test fun existingVerificationDestinationPreservedOnFailure() {
    val vault = vault(); vault.prepareFixture(intent); vault.seal(intent)
    file("clip-1.verify.plain").writeText("preserve")
    rejects { vault.verify(intent) }
    assertEquals("preserve", file("clip-1.verify.plain").readText())
  }

  @Test fun startupRemovesOnlyGeneratedTransientPlaintext() {
    val vault = vault(); vault.prepareFixture(intent); vault.seal(intent)
    file("clip-1.verify.plain").writeText("temporary")
    file("clip-1.playback.plain").writeText("temporary")
    file("unrelated.plain").writeText("preserve")
    file("clip-2.pending.cipher").writeText("preserve")
    vault.cleanupTransient()
    assertFalse(file("clip-1.verify.plain").exists())
    assertFalse(file("clip-1.playback.plain").exists())
    assertTrue(file("clip-1.staging.plain").exists())
    assertTrue(file("clip-1.cipher").exists())
    assertTrue(file("clip-2.pending.cipher").exists())
    assertTrue(file("unrelated.plain").exists())
  }

  @Test fun deletionIsIdempotentAndNeverRemovesKeysOrOtherClip() {
    val vault = vault(); vault.prepareFixture(intent); vault.seal(intent)
    for (name in listOf("clip-1.pending.cipher", "clip-1.playback.plain", "clip-1.verify.plain", "protected.keyset", "clip-2.cipher")) file(name).writeText("retained")
    vault.removeAll(intent); vault.removeAll(intent)
    assertEquals(mapOf("staging" to false, "final" to false, "pending" to false, "verification" to false), vault.inspect(intent.id))
    assertFalse(file("clip-1.playback.plain").exists())
    assertTrue(file("protected.keyset").exists()); assertTrue(file("clip-2.cipher").exists())
  }

  @Test fun cleanupFailureRemainsFailureAndPreservesOtherData() {
    val vault = vault(); file("clip-1.verify.plain").mkdir()
    rejects { vault.cleanupTransient() }
    rejects { vault.removeAll(intent) }
    assertTrue(file("clip-1.verify.plain").isDirectory)
  }

  @Test fun fixtureRetryChecksExactContentAndFinalOwner() {
    val vault = vault(); vault.prepareFixture(intent); vault.prepareFixture(intent)
    vault.seal(intent); vault.prepareFixture(intent)
    rejects { vault.prepareFixture(intent.copy(momentId = "different")) }
    vault.removeAll(intent); vault.prepareFixture(intent)
    RandomAccessFile(file("clip-1.staging.plain"), "rw").use { it.seek(100); it.writeByte(99) }
    rejects { vault.prepareFixture(intent) }
  }

  @Test fun directorySyncFailureReportsFailureButRetryAuthenticatesRetainedFinal() {
    val key = key(); val failing = vault(key, sync = { error("sync failed") })
    failing.prepareFixture(intent)
    rejects { failing.seal(intent) }
    assertTrue(file("clip-1.cipher").exists()); assertTrue(file("clip-1.staging.plain").exists())
    rejects { failing.seal(intent) }
    assertEquals(ClipMetadata(16044, 1000), vault(key).seal(intent))
  }

  @Test fun lowSpaceRefusesWorkingFilesAndPreservesUsefulData() {
    val key = key(); val low = vault(key, space = { 100L * 1024 * 1024 })
    rejects { low.prepareFixture(intent) }
    assertFalse(file("clip-1.staging.plain").exists())
    val normal = vault(key); normal.prepareFixture(intent)
    rejects { low.seal(intent) }
    assertFalse(file("clip-1.pending.cipher").exists()); assertTrue(file("clip-1.staging.plain").exists())
    normal.seal(intent)
    rejects { low.verify(intent) }
    assertFalse(file("clip-1.verify.plain").exists()); assertTrue(file("clip-1.cipher").exists())
  }

  @Test fun ownershipRequiresInitializationRejectsConcurrentOwnerAndInvalidatesDestroyedInstance() {
    val gate = ClipOwnership(); val first = Any(); val second = Any()
    rejects { gate.run(first) {} }
    gate.initialize(first) {}
    rejects { gate.initialize(second) {} }
    gate.destroy(second)
    gate.run(first) {}
    gate.destroy(first)
    rejects { gate.run(first) {} }
    rejects { gate.initialize(first) {} }
    val third = Any(); gate.initialize(third) {}; gate.run(third) {}
  }

  @Test fun failedInitializationDoesNotClaimOwnership() {
    val gate = ClipOwnership(); val first = Any()
    rejects { gate.initialize(first) { error("key unavailable") } }
    rejects { gate.run(first) {} }
    gate.initialize(Any()) {}
  }

  @Test fun roleLikeIdCoexistsAndDeletionDoesNotTouchOtherClip() {
    val vault = vault(); val other = intent.copy(id = "clip-1-pending")
    vault.prepareFixture(intent); vault.prepareFixture(other)
    vault.seal(intent); vault.seal(other)
    vault.removeAll(intent)
    assertEquals(ClipMetadata(16044, 1000), vault.verify(other))
  }

  @Test fun legacyEmptyMomentIdRemainsValidData() {
    val vault = vault(); val legacy = intent.copy(momentId = "")
    vault.prepareFixture(legacy); vault.seal(legacy)
    assertEquals(ClipMetadata(16044, 1000), vault.verify(legacy))
  }

  @Test fun malformedUnicodeCannotAliasAnAuthenticatedOwner() {
    rejects { intent.copy(momentId = "\uD800").aad() }
    rejects { intent.copy(createdAt = "\uDC00").aad() }
  }

  @Test fun stagingCleanupRefusesToDeleteOnlyOriginal() {
    val vault = vault(); vault.prepareFixture(intent)
    rejects { vault.removeStaging(intent) }
    assertTrue(file("clip-1.staging.plain").exists())
  }

  @Test fun destructionInvalidatesQueuedWorkBeforeWaitingForRunningOperation() {
    val gate = ClipOwnership(); val owner = Any(); gate.initialize(owner) {}
    val destroyer = Thread { gate.destroy(owner) }
    try {
      gate.run(owner) {
        destroyer.start()
        val deadline = System.nanoTime() + 2_000_000_000L
        while (destroyer.state != Thread.State.BLOCKED && System.nanoTime() < deadline) Thread.yield()
        assertEquals(Thread.State.BLOCKED, destroyer.state)
        rejects { gate.run(owner) {} }
      }
    } finally {
      destroyer.join(2000)
    }
    assertFalse(destroyer.isAlive)
  }
}
