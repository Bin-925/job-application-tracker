export function createNavigationProtection() {
  const entries = new Map()
  const listeners = new Set()
  let snapshot = { blocked: false, busy: false }
  function publish() {
    const values = [...entries.values()]
    const busy = values.some(value => value.busy)
    const blocked = busy || values.some(value => value.dirty)
    if (snapshot.blocked === blocked && snapshot.busy === busy) return
    snapshot = { blocked, busy }
    listeners.forEach(listener => listener())
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    set(key, value) { entries.set(key, value); publish() },
    remove(key) { entries.delete(key); publish() },
    clear() { entries.clear(); publish() },
  }
}

export const navigationProtection = createNavigationProtection()
