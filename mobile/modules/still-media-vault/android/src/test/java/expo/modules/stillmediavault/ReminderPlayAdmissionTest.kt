package expo.modules.stillmediavault

import org.junit.Assert.*
import org.junit.Test
import kotlinx.coroutines.asCoroutineDispatcher
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class ReminderPlayAdmissionTest {
  @Test fun stopOrBackgroundRevokesPlayThatWasStillDecoding() {
    val admission = ReminderPlayAdmission()
    val pending = admission.ticket()
    admission.revoke()
    assertThrows(Exception::class.java) { admission.requireCurrent(pending) }
    admission.requireCurrent(admission.ticket())
  }

  @Test fun stopRunsOnModuleQueueWhileValidationIsHeldAndPreventsDriverStart() = runBlocking {
    val queue = Executors.newSingleThreadExecutor().asCoroutineDispatcher()
    try {
      val admission = ReminderPlayAdmission()
      val entered = CountDownLatch(1)
      val release = CountDownLatch(1)
      var starts = 0
      val play = launch(queue) {
        try {
          admission.validateOffQueue(
            validate = { entered.countDown(); check(release.await(2, TimeUnit.SECONDS)); 1 },
            start = { ticket, _ -> admission.requireCurrent(ticket); starts++ },
          )
        } catch (_: IllegalStateException) { /* Revocation is the expected result. */ }
      }
      assertTrue(entered.await(2, TimeUnit.SECONDS))
      withTimeout(1000) { withContext(queue) { admission.revoke() } }
      release.countDown()
      play.join()
      assertEquals(0, starts)
    } finally { queue.close() }
  }
}
