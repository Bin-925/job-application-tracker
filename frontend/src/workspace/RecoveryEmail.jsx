import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, NotebookPen } from 'lucide-react'
import api from '../api/client'
import { errorMessage } from '../domain/tracker'
import { notifySessionChanged } from '../store/auth'
import { useSession } from '../store/sessionContext'
import { useFormProtection } from './useFormProtection'

export function RecoveryEmail({ social = false, googleVerified = false, onProofConsumed }) {
  const { canMutate } = useSession()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const pending = useRef(null)
  const protection = useFormProtection(busy)
  async function load(signal) {
    try { const response = await api.get('/members/me/recovery-email', { signal }); if (!signal.aborted) setData(response.data) }
    catch (failure) { if (!signal.aborted) setError(errorMessage(failure)) }
  }
  useEffect(() => {
    const request = new AbortController()
    api.get('/members/me/recovery-email', { signal: request.signal })
      .then(response => { if (!request.signal.aborted) setData(response.data) })
      .catch(failure => { if (!request.signal.aborted) setError(errorMessage(failure)) })
    return () => { request.abort(); pending.current?.abort() }
  }, [])
  async function submit(event) {
    event.preventDefault()
    if (busy || !canMutate) return
    const form = event.currentTarget
    const body = Object.fromEntries(new FormData(form))
    const request = new AbortController()
    pending.current = request
    setBusy(true); setError(''); setNotice('')
    try {
      await api.post(social ? '/members/me/google/recovery-email' : '/members/me/recovery-email/requests', body, { signal: request.signal })
      if (request.signal.aborted) return
      form.reset(); protection.clear()
      if (social) onProofConsumed?.()
      setNotice('인증 메일을 발송 서버에 전달했습니다. 수신함과 스팸함을 확인해 주세요. 재발송은 1분 뒤 가능합니다.')
      await load(request.signal)
    } catch (failure) { if (!request.signal.aborted) setError(errorMessage(failure)) }
    finally { if (!request.signal.aborted) setBusy(false) }
  }
  return <section className="settings-section recovery-email"><h2><Mail size={18} /> 복구 이메일</h2>
    {error && <p className="error" role="alert">{error}</p>}
    {!data && !error && <p role="status">이메일 상태 확인 중...</p>}
    {!data && error && <button onClick={() => { const request = new AbortController(); pending.current = request; setError(''); load(request.signal) }}>다시 확인</button>}
    {data && <><p>{data.verifiedEmail ? `인증된 이메일: ${data.verifiedEmail}` : '인증된 복구 이메일이 없습니다.'}</p>
      {data.pendingEmail && <p role="status">인증 대기: {data.pendingEmail}<br />{new Date(data.expiresAt).toLocaleString('ko-KR')}까지</p>}
      {!data.available ? <p className="muted">현재 이메일 인증을 사용할 수 없습니다.</p> : <>
        <p className="muted">인증 완료 후 모든 기기에서 다시 로그인해야 합니다.</p>
        {social && !googleVerified && <p className="muted">이메일 등록 전 Google 계정을 다시 확인해 주세요.</p>}
        <form onSubmit={submit} onChange={protection.markDirty}>
          <label>복구 이메일<input name="email" type="email" autoComplete="email" required maxLength={254} disabled={busy} /></label>
          {!social && <label>이메일 등록용 현재 비밀번호<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={72} disabled={busy} /></label>}
          <div><button disabled={busy || !canMutate || (social && !googleVerified)}>{busy ? '전송 중...' : '인증 메일 보내기'}</button><button type="reset" disabled={busy} onClick={() => { protection.clear(); setError('') }}>입력 지우기</button></div>
        </form>
      </>}
    </>}
    {notice && <p role="status" className="notice">{notice}</p>}
  </section>
}

export function VerifyRecoveryEmail() {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(null)
  useFormProtection(busy)
  useEffect(() => {
    window.history.replaceState(window.history.state, '', window.location.pathname)
    return () => pending.current?.abort()
  }, [])
  const valid = /^[A-Za-z0-9_-]{43}$/.test(token)
  async function confirm() {
    if (busy || !valid) return
    const request = new AbortController()
    pending.current = request
    setBusy(true); setError('')
    try {
      await api.post('/members/recovery-email/confirm', { token }, { signal: request.signal })
      if (request.signal.aborted) return
      setToken(''); setDone(true); notifySessionChanged()
    } catch (failure) { if (!request.signal.aborted) setError(errorMessage(failure)) }
    finally { if (!request.signal.aborted) setBusy(false) }
  }
  return <main className="auth-page"><Link className="brand" to="/login"><NotebookPen size={26} />취준노트</Link>
    <section className="auth-form"><h1>복구 이메일 인증</h1>
      {done ? <p role="status">이메일 인증을 완료했습니다. 기존 세션은 종료됩니다. 다시 로그인해 주세요.</p> : valid ? <>
        <p>본인이 요청한 이메일 등록·변경인 경우에만 인증해 주세요. 완료하면 모든 기기에서 다시 로그인해야 합니다.</p>
        <button className="primary" disabled={busy} onClick={confirm}>{busy ? '확인 중...' : '이메일 인증 완료'}</button>
      </> : <p role="alert">인증 링크를 다시 열거나 내 정보에서 새 인증 메일을 요청해 주세요.</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <Link to={done ? '/login' : '/mypage'}>{done ? '로그인하기' : '내 정보로'}</Link>
    </section>
  </main>
}
