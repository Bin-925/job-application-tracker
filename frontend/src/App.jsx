import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/layout/Layout'
import PrivateRoute from './components/layout/PrivateRoute'
import HomePage from './pages/HomePage'
import CalendarPage from './pages/CalendarPage'
import MyPage from './pages/MyPage'
import LoginPage from './pages/LoginPage'
import JoinPage from './pages/JoinPage'
import ApplicationNewPage from './pages/ApplicationNewPage'
import ApplicationEditPage from './pages/ApplicationEditPage'

function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/join" element={<JoinPage />} />

                <Route element={<PrivateRoute />}>
                    <Route element={<Layout />}>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/calendar" element={<CalendarPage />} />
                        <Route path="/mypage" element={<MyPage />} />
                    </Route>
                    <Route path="/applications/new" element={<ApplicationNewPage />} />
                    <Route path="/applications/:id/edit" element={<ApplicationEditPage />} />
                </Route>

                <Route path="*" element={<Navigate to="/" />} />
            </Routes>
        </BrowserRouter>
    )
}

export default App