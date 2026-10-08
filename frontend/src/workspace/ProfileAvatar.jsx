import { useEffect, useRef, useState } from 'react'
import { Check, Pencil } from 'lucide-react'
import api from '../api/client'
import { errorMessage } from '../domain/tracker'
import { useSession } from '../store/sessionContext'
import { useFormProtection } from './useFormProtection'

const options = [
  { value: 'blue', label: '파랑', color: '#245bd7' },
  { value: 'green', label: '초록', color: '#19734b' },
  { value: 'purple', label: '보라', color: '#754b9b' },
  { value: 'pink', label: '분홍', color: '#af365d' },
  { value: 'orange', label: '주황', color: '#995716' },
  { value: 'gray', label: '회색', color: '#556070' },
]
const optionOf = value => options.find(option => option.value === value) || options[0]

export function ProfileAvatar({ member, onSaved }) {
  const { canMutate } = useSession()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState(optionOf(member.avatar).value)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(null)
  const protection = useFormProtection(busy)
  const current = optionOf(member.avatar)
  const preview = open ? optionOf(selected) : current
  useEffect(() => () => pending.current?.abort(), [])
  function cancel() {
    setSelected(current.value); setError(''); setOpen(false); protection.clear()
  }
  async function save(event) {
    event.preventDefault()
    if (busy || !canMutate || selected === current.value) return
    const request = new AbortController(); pending.current = request
    setBusy(true); setError('')
    try {
      const { data } = await api.patch('/members/me/avatar', { avatar: selected }, { signal: request.signal })
      if (request.signal.aborted) return
      protection.clear(); setOpen(false); onSaved(data)
    } catch (failure) { if (!request.signal.aborted) setError(errorMessage(failure)) }
    finally { if (!request.signal.aborted) setBusy(false) }
  }
  return <>
    <section className="profile-heading">
      <span className="avatar" role="img" aria-label={`${preview.label} 아바타${open ? ' 미리보기' : ''}`} style={{ background: preview.color, color: '#fff' }}>{member.nickname?.slice(0, 1) || '나'}</span>
      <div><h2>{member.nickname}</h2><p className="muted">@{member.username}</p></div>
      <button className="icon" title="아바타 변경" aria-label="아바타 변경" aria-expanded={open} disabled={busy || !canMutate} onClick={() => open ? cancel() : setOpen(true)}><Pencil size={18} /></button>
    </section>
    {open && <section className="settings-section"><h2>아바타</h2>
      <form onSubmit={save}>
        <fieldset className="avatar-options" disabled={busy}><legend>색상</legend>
          {options.map(option => <label key={option.value} className="avatar-option" title={option.label}>
            <input type="radio" name="avatar" value={option.value} aria-label={option.label} checked={selected === option.value} onChange={() => {
              setSelected(option.value)
              if (option.value === current.value) protection.clear()
              else protection.markDirty()
            }} />
            <span style={{ background: option.color }} aria-hidden="true">{selected === option.value && <Check size={20} />}</span>
          </label>)}
        </fieldset>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="avatar-actions"><button disabled={busy || !canMutate || selected === current.value}>{busy ? '저장 중...' : '아바타 저장'}</button><button type="button" disabled={busy} onClick={cancel}>취소</button></div>
      </form>
    </section>}
  </>
}
