import { NavLink } from 'react-router-dom'

export default function TabBar() {
    const base = "flex flex-col items-center gap-1 flex-1 py-2 text-xs text-gray-400"
    const active = "text-blue-500"

    return (
        <nav className="absolute bottom-0 left-0 w-full flex border-t border-gray-200 bg-white dark:bg-black dark:border-gray-800">
            <NavLink to="/" end className={({ isActive }) => `${base} ${isActive ? active : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l9-9 9 9M4 10v10h6v-6h4v6h6V10"/></svg>
                홈
            </NavLink>
            <NavLink to="/calendar" className={({ isActive }) => `${base} ${isActive ? active : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                캘린더
            </NavLink>
            <NavLink to="/mypage" className={({ isActive }) => `${base} ${isActive ? active : ''}`}>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>
                마이페이지
            </NavLink>
        </nav>
    )
}