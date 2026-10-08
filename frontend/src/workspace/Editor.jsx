import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { CalendarPlus, Trash2, X } from 'lucide-react'
import api from '../api/client'
import { notifySessionChanged } from '../store/auth'
import { dateKey, errorMessage, safeLink, statuses } from '../domain/tracker'
import { useFormProtection } from './useFormProtection'
import { useSession } from '../store/sessionContext'
import { SessionNotice } from './SessionNotice'

export function Editor({ kind, app, event: schedule, status, date, count, apps, onClose, onSaved }) {
  const dialog = useRef(null)
  const navigate = useNavigate()
  const { canMutate } = useSession()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [selectedStatus, setSelectedStatus] = useState(status || app?.status || 'TO_APPLY')
  const [type, setType] = useState(schedule?.type || 'INTERVIEW')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [withInterview, setWithInterview] = useState(false)
  const protection = useFormProtection(busy, true, kind === 'status' && status !== app?.status)
  function close() {
    if (!busy && (!protection.dirty || window.confirm('작성 중인 내용을 버리고 닫을까요?'))) onClose()
  }
  const title = { application: app ? '지원 수정' : '지원 추가', schedule: schedule ? '일정 수정' : '일정 추가', status: '상태 변경', delete: '지원 삭제', withdraw: '회원 탈퇴' }[kind]
  useEffect(() => { const element = dialog.current; element.showModal(); return () => element.close() }, [])

  async function submit(e) {
    e.preventDefault()
    if (busy || !canMutate) return
    setError(''); setBusy(true)
    const values = Object.fromEntries(new FormData(e.currentTarget))
    try {
      if (kind === 'application') {
        if (values.link && !safeLink(values.link)) throw new Error('http 또는 https 공고 주소를 입력해 주세요.')
        const payload = { company: values.company.trim(), position: values.position.trim(), status: selectedStatus, appliedDate: values.appliedDate || null, deadline: values.deadline || null, interviewDate: app?.interviewDate || null, interviewTime: app?.interviewTime || null, link: values.link || null, memo: values.memo || null, version: app?.version }
        if (!payload.company || !payload.position) throw new Error('회사명과 직무를 입력해 주세요.')
        if (app) await api.put('/applications/' + app.id, payload)
        else await api.post('/applications', payload)
        await onSaved(app ? '지원 내역을 수정했습니다.' : '지원 내역을 추가했습니다.')
      } else if (kind === 'status') {
        const response = await api.patch('/applications/' + app.id + '/status', { status: selectedStatus, appliedDate: app.appliedDate || values.appliedDate || null, version: app.version })
        await onSaved('상태를 변경했습니다.', withInterview && selectedStatus === 'INTERVIEW' ? { kind: 'schedule', app: response.data } : null)
      } else if (kind === 'schedule') {
        const id = app?.id || values.applicationId
        const payload = { type, title: values.title.trim(), date: values.date, time: values.time || null, state: values.state || 'SCHEDULED', version: schedule?.version ?? null }
        if (!payload.title) throw new Error('일정 이름을 입력해 주세요.')
        const base = '/applications/' + id
        if (schedule?.id?.toString().startsWith('legacy-')) await api.put(base + '/legacy-schedules/' + schedule.type, payload)
        else if (schedule) await api.put(base + '/schedules/' + schedule.id, payload)
        else await api.post(base + '/schedules', payload)
        await onSaved('일정을 저장했습니다.')
      } else if (kind === 'delete') {
        await api.delete('/applications/' + app.id)
        navigate('/applications', { replace: true })
        await onSaved('지원 내역을 삭제했습니다.')
      } else if (kind === 'withdraw') {
        await api.delete('/members/me', { data: { currentPassword: values.currentPassword } })
        notifySessionChanged(); onClose(); navigate('/login', { replace: true })
      }
    } catch (failure) { setError(failure.response || failure.request ? errorMessage(failure) : failure.message) } finally { setBusy(false) }
  }
  async function deleteSchedule() {
    if (busy || !canMutate) return
    setBusy(true); setError('')
    try {
      const suffix = schedule.id.toString().startsWith('legacy-') ? '/legacy-schedules/' + schedule.type : '/schedules/' + schedule.id
      await api.delete('/applications/' + app.id + suffix)
      await onSaved('일정을 삭제했습니다.')
    } catch (failure) { setError(errorMessage(failure)) } finally { setBusy(false) }
  }

  return <dialog ref={dialog} className="editor" aria-labelledby="editor-title" onCancel={e => { e.preventDefault(); close() }}>
    <div className="editor-heading"><h2 id="editor-title">{title}</h2><button className="icon" title="닫기" type="button" disabled={busy} onClick={close}><X size={22} /></button></div>
    <SessionNotice />
    <form onSubmit={submit} onChange={protection.markDirty}>
      <fieldset disabled={busy}>
        {kind === 'application' && <>
          <label>회사명<input autoFocus name="company" defaultValue={app?.company} required maxLength={100} /></label>
          <label>직무<input name="position" defaultValue={app?.position} required maxLength={100} /></label>
          <label>지원 상태<select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>{Object.entries(statuses).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
          <div className="form-columns"><label>지원일<input name="appliedDate" type="date" required={selectedStatus !== 'TO_APPLY'} max={dateKey()} defaultValue={app?.appliedDate || ''} /></label><label>서류 마감일<input name="deadline" type="date" defaultValue={app?.deadline || ''} /></label></div>
          <label>공고 주소<input name="link" type="url" defaultValue={app?.link || ''} placeholder="https://" maxLength={255} /></label>
          <label>메모<textarea name="memo" defaultValue={app?.memo || ''} rows={4} maxLength={1000} /></label>
        </>}
        {kind === 'status' && <>
          <p className="muted">{app.company} · {app.position}</p>
          <label>지원 상태<select autoFocus value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)}>{Object.entries(statuses).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
          {selectedStatus !== 'TO_APPLY' && !app.appliedDate && <label>지원일<input name="appliedDate" type="date" required max={dateKey()} defaultValue={dateKey()} /></label>}
          {selectedStatus === 'INTERVIEW' && <label className="check-label"><input type="checkbox" checked={withInterview} onChange={e => setWithInterview(e.target.checked)} />상태 저장 후 면접 일정 등록</label>}
        </>}
        {kind === 'schedule' && <>
          {app ? <p className="muted">{app.company} · {app.position}</p> : <label>지원 내역<select name="applicationId" required defaultValue=""><option value="" disabled>회사를 선택하세요</option>{apps.map(a => <option value={a.id} key={a.id}>{a.company} · {a.position}</option>)}</select></label>}
          {!apps.length && <p className="notice">등록된 지원 내역이 없습니다.</p>}
          <label>일정 종류<select value={type} onChange={e => setType(e.target.value)}><option value="INTERVIEW">면접</option><option value="DEADLINE">마감</option></select></label>
          <label>일정 이름<input autoFocus name="title" defaultValue={schedule?.title || ''} placeholder={type === 'INTERVIEW' ? '예: 1차 직무 면접' : '예: 과제 제출 마감'} required maxLength={80} /></label>
          <div className="form-columns"><label>날짜<input name="date" type="date" defaultValue={schedule?.date || date || dateKey()} required /></label><label>시간 (선택)<input name="time" type="time" defaultValue={schedule?.time?.slice(0, 5) || ''} /></label></div>
          {schedule && <label>일정 상태<select name="state" defaultValue={schedule.state}><option value="SCHEDULED">예정</option><option value="COMPLETED">완료</option><option value="CANCELLED">취소</option></select></label>}
        </>}
        {kind === 'delete' && <><p><strong>{app.company}</strong> 지원 내역과 연결된 일정을 삭제합니다.</p><p className="muted">삭제한 기록은 복구할 수 없습니다.</p><label className="check-label"><input type="checkbox" required />삭제할 내용을 확인했습니다.</label></>}
        {kind === 'withdraw' && <><p>계정과 {count == null ? '모든 지원 내역' : `지원 내역 ${count}건`}, 연결된 일정이 모두 삭제됩니다.</p><p className="muted">탈퇴한 계정은 복구할 수 없습니다.</p><label>현재 비밀번호<input name="currentPassword" type="password" autoComplete="current-password" required /></label><label className="check-label"><input type="checkbox" required />모든 기록 삭제에 동의합니다.</label></>}
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <div className="editor-footer"><button type="button" onClick={close} disabled={busy}>취소</button><button className={['delete', 'withdraw'].includes(kind) ? 'danger-fill' : 'primary'} disabled={busy || !canMutate || (kind === 'schedule' && !apps.length)}>{busy ? '저장 중…' : ['delete', 'withdraw'].includes(kind) ? '삭제 확인' : kind === 'status' && selectedStatus === 'INTERVIEW' && withInterview ? '상태 저장 후 일정 등록' : '저장'}{kind === 'schedule' && <CalendarPlus size={17} />}</button></div>
      {schedule && <div className="delete-schedule">{confirmDelete ? <><span>이 일정을 삭제할까요?</span><button type="button" className="danger" disabled={busy || !canMutate} onClick={deleteSchedule}>삭제 확인</button><button type="button" disabled={busy} onClick={() => setConfirmDelete(false)}>유지</button></> : <button type="button" className="text-button danger" onClick={() => setConfirmDelete(true)}><Trash2 size={16} />일정 삭제</button>}</div>}
    </form>
  </dialog>
}
