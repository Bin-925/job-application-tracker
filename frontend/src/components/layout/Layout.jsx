import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import TabBar from './TabBar'
import PhoneFrame from './PhoneFrame'

export default function Layout() {
    const location = useLocation()
    const navigate = useNavigate()
    // 홈(/)과 캘린더(/calendar)에서만 FAB 표시
    const showFab = location.pathname === '/' || location.pathname === '/calendar'

    return (
        <PhoneFrame>
            <main className="flex-1 overflow-y-auto pb-28">
                <Outlet />
            </main>
            {showFab && (
                <button
                    onClick={() => navigate('/applications/new')}
                    aria-label="지원 정보 추가"
                    className="absolute bottom-20 right-4 w-14 h-14 bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center z-10"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                </button>
            )}
            <TabBar />
        </PhoneFrame>
    )
}