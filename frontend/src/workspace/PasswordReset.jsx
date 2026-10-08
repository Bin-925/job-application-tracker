import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail, NotebookPen, KeyRound } from 'lucide-react'
import api from '../api/client'
import { errorMessage } from '../domain/tracker'
import { notifySessionChanged } from '../store/auth'
import { useFormProtection } from './useFormProtection'

export function PasswordReset({ confirm = false }) {
  const [token, setToken] = useState(() => confirm ? new URLSearchParams(window.location.hash.slice(1)).get('token') || '' : '')
  const [available, setAvailable] = useState(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const pending = useRef(null)
  const protection = useFormProtection(busy)
  useEffect(() => {
    if (confirm) window.history.replaceState(window.history.state, '', window.location.pathname)
    const controller = new AbortController()
    if (!confirm) api.get('/members/password-reset/options', { signal: controller.signal })
      .then(({ data }) => { if (!controller.signal.aborted) setAvailable(data.available === true) })
      .catch(failure => { if (!controller.signal.aborted) setError(errorMessage(failure)) })
    return () => { controller.abort(); pending.current?.abort() }
  }, [confirm, retry])
  const valid = /^[A-Za-z0-9_-]{43}$/.test(token)
  async function submit(event) {
    event.preventDefault()
    if (busy) return
    const form = event.currentTarget
    const fields = Object.fromEntries(new FormData(form))
    if (confirm && fields.newPassword !== fields.confirmPassword) {
      setError('새 비밀번호가 서로 일치하지 않습니다.'); return
    }
    const request = new AbortController()
    pending.current = request
    setBusy(true); setError('')
    try {
      await api.post(`/members/password-reset/${confirm ? 'confirm' : 'requests'}`,
        confirm ? { token, newPassword: fields.newPassword } : { username: fields.username, email: fields.email },
        { signal: request.signal })
      if (request.signal.aborted) return
      form.reset(); protection.clear(); setDone(true)
      if (confirm) { setToken(''); notifySessionChanged() }
    } catch (failure) { if (!request.signal.aborted) setError(errorMessage(failure)) }
    finally { if (!request.signal.aborted) setBusy(false) }
  }
  return <main className="auth-page"><Link className="brand" to="/login"><NotebookPen size={26} />취준노트</Link>
    <section className="auth-form"><h1>{confirm ? '새 비밀번호 설정' : '비밀번호 찾기'}</h1>
      {done ? <p role="status">{confirm ? '비밀번호를 변경하고 모든 기기에서 로그아웃했습니다. 새 비밀번호로 로그인해 주세요.' : '입력한 정보와 인증된 복구 이메일이 일치하면 재설정 메일을 보내드립니다. 스팸함도 확인해 주세요. 메일이 오지 않으면 잠시 후 다시 요청해 주세요.'}</p>
        : confirm && !valid ? <p role="alert">유효한 재설정 링크가 없습니다. 메일의 링크를 다시 열거나 새 메일을 요청해 주세요.</p>
          : !confirm && available !== true ? <p role="status">{available === false ? '현재 이메일 복구 기능을 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.' : '이메일 복구 기능을 확인하고 있습니다.'}</p>
            : <form onSubmit={submit} onChange={protection.markDirty}>
              {confirm ? <>
                <p className="muted">변경하면 모든 기기에서 다시 로그인해야 합니다.</p>
                <label>새 비밀번호<input name="newPassword" type="password" required autoComplete="new-password" minLength={8} maxLength={30} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,30}" title="영문과 숫자를 포함한 8~30자" aria-describedby="reset-password-rule" /></label>
                <p id="reset-password-rule" className="field-hint">영문과 숫자를 모두 포함, 8~30자</p>
                <label>새 비밀번호 확인<input name="confirmPassword" type="password" required autoComplete="new-password" minLength={8} maxLength={30} /></label>
              </> : <>
                <p className="muted">내 정보에서 미리 인증한 복구 이메일이 필요합니다.</p>
                <label>아이디<input name="username" required maxLength={20} autoComplete="username" /></label>
                <label>복구 이메일<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
              </>}
              <button className="primary" disabled={busy}>{confirm ? <KeyRound size={18} /> : <Mail size={18} />}{busy ? '처리 중...' : confirm ? '비밀번호 변경' : '재설정 메일 요청'}</button>
            </form>}
      {error && <p role="alert" className="error">{error}</p>}
      {!confirm && available === null && error && <button onClick={() => { setError(''); setRetry(value => value + 1) }}>다시 확인</button>}
      {!confirm && done && <button onClick={() => { setDone(false); setError('') }}>다시 요청</button>}
      {confirm && !done && <Link to="/forgot-password">새 재설정 메일 요청</Link>}
      <p className="auth-switch"><Link to="/login">로그인으로 돌아가기</Link></p>
    </section>
  </main>
}
