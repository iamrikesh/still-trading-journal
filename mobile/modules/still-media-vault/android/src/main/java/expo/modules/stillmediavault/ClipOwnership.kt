package expo.modules.stillmediavault

import java.util.Collections
import java.util.WeakHashMap

/** Static bridge instance serializes work, including init/destruction, across React reloads. */
internal class ClipOwnership {
  private var active: Any? = null
  private val destroyed = Collections.synchronizedSet(Collections.newSetFromMap(WeakHashMap<Any, Boolean>()))

  @Synchronized fun initialize(owner: Any, initialize: () -> Unit) {
    check(owner !in destroyed && (active == null || active === owner))
    initialize()
    check(owner !in destroyed)
    active = owner
  }

  @Synchronized fun <T> run(owner: Any, operation: () -> T): T {
    check(owner !in destroyed && active === owner)
    return operation()
  }

  fun destroy(owner: Any) {
    // Revoke first: queued work must fail even while destruction waits on an active operation.
    destroyed.add(owner)
    synchronized(this) {
      if (active === owner) active = null
    }
  }
}
