export const AUTH_CHANGED = 'session-changed'
export const AUTH_STORAGE_KEY = 'session-change'

export function notifySessionChanged() {
  window.dispatchEvent(new Event(AUTH_CHANGED))
  try { localStorage.setItem(AUTH_STORAGE_KEY, crypto.randomUUID()) } catch { /* Cookies still work without storage. */ }
}

export function discardLegacyToken() {
  try { localStorage.removeItem('access_token') } catch { /* Storage may be disabled. */ }
}
