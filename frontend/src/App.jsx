import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import HomePage from './pages/HomePage'
import CalendarPage from './pages/CalendarPage'
import MyPage from './pages/MyPage'
import LoginPage from './pages/LoginPage'
import JoinPage from './pages/JoinPage'

function App() {
  return (
      <BrowserRouter>
        <Routes>
          {/* 인증 없이 접근 가능 */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/join" element={<JoinPage />} />

          {/* 탭바 있는 화면들 */}
          <Route element={<Layout />}>
            <Route path="/" element={<HomePage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/mypage" element={<MyPage />} />
          </Route>

          {/* 나머지 경로는 홈으로 */}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
  )
}

export default App