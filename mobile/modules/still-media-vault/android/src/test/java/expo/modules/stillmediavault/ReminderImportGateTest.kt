package expo.modules.stillmediavault

import java.io.ByteArrayInputStream
import java.io.Closeable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.*
import org.junit.Test

class ReminderImportGateTest {
  private class Stream : ByteArrayInputStream(byteArrayOf(1)) {
    var closed = false
    override fun close() { closed = true; super.close() }
  }

  @Test fun cancellationClosesAcquiredStreamAndRetainsSingleWorkerExclusion() {
    val gate = ReminderImportGate()
    val ticket = gate.begin()
    val stream = Stream()
    gate.attach(ticket, stream)
    gate.cancel(ticket)
    assertTrue(stream.closed)
    assertThrows(Exception::class.java) { gate.begin() }
    gate.finish(ticket)
    gate.finish(gate.begin())
  }

  @Test fun streamArrivingAfterCancellationIsClosedImmediately() {
    val gate = ReminderImportGate()
    val ticket = gate.begin()
    gate.cancel(ticket)
    val late = Stream()
    assertThrows(Exception::class.java) { gate.attach(ticket, late) }
    assertTrue(late.closed)
    gate.finish(ticket)
  }

  @Test fun oldTimeoutCannotCancelOrFinishNextSelection() {
    val gate = ReminderImportGate()
    val first = gate.begin()
    gate.finish(first)
    val second = gate.begin()
    val current = Stream()
    gate.attach(second, current)
    gate.cancel(first)
    gate.finish(first)
    assertFalse(current.closed)
    assertThrows(Exception::class.java) { gate.begin() }
    gate.finish(second)
    assertTrue(current.closed)
  }

  @Test fun cancellationBeforeWorkerStartsKeepsAdmissionUntilCompletionHandler() {
    val gate = ReminderImportGate()
    val ticket = gate.begin()
    gate.cancel(ticket)
    assertThrows(Exception::class.java) { gate.begin() }
    gate.finish(ticket)
    gate.finish(gate.begin())
  }

  @Test fun slowStreamCloseKeepsAdmissionUntilWorkerActuallyExits() {
    val gate = ReminderImportGate()
    val ticket = gate.begin()
    val closing = CountDownLatch(1)
    val release = CountDownLatch(1)
    gate.attach(ticket, Closeable { closing.countDown(); release.await(2, TimeUnit.SECONDS) })
    val worker = Thread { gate.finish(ticket) }
    worker.start()
    try {
      assertTrue(closing.await(2, TimeUnit.SECONDS))
      assertThrows(Exception::class.java) { gate.begin() }
    } finally {
      release.countDown()
      worker.join(2000)
    }
    gate.finish(gate.begin())
  }
}
