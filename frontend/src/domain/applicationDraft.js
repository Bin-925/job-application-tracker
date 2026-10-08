export const DRAFT_PREFIX = 'jobtracker.application-draft.v1.'
export const DRAFT_CLEARED = 'application-drafts-cleared'
export const DRAFT_TTL = 7 * 24 * 60 * 60 * 1000
const limits = { company: 100, position: 100, status: 20, appliedDate: 10, deadline: 10, link: 255, memo: 1000 }
const statuses = ['TO_APPLY', 'APPLIED', 'DOC_PASSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED']

export function createDraftStorage(storage, now = Date.now) {
  const key = memberId => {
    if (!Number.isSafeInteger(memberId) || memberId < 1) throw new Error('Invalid draft owner')
    return DRAFT_PREFIX + memberId
  }
  function sanitize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid draft')
    const result = {}
    for (const [name, max] of Object.entries(limits)) {
      const field = value[name] ?? ''
      if (typeof field !== 'string' || field.length > max) throw new Error('Invalid draft field')
      result[name] = field
    }
    if (!statuses.includes(result.status)) throw new Error('Invalid draft status')
    return result
  }
  return {
    read(memberId) {
      const id = key(memberId), raw = storage.getItem(id)
      if (!raw) return null
      try {
        if (raw.length > 12000) throw new Error('Oversized draft')
        const record = JSON.parse(raw)
        if (record.version !== 1 || record.memberId !== memberId || !Number.isFinite(record.savedAt)
            || record.savedAt > now() || now() - record.savedAt >= DRAFT_TTL) throw new Error('Expired draft')
        return { ...record, values: sanitize(record.values) }
      } catch { storage.removeItem(id); return null }
    },
    write(memberId, values) {
      const record = { version: 1, memberId, savedAt: now(), values: sanitize(values) }
      storage.setItem(key(memberId), JSON.stringify(record))
      return record
    },
    remove(memberId) { storage.removeItem(key(memberId)) },
    retainOnly(memberId) {
      const current = key(memberId)
      const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
      keys.filter(id => id?.startsWith(DRAFT_PREFIX) && id !== current).forEach(id => storage.removeItem(id))
    },
    clear() {
      const keys = Array.from({ length: storage.length }, (_, i) => storage.key(i))
      keys.filter(id => id?.startsWith(DRAFT_PREFIX)).forEach(id => storage.removeItem(id))
    },
  }
}

export function clearDeviceDrafts() {
  try { createDraftStorage(localStorage).clear() } catch { /* Browser storage can be unavailable. */ }
  window.dispatchEvent(new Event(DRAFT_CLEARED))
}
