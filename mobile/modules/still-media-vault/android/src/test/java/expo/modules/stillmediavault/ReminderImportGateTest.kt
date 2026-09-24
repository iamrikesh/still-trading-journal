package expo.modules.stillmediavault

import java.io.ByteArrayInputStream
import java.io.Closeable
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import org.junit.Assert.*
import org.junit.Test

class ReminderImportGateTest {
  private class Stream : ByteArrayInputStream(byteArrayOf(1)) {
    @Volatile var closed = false
    val closedSignal = CountDownLatch(1)
    override fun close() { closed = true; closedSignal.countDown(); super.close() }
  }

  private fun beginEventually(gate: ReminderImportGate) {
    val deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(2)
    while (true) {
      try { gate.finish(gate.begin()); return }
      catch (_: IllegalStateException) { if (System.nanoTime() > deadline) error("close obligation did not finish") }
      Thread.yield()
    }
  }

  @Test fun cancellationClosesAcquiredStreamAndRetainsSingleWorkerExclusion() {
    val gate = ReminderImportGate()
    val ticket = gate.begin()
    val stream = Stream()
    gate.attach(ticket, stream)
    gate.cancel(ticket)
    assertTrue(stream.closedSignal.await(2, TimeUnit.SECONDS))
    assertThrows(Exception::class.java) { gate.begin() }
    gate.finish(ticket)
    beginEventually(gate)
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
    current.close() // The import worker closes its normally acquired stream.
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
    val owned = Closeable { closing.countDown(); release.await(2, TimeUnit.SECONDS) }
    gate.attach(ticket, owned)
    val worker = Thread { owned.close(); gate.finish(ticket) }
    worker.start()
    try {
      assertTrue(closing.await(2, TimeUnit.SECONDS))
      assertThrows(Exception::class.java) { gate.begin() }
    } finally {
      release.countDown()
      worker.join(2000)
    }
    beginEventually(gate)
  }

  @Test fun cancellationCloseDoesNotBlockLifecycleAndRetainsAdmissionAfterWorkerExit() {
    val gate = ReminderImportGate()
    val ticket = gate.begin()
    val closing = CountDownLatch(1)
    val release = CountDownLatch(1)
    gate.attach(ticket, Closeable { closing.countDown(); release.await(2, TimeUnit.SECONDS) })
    val lifecycle = Thread { gate.cancel(ticket) }
    lifecycle.start()
    try {
      assertTrue(closing.await(2, TimeUnit.SECONDS))
      lifecycle.join(250)
      assertFalse("provider close must not block lifecycle release", lifecycle.isAlive)
      gate.finish(ticket) // Import worker exits while the close attempt still owns the provider.
      assertThrows(Exception::class.java) { gate.begin() }
    } finally {
      release.countDown()
      lifecycle.join(2000)
    }
    beginEventually(gate)
  }
}
