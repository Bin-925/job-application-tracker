import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, NotebookPen } from 'lucide-react'
import api from '../api/client'
import { notifySessionChanged } from '../store/auth'
import { useSession } from '../store/sessionContext'
import { errorMessage } from '../domain/tracker'

export function AuthPage({ join = false }) {
  const navigate = useNavigate()
  const { member, status } = useSession()
  const [params] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pendingRequest = useRef(null)
  useEffect(() => () => pendingRequest.current?.abort(), [])
  async function submit(event) {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(event.currentTarget))
    const request = new AbortController()
    pendingRequest.current = request
    setBusy(true); setError('')
    try {
      if (join) await api.post('/members/join', { username: data.username, password: data.password, nickname: data.nickname }, { signal: request.signal })
      if (request.signal.aborted) return
      await api.post('/members/login', { username: data.username, password: data.password, rememberMe: data.rememberMe === 'on' }, { signal: request.signal })
      if (request.signal.aborted) return
      notifySessionChanged()
      navigate('/', { replace: true })
    } catch (failure) {
      if (!request.signal.aborted) setError(errorMessage(failure))
    } finally {
      if (!request.signal.aborted) setBusy(false)
    }
  }
  if (status === 'checking') return <p className="empty" role="status">로그인 확인 중...</p>
  if (member) return <Navigate to="/" replace />
  return <main className="auth-page">
    <Link className="brand" to="/login"><NotebookPen size={26} />취준노트</Link>
    <section className="auth-form">
      <h1>{join ? '회원가입' : '다시 만나 반가워요'}</h1>
      <p className="muted">{join ? '나의 다음 커리어를 기록하세요.' : '오늘의 지원과 일정을 확인하세요.'}</p>
      {params.has('expired') && <p role="status" className="notice">로그인이 만료되었습니다. 다시 로그인해 주세요.</p>}
      {params.has('passwordChanged') && <p role="status" className="notice">비밀번호를 변경하고 모든 기기에서 로그아웃했습니다.</p>}
      <form onSubmit={submit}>
        <div><label>아이디<input name="username" required autoComplete="username" pattern={join ? '[a-z0-9]{4,20}' : undefined} title="영문 소문자와 숫자 4~20자" maxLength={20} aria-describedby={join ? 'username-rule' : undefined} /></label>{join && <p id="username-rule" className="field-hint">영문 소문자와 숫자만 사용, 4~20자</p>}</div>
        <div><label>비밀번호<input name="password" type="password" required autoComplete={join ? 'new-password' : 'current-password'} minLength={join ? 8 : undefined} maxLength={30} pattern={join ? '(?=.*[A-Za-z])(?=.*[0-9]).{8,30}' : undefined} title="영문과 숫자를 포함한 8~30자" aria-describedby={join ? 'password-rule' : undefined} /></label>{join && <p id="password-rule" className="field-hint">영문과 숫자를 모두 포함, 8~30자</p>}</div>
        {join && <div><label>닉네임<input name="nickname" required minLength={1} maxLength={10} autoComplete="nickname" aria-describedby="nickname-rule" /></label><p id="nickname-rule" className="field-hint">1~10자</p></div>}
        <div><label className="check-label"><input name="rememberMe" type="checkbox" disabled={busy} aria-describedby="remember-me-hint" />로그인 상태 유지</label><p id="remember-me-hint" className="field-hint">선택하면 이 기기에서 최대 7일간 유지됩니다. 공용 기기에서는 선택하지 마세요.</p></div>
        {error && <p role="alert" className="error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? '처리 중…' : join ? '가입하고 시작하기' : '로그인'}<ArrowRight size={18} /></button>
      </form>
      <p className="auth-switch">{join ? '이미 계정이 있나요?' : '처음 방문했나요?'} <Link to={join ? '/login' : '/join'}>{join ? '로그인' : '회원가입'}</Link></p>
      {!join && <p className="auth-switch"><Link to="/forgot-password">비밀번호 찾기</Link></p>}
    </section>
    <footer>지원의 시작부터, 다음 커리어까지.</footer>
  </main>
}
