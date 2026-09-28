export function createProtectionStore() {
  const entries = new Map()
  const listeners = new Set()
  let blocked = false
  function publish() {
    const next = [...entries.values()].some(Boolean)
    if (next === blocked) return
    blocked = next
    listeners.forEach(listener => listener())
  }
  return {
    getSnapshot: () => blocked,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener) },
    set: (key, value) => { entries.set(key, value); publish() },
    remove: key => { entries.delete(key); publish() },
  }
}

export function createUpdateCoordinator({ isBlocked, isOnline, reload, onReady }) {
  let requested = false
  let activated = false
  return {
    async apply(activate) {
      if (isBlocked() || !isOnline()) return false
      if (activated) { reload(); return true }
      requested = true
      try { await activate(); return true }
      catch (error) { requested = false; throw error }
    },
    activated() {
      if (activated) return
      activated = true
      const canReload = requested && !isBlocked() && isOnline()
      requested = false
      if (canReload) reload()
      else onReady()
    },
  }
}

export const updateProtection = createProtectionStore()
