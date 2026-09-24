package expo.modules.stillmediavault

import java.io.File
import org.junit.Assert.*
import org.junit.Test

class AudioOperationsTest {
  private val intent = ClipIntent("clip-1", "moment", "time")
  private class Driver : AudioDriver {
    val calls = mutableListOf<String>()
    var callback: ((Boolean) -> Unit)? = null
    var stopFails = false
    var releaseFails = false
    var startFails = false
    override fun record(file: File, ended: (Boolean) -> Unit): AudioHandle {
      calls.add("record"); callback = ended
      val handle = object : AudioHandle {
        override fun stop() { calls.add("stop"); if (stopFails) error("device failure") }
        override fun release() { calls.add("release"); if (releaseFails) error("release failed") }
      }
      if (startFails) throw AudioStartFailure(handle)
      return handle
    }
    override fun play(file: File, ended: (Boolean) -> Unit): AudioHandle {
      calls.add("play"); callback = ended
      val handle = object : AudioHandle {
        override fun stop() { calls.add("stop") }
        override fun release() { calls.add("release"); if (releaseFails) error("release failed") }
      }
      if (startFails) throw AudioStartFailure(handle)
      return handle
    }
  }
  private class Fixture {
    val driver = Driver()
    var foreground = true
    var now = 0L
    val events = mutableListOf<String>()
    val audio = AudioOperations(driver, { foreground }, { now }, { it() },
      { events.add("capture"); File("capture") }, { events.add("decrypt"); File("playback") },
      { events.add("cleanup"); assertEquals("release", driver.calls.last()) })
  }

  @Test fun captureHasImmutableOwnerAndMatchingStopIsIdempotent() {
    val f = Fixture(); f.audio.startCapture(intent)
    assertThrows(Exception::class.java) { f.audio.startCapture(intent.copy(id = "clip-2")) }
    assertThrows(Exception::class.java) { f.audio.stopCapture("clip-2") }
    assertEquals("recording", f.audio.status()["state"])
    f.now = 1200; f.audio.stopCapture(intent.id); f.audio.stopCapture(intent.id)
    assertEquals(listOf("record", "stop", "release"), f.driver.calls)
    assertEquals(mapOf("id" to intent.id, "state" to "stopped", "durationMs" to 1200L), f.audio.status())
  }

  @Test fun backgroundAdmissionFailsBeforeCreatingFilesAndBackgroundNeverResumes() {
    val f = Fixture(); f.foreground = false
    assertThrows(Exception::class.java) { f.audio.startCapture(intent) }
    assertThrows(Exception::class.java) { f.audio.startPlayback(intent) }
    assertTrue(f.events.isEmpty())
    f.foreground = true; f.audio.startCapture(intent); f.audio.interrupt()
    assertEquals("stopped", f.audio.status()["state"])
    assertEquals(listOf("record", "stop", "release"), f.driver.calls)
  }

  @Test fun staleCompletionCannotStopNewOperation() {
    val f = Fixture(); f.audio.startCapture(intent)
    val old = f.driver.callback!!
    f.audio.stopCapture(intent.id); f.audio.startCapture(intent.copy(id = "clip-2"))
    old(true)
    assertEquals("recording", f.audio.status()["state"])
    assertEquals("clip-2", f.audio.status()["id"])
  }

  @Test fun stopFailureStillReleasesAndPreservesDraftForRecovery() {
    val f = Fixture(); f.audio.startCapture(intent); f.driver.stopFails = true
    f.audio.stopCapture(intent.id)
    assertEquals("failed", f.audio.status()["state"])
    assertEquals(listOf("capture"), f.events)
    assertEquals(listOf("record", "stop", "release"), f.driver.calls)
  }

  @Test fun playbackCompletionAndDestructionReleaseBeforeRemovingPlaintext() {
    val f = Fixture(); f.audio.startPlayback(intent); f.driver.callback!!(false)
    assertEquals(listOf("decrypt", "cleanup"), f.events)
    assertEquals("stopped", f.audio.status()["state"])
    f.audio.startPlayback(intent); f.audio.destroy()
    assertEquals(listOf("decrypt", "cleanup", "decrypt", "cleanup"), f.events)
    assertThrows(Exception::class.java) { f.audio.startCapture(intent) }
  }

  @Test fun affectedMutationStopsOnlyItsOwnOperation() {
    val f = Fixture(); f.audio.startCapture(intent)
    f.audio.stopAffected("clip-2")
    assertEquals("recording", f.audio.status()["state"])
    f.audio.stopAffected(intent.id)
    assertEquals("stopped", f.audio.status()["state"])
  }

  @Test fun failedReleaseRetainsPlaybackAndBlocksNewOperationUntilReleaseRetry() {
    val f = Fixture(); f.audio.startPlayback(intent); f.driver.releaseFails = true
    assertThrows(Exception::class.java) { f.audio.stopPlayback() }
    assertEquals(listOf("decrypt"), f.events)
    assertThrows(Exception::class.java) { f.audio.startCapture(intent.copy(id = "clip-2")) }
    f.driver.releaseFails = false; f.audio.stopPlayback()
    assertEquals(listOf("decrypt", "cleanup"), f.events)
  }

  @Test fun failedStartupWithUnreleasedPlayerRetainsFileAndResourceUntilRetry() {
    val f = Fixture(); f.driver.startFails = true; f.driver.releaseFails = true
    assertThrows(Exception::class.java) { f.audio.startPlayback(intent) }
    assertEquals(listOf("decrypt"), f.events)
    assertThrows(Exception::class.java) { f.audio.stopAffected(intent.id) }
    assertThrows(Exception::class.java) { f.audio.startCapture(intent.copy(id = "clip-2")) }
    f.driver.releaseFails = false; f.audio.stopPlayback()
    assertEquals(listOf("decrypt", "cleanup"), f.events)
  }

  @Test fun reusedIdCannotReplaceImmutableOwnerEvenAfterStop() {
    val f = Fixture(); f.audio.startCapture(intent); f.audio.stopCapture(intent.id)
    assertThrows(Exception::class.java) { f.audio.startCapture(intent.copy(momentId = "other")) }
    f.audio.requireOwner(intent)
  }

  @Test fun reminderOwnershipBlocksJournalStartsBeforeFileCreation() {
    val f = Fixture()
    var reminderReleased = false
    f.audio.reminderReleaseCheck = { check(reminderReleased) }
    assertThrows(Exception::class.java) { f.audio.startCapture(intent) }
    assertThrows(Exception::class.java) { f.audio.startPlayback(intent) }
    assertTrue(f.events.isEmpty())
    reminderReleased = true
    f.audio.startCapture(intent)
    f.audio.stopCapture(intent.id)
  }
}
