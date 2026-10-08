import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api/client'
import { AUTH_CHANGED, AUTH_STORAGE_KEY, discardLegacyToken } from './auth'
import { SessionContext } from './sessionContext'
import { clearDeviceDrafts, createDraftStorage } from '../domain/applicationDraft'
import { navigationProtection } from '../domain/navigationProtection'

export function SessionProvider({ children }) {
  const [session, setSession] = useState({ status: 'checking', member: null, verifying: false, verificationError: false })
  const revision = useRef(0)
  const confirmedMember = useRef(null)
  const refreshSession = useCallback(async () => {
    const current = ++revision.current
    setSession(previous => ({ ...previous, verifying: true }))
    try {
      const { data } = await api.get('/members/me')
      if (current === revision.current) {
        if (confirmedMember.current !== null && confirmedMember.current !== data.id) {
          clearDeviceDrafts(); navigationProtection.clear()
        }
        confirmedMember.current = data.id
        try { createDraftStorage(localStorage).retainOnly(data.id) } catch { /* Storage is optional. */ }
        setSession({ status: 'authenticated', member: data, verifying: false, verificationError: false })
      }
      return data
    } catch (error) {
      if (current === revision.current) {
        if (error.response?.status === 401) { clearDeviceDrafts(); navigationProtection.clear(); confirmedMember.current = null }
        setSession(previous => {
        if (error.response?.status === 401) return { status: 'anonymous', member: null, verifying: false, verificationError: false }
        // A failed background probe is not proof of logout. Keep drafts in memory.
        return { status: previous.member ? 'authenticated' : 'error', member: previous.member, verifying: false, verificationError: true }
        })
      }
      return null
    }
  }, [])
  useEffect(() => {
    let active = true
    const requests = revision
    discardLegacyToken()
    queueMicrotask(() => { if (active) refreshSession() })
    const clearPrivateState = () => { clearDeviceDrafts(); navigationProtection.clear(); confirmedMember.current = null }
    const expired = () => { ++revision.current; clearPrivateState(); setSession({ status: 'anonymous', member: null, verifying: false, verificationError: false }) }
    const changed = () => { clearPrivateState(); setSession({ status: 'checking', member: null, verifying: false, verificationError: false }); refreshSession() }
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
