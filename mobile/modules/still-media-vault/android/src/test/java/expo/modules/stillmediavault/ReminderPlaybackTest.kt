package expo.modules.stillmediavault

import java.io.File
import org.junit.Assert.*
import org.junit.Test

class ReminderPlaybackTest {
  private class Driver : AudioDriver {
    var callback: ((Boolean) -> Unit)? = null
    var releaseFails = false
    var plays = 0
    override fun record(file: File, ended: (Boolean) -> Unit): AudioHandle = error("unexpected")
    override fun play(file: File, ended: (Boolean) -> Unit): AudioHandle {
      plays++
      callback = ended
      return object : AudioHandle {
        override fun stop() {}
        override fun release() { if (releaseFails) error("release") }
      }
    }
  }

  @Test fun failedReleaseRetainsOwnershipUntilRetryAndBlocksJournal() {
    val file = File.createTempFile("reminder", ".tmp")
    file.delete()
    try {
      val driver = Driver()
      val reminder = ReminderPlayback(driver, { true }, { 0L }, { it() }, file)
      reminder.play(byteArrayOf(1), 1000)
      driver.releaseFails = true
      assertThrows(Exception::class.java) { reminder.stop() }
      assertEquals("cleanup", reminder.status()["state"])
      assertTrue(file.exists())
      assertThrows(Exception::class.java) { reminder.requireReleased() }
      driver.releaseFails = false
      reminder.stop()
      reminder.requireReleased()
      assertFalse(file.exists())
    } finally { file.delete() }
  }

  @Test fun staleCompletionDoesNotStopLaterPlaybackAndJournalBlocksAdmission() {
    val file = File.createTempFile("reminder", ".tmp")
    file.delete()
    try {
      val driver = Driver()
      var journalReleased = false
      val reminder = ReminderPlayback(driver, { true }, { 0L }, { it() }, file) { check(journalReleased) }
      assertThrows(Exception::class.java) { reminder.play(byteArrayOf(1), 1000) }
      assertEquals(0, driver.plays)
      journalReleased = true
      reminder.play(byteArrayOf(1), 1000)
      val old = driver.callback!!
      reminder.stop()
      reminder.play(byteArrayOf(2), 1000)
      old(false)
      assertEquals("playing", reminder.status()["state"])
      reminder.stop()
    } finally { file.delete() }
  }

  @Test fun failedTempRemovalRetainsObligationAndRefusesNewPlay() {
    val file = File.createTempFile("reminder", ".tmp")
    file.delete()
    try {
      val driver = Driver()
      var removeFails = true
      val reminder = ReminderPlayback(driver, { true }, { 0L }, { it() }, file,
        removeFile = { target -> if (removeFails) error("delete failed") else check(target.delete()) })
      reminder.play(byteArrayOf(1), 1000)
      assertThrows(Exception::class.java) { reminder.stop() }
      assertEquals("cleanup", reminder.status()["state"])
      assertThrows(Exception::class.java) { reminder.play(byteArrayOf(2), 1000) }
      removeFails = false
      reminder.stop()
      reminder.requireReleased()
      assertFalse(file.exists())
    } finally { file.delete() }
  }
}
