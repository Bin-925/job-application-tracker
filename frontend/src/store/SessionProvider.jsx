import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api/client'
import { AUTH_CHANGED, AUTH_STORAGE_KEY, discardLegacyToken } from './auth'
import { SessionContext } from './sessionContext'

export function SessionProvider({ children }) {
  const [session, setSession] = useState({ status: 'checking', member: null })
  const revision = useRef(0)
  const refreshSession = useCallback(async () => {
    const current = ++revision.current
    try {
      const { data } = await api.get('/members/me')
      if (current === revision.current) setSession({ status: 'authenticated', member: data })
      return data
    } catch (error) {
      if (current === revision.current) setSession({ status: error.response?.status === 401 ? 'anonymous' : 'error', member: null })
      return null
    }
  }, [])
  useEffect(() => {
    let active = true
    discardLegacyToken()
    queueMicrotask(() => { if (active) refreshSession() })
    const expired = () => { ++revision.current; setSession({ status: 'anonymous', member: null }) }
    const changed = () => { setSession({ status: 'checking', member: null }); refreshSession() }
    const storage = event => { if (event.key === AUTH_STORAGE_KEY) changed() }
    window.addEventListener('auth-expired', expired)
    window.addEventListener(AUTH_CHANGED, changed)
    window.addEventListener('storage', storage)
    window.addEventListener('focus', refreshSession)
    window.addEventListener('online', refreshSession)
    return () => {
      active = false
      window.removeEventListener('auth-expired', expired)
      window.removeEventListener(AUTH_CHANGED, changed)
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', refreshSession)
      window.removeEventListener('online', refreshSession)
    }
  }, [refreshSession])
  return <SessionContext.Provider value={{ ...session, refreshSession }}>{children}</SessionContext.Provider>
}
