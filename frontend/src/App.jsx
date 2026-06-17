import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import PhoneFrame from './components/layout/PhoneFrame'
import PrivateRoute from './components/layout/PrivateRoute'
import HomePage from './pages/HomePage'
import CalendarPage from './pages/CalendarPage'
import MyPage from './pages/MyPage'
import LoginPage from './pages/LoginPage'
import JoinPage from './pages/JoinPage'
import ApplicationNewPage from './pages/ApplicationNewPage'
import ApplicationEditPage from './pages/ApplicationEditPage'
import ApplicationDetailPage from './pages/ApplicationDetailPage'
import AccountPage from './pages/AccountPage'
import PasswordChangePage from './pages/PasswordChangePage'

// 탭바 없는 페이지를 폰 프레임으로 감싸는 래퍼
function Framed({ children }) {
    return (
        <PhoneFrame>
            <div className="flex-1 overflow-y-auto h-full">
                {children}
            </div>
        </PhoneFrame>
    )
}

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<Framed><LoginPage /></Framed>} />
                <Route path="/join" element={<Framed><JoinPage /></Framed>} />

                <Route element={<PrivateRoute />}>
                    <Route element={<Layout />}>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/calendar" element={<CalendarPage />} />
                        <Route path="/mypage" element={<MyPage />} />
                    </Route>
                    <Route path="/applications/new" element={<Framed><ApplicationNewPage /></Framed>} />
                    <Route path="/applications/:id" element={<Framed><ApplicationDetailPage /></Framed>} />
                    <Route path="/applications/:id/edit" element={<Framed><ApplicationEditPage /></Framed>} />
                    <Route path="/mypage/account" element={<Framed><AccountPage /></Framed>} />
                    <Route path="/mypage/account/password" element={<Framed><PasswordChangePage /></Framed>} />
                </Route>

                <Route path="*" element={<Navigate to="/" />} />
            </Routes>
        </BrowserRouter>
    )
}

export default App