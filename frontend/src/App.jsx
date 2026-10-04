import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Workspace } from './workspace/Workspace'
import { AuthPage } from './workspace/AuthPage'
import { VerifyRecoveryEmail } from './workspace/RecoveryEmail'
import { Today, Applications, Calendar, Detail, Settings, ApplicationAction } from './workspace/Pages'
import { SessionProvider } from './store/SessionProvider'
import { useSession } from './store/sessionContext'

function ProtectedWorkspace() {
  const { status, member, refreshSession } = useSession()
  if (status === 'checking') return <p className="empty" role="status">로그인 확인 중...</p>
  if (status === 'error') return <main className="empty"><p role="alert">서버에 연결할 수 없습니다.</p><button onClick={refreshSession}>다시 시도</button></main>
  if (!member) return <Navigate to="/login" replace />
  return <Workspace key={member.id} />
}

function ScrollReset() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

export default function App() {
  return <SessionProvider><BrowserRouter><ScrollReset /><Routes>
    <Route path="/login" element={<AuthPage key="login" />} />
    <Route path="/join" element={<AuthPage key="join" join />} />
    <Route path="/verify-email" element={<VerifyRecoveryEmail />} />
    <Route element={<ProtectedWorkspace />}>
      <Route index element={<Today />} />
      <Route path="applications" element={<Applications />} />
      <Route path="applications/new" element={<ApplicationAction />} />
      <Route path="applications/:id" element={<Detail />} />
      <Route path="applications/:id/edit" element={<ApplicationAction edit />} />
      <Route path="calendar" element={<Calendar />} />
      <Route path="mypage" element={<Settings />} />
      <Route path="mypage/account" element={<Navigate to="/mypage" replace />} />
      <Route path="mypage/account/password" element={<Navigate to="/mypage" replace />} />
      <Route path="notifications" element={<Navigate to="/calendar" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Route>
  </Routes></BrowserRouter></SessionProvider>
}
