import { useEffect, useState } from 'react'
import { createDraftStorage, DRAFT_CLEARED, DRAFT_PREFIX } from '../domain/applicationDraft'

export function useApplicationDraft(memberId, eligible) {
  const [initial] = useState(() => {
    if (!eligible) return { draft: null, error: '' }
    try { return { draft: createDraftStorage(localStorage).read(memberId), error: '' } }
    catch { return { draft: null, error: '기기 저장소에 접근할 수 없습니다. 이 화면에서 계속 작성할 수 있습니다.' } }
  })
  const [available, setAvailable] = useState(initial.draft)
  const [restored, setRestored] = useState(null)
  const [enabled, setEnabled] = useState(false)
  const [error, setError] = useState(initial.error)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    const cleared = () => { setEnabled(false); setAvailable(null); setSaved(false) }
    const changed = event => {
      if (event.key === null || (event.key === DRAFT_PREFIX + memberId && event.newValue === null)) cleared()
    }
    window.addEventListener(DRAFT_CLEARED, cleared)
    window.addEventListener('storage', changed)
    return () => { window.removeEventListener(DRAFT_CLEARED, cleared); window.removeEventListener('storage', changed) }
  }, [memberId])
  function persist(form) {
    try {
      createDraftStorage(localStorage).write(memberId, Object.fromEntries(new FormData(form)))
      setSaved(true); setError('')
    } catch { setSaved(false); setError('기기에 초안을 저장하지 못했습니다. 화면을 닫기 전에 서버에 저장해 주세요.') }
  }
  function remove() {
    try { createDraftStorage(localStorage).remove(memberId); setAvailable(null); setSaved(false); setError(''); return true }
    catch { setError('기기 초안을 지우지 못했습니다. 브라우저의 사이트 데이터를 확인해 주세요.'); return false }
  }
  return {
    available, restored, enabled, saved, error,
    change(form) { if (eligible && enabled && !available) persist(form) },
    toggle(checked, form) {
      setEnabled(checked)
      if (checked) persist(form)
      else remove()
    },
    restore() { setRestored(available.values); setAvailable(null); setEnabled(true); setSaved(true) },
    remove,
    complete() { if (eligible) { remove(); setEnabled(false) } },
  }
}
