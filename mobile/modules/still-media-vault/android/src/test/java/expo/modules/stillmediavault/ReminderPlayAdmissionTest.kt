package expo.modules.stillmediavault

import org.junit.Assert.*
import org.junit.Test

class ReminderPlayAdmissionTest {
  @Test fun stopOrBackgroundRevokesPlayThatWasStillDecoding() {
    val admission = ReminderPlayAdmission()
    val pending = admission.ticket()
    admission.revoke()
    assertThrows(Exception::class.java) { admission.requireCurrent(pending) }
    admission.requireCurrent(admission.ticket())
  }
}
