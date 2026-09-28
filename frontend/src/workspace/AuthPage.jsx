import { useState } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, NotebookPen } from 'lucide-react'
import api from '../api/client'
import { getToken, setToken } from '../store/auth'
import { errorMessage } from '../domain/tracker'

export function AuthPage({ join = false }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event) {
    event.preventDefault()
    const data = Object.fromEntries(new FormData(event.currentTarget))
    setBusy(true); setError('')
    try {
      if (join) await api.post('/members/join', data)
      const response = await api.post('/members/login', { username: data.username, password: data.password })
      setToken(response.data.accessToken)
      navigate('/', { replace: true })
    } catch (failure) { setError(errorMessage(failure)) } finally { setBusy(false) }
  }
  if (getToken()) return <Navigate to="/" replace />
  return <main className="auth-page">
    <Link className="brand" to="/login"><NotebookPen size={26} />취준노트</Link>
    <section className="auth-form">
      <h1>{join ? '회원가입' : '다시 만나 반가워요'}</h1>
      <p className="muted">{join ? '나의 다음 커리어를 기록하세요.' : '오늘의 지원과 일정을 확인하세요.'}</p>
      {params.has('expired') && <p role="status" className="notice">로그인이 만료되었습니다. 다시 로그인해 주세요.</p>}
      <form onSubmit={submit}>
        <label>아이디<input name="username" required autoComplete="username" pattern={join ? '[a-z0-9]{4,20}' : undefined} title="영문 소문자와 숫자 4~20자" maxLength={20} /></label>
        <label>비밀번호<input name="password" type="password" required autoComplete={join ? 'new-password' : 'current-password'} minLength={join ? 8 : undefined} maxLength={30} pattern={join ? '(?=.*[A-Za-z])(?=.*[0-9]).{8,30}' : undefined} title="영문과 숫자를 포함한 8~30자" /></label>
        {join && <label>닉네임<input name="nickname" required minLength={1} maxLength={10} autoComplete="nickname" /></label>}
        {error && <p role="alert" className="error">{error}</p>}
        <button className="primary" disabled={busy}>{busy ? '처리 중…' : join ? '가입하고 시작하기' : '로그인'}<ArrowRight size={18} /></button>
      </form>
      <p className="auth-switch">{join ? '이미 계정이 있나요?' : '처음 방문했나요?'} <Link to={join ? '/login' : '/join'}>{join ? '로그인' : '회원가입'}</Link></p>
    </section>
    <footer>지원의 시작부터, 다음 커리어까지.</footer>
  </main>
}
