import { useCallback, useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { updateProtection } from '../domain/updateProtection'

export function useUpdateBlocked() {
  return useSyncExternalStore(updateProtection.subscribe, updateProtection.getSnapshot)
}

export function useFormProtection(busy = false, editing = false, initialDirty = false) {
  const [key] = useState(() => Symbol('form'))
  const [dirty, setDirty] = useState(initialDirty)
  useLayoutEffect(() => {
    updateProtection.set(key, dirty || busy || editing)
    return () => updateProtection.remove(key)
  }, [key, dirty, busy, editing])
  useEffect(() => {
    if (!dirty && !busy) return
    const warn = event => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, busy])
  const markDirty = useCallback(() => {
    updateProtection.set(key, true)
    setDirty(true)
  }, [key])
  const clear = useCallback(() => {
    updateProtection.set(key, busy || editing)
    setDirty(false)
  }, [key, busy, editing])
  return { dirty, markDirty, clear }
}
