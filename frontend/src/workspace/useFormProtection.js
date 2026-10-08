import { useCallback, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { updateProtection } from '../domain/updateProtection'
import { navigationProtection } from '../domain/navigationProtection'

export function useUpdateBlocked() {
  return useSyncExternalStore(updateProtection.subscribe, updateProtection.getSnapshot)
}

export function useFormProtection(busy = false, editing = false, initialDirty = false) {
  const [key] = useState(() => Symbol('form'))
  const [dirty, setDirty] = useState(initialDirty)
  const released = useRef(false)
  useLayoutEffect(() => {
    updateProtection.set(key, dirty || busy || editing)
    return () => updateProtection.remove(key)
  }, [key, dirty, busy, editing])
  useLayoutEffect(() => {
    if (!released.current) navigationProtection.set(key, { dirty, busy })
    if (!busy) released.current = false
    return () => navigationProtection.remove(key)
  }, [key, dirty, busy])
  const markDirty = useCallback(() => {
    released.current = false
    navigationProtection.set(key, { dirty: true, busy: false })
    updateProtection.set(key, true)
    setDirty(true)
  }, [key])
  const clear = useCallback(() => {
    released.current = true
    navigationProtection.remove(key)
    updateProtection.set(key, busy || editing)
    setDirty(false)
  }, [key, busy, editing])
  return { dirty, markDirty, clear }
}
