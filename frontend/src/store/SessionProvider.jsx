import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api/client'
import { AUTH_CHANGED, AUTH_STORAGE_KEY, discardLegacyToken } from './auth'
import { SessionContext } from './sessionContext'

export function SessionProvider({ children }) {
  const [session, setSession] = useState({ status: 'checking', member: null, verifying: false, verificationError: false })
  const revision = useRef(0)
  const refreshSession = useCallback(async () => {
    const current = ++revision.current
    setSession(previous => ({ ...previous, verifying: true }))
    try {
      const { data } = await api.get('/members/me')
      if (current === revision.current) setSession({ status: 'authenticated', member: data, verifying: false, verificationError: false })
      return data
    } catch (error) {
      if (current === revision.current) setSession(previous => {
        if (error.response?.status === 401) return { status: 'anonymous', member: null, verifying: false, verificationError: false }
        // A failed background probe is not proof of logout. Keep drafts in memory.
        return { status: previous.member ? 'authenticated' : 'error', member: previous.member, verifying: false, verificationError: true }
      })
      return null
    }
  }, [])
  useEffect(() => {
    let active = true
    const requests = revision
    discardLegacyToken()
    queueMicrotask(() => { if (active) refreshSession() })
    const expired = () => { ++revision.current; setSession({ status: 'anonymous', member: null, verifying: false, verificationError: false }) }
    const changed = () => { setSession({ status: 'checking', member: null, verifying: false, verificationError: false }); refreshSession() }
    const storage = event => { if (event.key === AUTH_STORAGE_KEY) changed() }
    window.addEventListener('auth-expired', expired)
    window.addEventListener(AUTH_CHANGED, changed)
    window.addEventListener('storage', storage)
    window.addEventListener('focus', refreshSession)
    window.addEventListener('online', refreshSession)
    return () => {
      active = false
      ++requests.current
      window.removeEventListener('auth-expired', expired)
      window.removeEventListener(AUTH_CHANGED, changed)
      window.removeEventListener('storage', storage)
      window.removeEventListener('focus', refreshSession)
      window.removeEventListener('online', refreshSession)
    }
  }, [refreshSession])
  const canMutate = session.status === 'authenticated' && !session.verifying && !session.verificationError
  return <SessionContext.Provider value={{ ...session, canMutate, refreshSession }}>{children}</SessionContext.Provider>
}
