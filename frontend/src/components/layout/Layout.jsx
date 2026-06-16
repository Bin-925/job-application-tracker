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
            <main className="flex-1 overflow-y-auto pb-16">
                <Outlet />
            </main>

            {showFab && (
                <button
                    onClick={() => navigate('/applications/new')}
                    className="absolute bottom-20 right-4 w-14 h-14 bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center text-2xl z-10"
                >
                    +
                </button>
            )}

            <TabBar />
        </PhoneFrame>
    )
}