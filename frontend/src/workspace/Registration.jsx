import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, NotebookPen, UserPlus } from 'lucide-react'
import api from '../api/client'
import { errorMessage } from '../domain/tracker'
import { AuthPage } from './AuthPage'
import { useFormProtection } from './useFormProtection'
import { useSession } from '../store/sessionContext'
import { GoogleLoginButton } from './GoogleAccount'

export function RegistrationPage() {
  const [required, setRequired] = useState(null)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const request = new AbortController()
    api.get('/members/registration/options', { signal: request.signal }).then(({ data }) => {
      if (request.signal.aborted) return
      if (typeof data.required !== 'boolean') throw new Error('가입 설정을 확인할 수 없습니다.')
      setRequired(data.required)
    }).catch(failure => { if (!request.signal.aborted) setError(errorMessage(failure)) })
    return () => request.abort()
  }, [retry])
  if (required === false) return <AuthPage join />
  if (required === true) return <Registration />
  return <main className="auth-page"><section className="auth-form"><h1>회원가입</h1>
    {error ? <><p role="alert" className="error">{error}</p><button onClick={() => { setError(''); setRetry(value => value + 1) }}>다시 확인</button></> : <p role="status">가입 방법을 확인하고 있습니다.</p>}
    <Link to="/login">로그인으로 돌아가기</Link>
  </section></main>
}

export function Registration({ confirm = false }) {
  const { member, status } = useSession()
  const [token, setToken] = useState(() => confirm ? new URLSearchParams(window.location.hash.slice(1)).get('token') || '' : '')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(null)
  const protection = useFormProtection(busy)
  useEffect(() => {
    if (confirm) window.history.replaceState(window.history.state, '', window.location.pathname)
    return () => pending.current?.abort()
  }, [confirm])
  const valid = /^[A-Za-z0-9_-]{43}$/.test(token)
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const fields = Object.fromEntries(new FormData(form))
    if (confirm && fields.password !== fields.confirmPassword) {
      setError('비밀번호가 서로 일치하지 않습니다.'); return
    }
    const request = new AbortController(); pending.current = request
    setBusy(true); setError('')
    try {
      await api.post(`/members/registration/${confirm ? 'confirm' : 'requests'}`,
        confirm ? { token, member: { username: fields.username, password: fields.password, nickname: fields.nickname } } : { email: fields.email },
        { signal: request.signal })
      if (request.signal.aborted) return
      form.reset(); protection.clear(); setDone(true); setToken('')
    } catch (failure) { if (!request.signal.aborted) setError(errorMessage(failure)) }
    finally { if (!request.signal.aborted) setBusy(false) }
  }
  if (status === 'checking') return <p className="empty" role="status">로그인 확인 중...</p>
  if (member) return <main className="auth-page"><section className="auth-form"><h1>현재 로그인 중입니다</h1>
    <p>새 계정으로 가입하려면 현재 계정에서 로그아웃해 주세요. 인증 메일을 받았다면 로그아웃한 뒤 링크를 다시 열어 주세요.</p>
    <Link to="/mypage">내 정보로 이동</Link>
  </section></main>
  return <main className="auth-page"><Link className="brand" to="/login"><NotebookPen size={26} />취준노트</Link>
    <section className="auth-form"><h1>{confirm ? '회원가입 완료하기' : '회원가입'}</h1>
      {!confirm && <GoogleLoginButton />}
      {done ? <p role="status">{confirm ? '가입을 완료했습니다. 이제 로그인해 주세요.' : '인증 메일을 요청했습니다. 메일의 링크에서 가입 정보를 입력해 주세요. 메일이 오지 않으면 스팸함을 확인하거나 잠시 후 다시 요청해 주세요.'}</p>
        : confirm && !valid ? <p role="alert">유효한 가입 링크가 없습니다. 인증 메일을 다시 요청해 주세요.</p>
          : <form onSubmit={submit} onChange={protection.markDirty}>
            {confirm ? <>
              <div><label>아이디<input name="username" required pattern="[a-z0-9]{4,20}" minLength={4} maxLength={20} autoComplete="username" title="영문 소문자와 숫자 4~20자" /></label><p className="field-hint">영문 소문자와 숫자만 사용, 4~20자</p></div>
              <div><label>닉네임<input name="nickname" required minLength={1} maxLength={10} autoComplete="nickname" /></label><p className="field-hint">1~10자</p></div>
              <div><label>비밀번호<input name="password" type="password" required minLength={8} maxLength={30} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,30}" autoComplete="new-password" title="영문과 숫자를 포함한 8~30자" /></label><p className="field-hint">영문과 숫자를 모두 포함, 8~30자</p></div>
              <label>비밀번호 확인<input name="confirmPassword" type="password" required minLength={8} maxLength={30} autoComplete="new-password" /></label>
            </> : <>
              <p className="muted">가입과 비밀번호 복구에 사용할 이메일을 인증해 주세요.</p>
              <label>이메일<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
            </>}
            <button className="primary" disabled={busy}>{confirm ? <UserPlus size={18} /> : <Mail size={18} />}{busy ? '처리 중...' : confirm ? '가입 완료' : '인증 메일 요청'}</button>
          </form>}
      {error && <p role="alert" className="error">{error}</p>}
      {!confirm && done && <button onClick={() => { setDone(false); setError('') }}>다시 요청</button>}
      {confirm && !done && <Link to="/join">새 인증 메일 요청</Link>}
      <p className="auth-switch"><Link to="/login">로그인으로 돌아가기</Link></p>
    </section>
  </main>
}
