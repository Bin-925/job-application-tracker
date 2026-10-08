import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KeyRound, Link2, LogIn, NotebookPen, ShieldCheck, Trash2, Unlink } from 'lucide-react'
import api from '../api/client'
import { errorMessage } from '../domain/tracker'
import { notifySessionChanged } from '../store/auth'
import { useSession } from '../store/sessionContext'
import { useFormProtection } from './useFormProtection'
import { RecoveryEmail } from './RecoveryEmail'

const invalidRedirect = new Error('인증 경로를 확인할 수 없습니다.')
const googleErrorMessage = failure => failure === invalidRedirect ? invalidRedirect.message : errorMessage(failure)

async function startGoogle(body, signal) {
  const { data } = await api.post('/oauth/google/start', body, { signal })
  if (signal.aborted) return
  if (data.authorizationUrl !== '/api/v1/oauth/authorize/google') throw invalidRedirect
  window.location.assign(data.authorizationUrl)
}

export function GoogleLoginButton({ rememberMe = false }) {
  const [enabled, setEnabled] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const pending = useRef(null)
  useEffect(() => {
    const request = new AbortController()
    api.get('/oauth/google/options', { signal: request.signal }).then(({ data }) => { if (!request.signal.aborted) setEnabled(data.enabled === true) })
      .catch(failure => { if (!request.signal.aborted) setError(errorMessage(failure)) })
    return () => { request.abort(); pending.current?.abort() }
  }, [retry])
  async function begin() {
    const request = new AbortController(); pending.current = request
    setBusy(true); setError('')
    try { await startGoogle({ mode: 'LOGIN', rememberMe }, request.signal) }
    catch (failure) { if (!request.signal.aborted) setError(googleErrorMessage(failure)) }
    finally { if (!request.signal.aborted) setBusy(false) }
  }
  if (!enabled && !error) return null
  return <div className="google-login">
    {enabled && <button type="button" disabled={busy} onClick={begin}><LogIn size={18} />{busy ? '연결 중...' : 'Google로 계속하기'}</button>}
    {error && <><p role="alert" className="error">{error}</p>{!enabled && <button onClick={() => { setError(''); setRetry(value => value + 1) }}>Google 로그인 다시 확인</button>}</>}
  </div>
}

export function CompleteGoogleSignup() {
  const navigate = useNavigate()
  const [pending, setPending] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(null)
  const protection = useFormProtection(busy)
  useEffect(() => {
    const request = new AbortController()
    api.get('/oauth/google/enrollment', { signal: request.signal }).then(({ data }) => { if (!request.signal.aborted) setPending(data.pending === true) })
      .catch(failure => { if (!request.signal.aborted) setError(errorMessage(failure)) })
    return () => { request.abort(); requestRef.current?.abort() }
  }, [])
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const fields = Object.fromEntries(new FormData(event.currentTarget))
    const request = new AbortController(); requestRef.current = request
    setBusy(true); setError('')
    try {
      await api.post('/oauth/google/complete', fields, { signal: request.signal })
      if (request.signal.aborted) return
      protection.clear(); notifySessionChanged(); navigate('/', { replace: true })
    } catch (failure) { if (!request.signal.aborted) setError(googleErrorMessage(failure)) }
    finally { if (!request.signal.aborted) setBusy(false) }
  }
  return <main className="auth-page"><Link className="brand" to="/login"><NotebookPen size={26} />취준노트</Link>
    <section className="auth-form"><h1>Google 계정으로 가입</h1>
      {pending === true ? <form onSubmit={submit} onChange={protection.markDirty}>
        <label>아이디<input name="username" required minLength={4} maxLength={20} pattern="[a-z0-9]{4,20}" autoComplete="username" title="영문 소문자와 숫자 4~20자" /></label>
        <p className="field-hint">영문 소문자와 숫자만 사용, 4~20자</p>
        <label>닉네임<input name="nickname" required maxLength={10} autoComplete="nickname" /></label>
        <button className="primary" disabled={busy}>{busy ? '처리 중...' : '가입 완료'}</button>
      </form> : <p role="status">{pending === false ? 'Google 인증을 다시 진행해 주세요.' : '가입 상태 확인 중...'}</p>}
      {error && <p role="alert" className="error">{error}</p>}
      <p className="auth-switch"><Link to="/login">로그인으로 돌아가기</Link></p>
    </section>
  </main>
}

