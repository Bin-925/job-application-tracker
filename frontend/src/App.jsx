import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { Workspace } from './workspace/Workspace'
import { AuthPage } from './workspace/AuthPage'
import { Today, Applications, Calendar, Detail, Settings, ApplicationAction } from './workspace/Pages'

function ScrollReset() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

export default function App() {
  return <BrowserRouter><ScrollReset /><Routes>
    <Route path="/login" element={<AuthPage />} />
    <Route path="/join" element={<AuthPage join />} />
    <Route element={<Workspace />}>
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
  </Routes></BrowserRouter>
}
