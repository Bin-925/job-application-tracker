import { useSession } from '../store/sessionContext'
import './SessionNotice.css'

export function SessionNotice() {
  const { verificationError, verifying, refreshSession } = useSession()
  if (!verificationError) return null
  return <div className="notice session-notice">
    <p role="alert">로그인 상태를 다시 확인하지 못했습니다. 입력은 유지되며, 확인 후 저장할 수 있습니다.</p>
    <button type="button" disabled={verifying} onClick={refreshSession}>로그인 다시 확인</button>
  </div>
}