export function GoogleAccountMethods({ hasPassword = true }) {
  const { canMutate } = useSession()
  const navigate = useNavigate()
  const [methods, setMethods] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const protection = useFormProtection(busy)
  const [retry, setRetry] = useState(0)
  const pending = useRef(null)
  useEffect(() => {
    const request = new AbortController()
    api.get('/members/me/login-methods', { signal: request.signal }).then(({ data }) => { if (!request.signal.aborted) setMethods(data) })
      .catch(failure => { if (!request.signal.aborted) setError(errorMessage(failure)) })
    return () => { request.abort(); pending.current?.abort() }
  }, [retry])
  async function act(event, action) {
    event.preventDefault()
    if (busy || !canMutate) return
    const fields = event.currentTarget.tagName === 'FORM' ? Object.fromEntries(new FormData(event.currentTarget)) : {}
    if (action === 'password' && fields.newPassword !== fields.confirmPassword) { setError('새 비밀번호가 서로 일치하지 않습니다.'); return }
    const request = new AbortController(); pending.current = request
    setBusy(true); setError('')
    try {
      if (action === 'LINK' || action === 'REAUTH') {
        await startGoogle({ mode: action, currentPassword: fields.currentPassword }, request.signal)
      } else {
        if (action === 'unlink') await api.delete('/members/me/google', { data: { currentPassword: fields.currentPassword }, signal: request.signal })
        else await api.post('/members/me/google/' + action, action === 'password' ? { newPassword: fields.newPassword } : {}, { signal: request.signal })
        if (request.signal.aborted) return
        protection.clear(); notifySessionChanged(); navigate('/login', { replace: true })
      }
    } catch (failure) { if (!request.signal.aborted) setError(googleErrorMessage(failure)) }
    finally { if (!request.signal.aborted) setBusy(false) }
  }
  if (!methods && !error) return hasPassword ? null : <p role="status">로그인 수단 확인 중...</p>
  if (methods && !methods.googleEnabled && !methods.googleLinked) return null
  return <>
    <section className="settings-section" onChange={protection.markDirty}><h2><Link2 size={18} /> 로그인 수단</h2>
      {error && <p role="alert" className="error">{error}</p>}
      {!methods && error && <button onClick={() => { setError(''); setRetry(value => value + 1) }}>로그인 수단 다시 확인</button>}
      {methods && <>
        <p>{hasPassword ? '아이디·비밀번호 사용 중' : 'Google 계정으로 로그인 중'}</p>
        <p>{methods.googleLinked ? 'Google 계정 연결됨' : 'Google 계정 연결 안 됨'}</p>
        {hasPassword && (methods.googleEnabled || methods.googleLinked) && <form onSubmit={event => act(event, methods.googleLinked ? 'unlink' : 'LINK')}>
          <label>로그인 수단 변경용 현재 비밀번호<input name="currentPassword" type="password" autoComplete="current-password" required maxLength={72} disabled={busy} /></label>
          <button disabled={busy || !canMutate}>{methods.googleLinked ? <Unlink size={18} /> : <Link2 size={18} />}{methods.googleLinked ? 'Google 연결 해제' : 'Google 계정 연결'}</button>
          <p className="field-hint">변경하면 모든 기기에서 다시 로그인해야 합니다.</p>
        </form>}
        {!hasPassword && <p className="muted">비밀번호를 추가하기 전에는 Google 연결을 해제할 수 없습니다.</p>}
        {!hasPassword && methods.googleEnabled && <>
          <button disabled={busy || !canMutate} onClick={event => act(event, 'REAUTH')}><ShieldCheck size={18} />Google 계정 다시 확인</button>
          {methods.googleVerified && <p role="status">계정을 확인했습니다. 5분 안에 한 가지 중요 작업을 완료할 수 있습니다.</p>}
        </>}
      </>}
    </section>
    {!hasPassword && methods && <>
      <section className="settings-section" onChange={protection.markDirty}><h2><KeyRound size={18} /> 비밀번호 추가</h2>
        <form onSubmit={event => act(event, 'password')}>
          <label>추가할 비밀번호<input name="newPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={30} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,30}" disabled={busy || !methods.googleVerified} /></label>
          <p className="field-hint">영문과 숫자를 모두 포함, 8~30자</p>
          <label>추가할 비밀번호 확인<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} maxLength={30} disabled={busy || !methods.googleVerified} /></label>
          <button disabled={busy || !canMutate || !methods.googleVerified}>비밀번호 추가</button>
        </form>
      </section>
      <RecoveryEmail social googleVerified={methods.googleVerified} onProofConsumed={() => setMethods(current => ({ ...current, googleVerified: false }))} />
      <section className="settings-section"><button className="text-button danger" disabled={busy} onClick={() => setDeleting(value => !value)}><Trash2 size={18} />회원 탈퇴</button>
        {deleting && <form onSubmit={event => act(event, 'delete')}>
          <p>계정과 모든 지원 기록을 영구 삭제합니다. 복구할 수 없습니다.</p>
          <label className="check-label"><input type="checkbox" required disabled={busy} />삭제되는 내용을 확인했습니다.</label>
          {!methods.googleVerified && <p className="muted">먼저 Google 계정을 다시 확인해 주세요.</p>}
          <button className="danger" disabled={busy || !canMutate || !methods.googleVerified}>계정 영구 삭제</button>
        </form>}
      </section>
    </>}
  </>
}
