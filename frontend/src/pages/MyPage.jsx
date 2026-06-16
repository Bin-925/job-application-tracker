import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { removeToken } from '../store/auth'

const COLOR_OPTIONS = [
    { value: 'blue', bg: 'bg-blue-100', text: 'text-blue-500' },
    { value: 'green', bg: 'bg-green-100', text: 'text-green-500' },
    { value: 'amber', bg: 'bg-amber-100', text: 'text-amber-500' },
    { value: 'red', bg: 'bg-red-100', text: 'text-red-500' },
    { value: 'purple', bg: 'bg-purple-100', text: 'text-purple-500' },
    { value: 'pink', bg: 'bg-pink-100', text: 'text-pink-500' },
]

function getAvatarStyle(avatar) {
    const color = COLOR_OPTIONS.find((c) => c.value === avatar)
    if (color) return { type: 'color', bg: color.bg, text: color.text }
    return { type: 'emoji', emoji: avatar }
}

export default function MyPage() {
    const navigate = useNavigate()
    const [member, setMember] = useState(null)
    const [dark, setDark] = useState(
        document.documentElement.classList.contains('dark')
    )
    const [showLogoutModal, setShowLogoutModal] = useState(false)

    useEffect(() => {
        const fetch = async () => {
            try {
                const res = await api.get('/members/me')
                setMember(res.data)
            } catch {
                navigate('/login')
            }
        }
        fetch()
    }, [])

    const toggleDark = () => {
        const next = !dark
        setDark(next)
        if (next) document.documentElement.classList.add('dark')
        else document.documentElement.classList.remove('dark')
    }

    const onLogout = () => {
        removeToken()
        navigate('/login')
    }

    const initial = member?.nickname?.charAt(0).toUpperCase() || '?'
    const avatarStyle = member ? getAvatarStyle(member.avatar) : { type: 'color', bg: 'bg-blue-100', text: 'text-blue-500' }

    return (
        <div className="px-4 pt-6 pb-4">
            <p className="text-lg font-semibold mb-6">마이페이지</p>

            {/* 프로필 카드 */}
            <div
                className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-4 flex items-center gap-3 mb-6 cursor-pointer active:opacity-70"
                onClick={() => navigate('/mypage/account')}
            >
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-semibold flex-shrink-0 ${
                    avatarStyle.type === 'color' ? `${avatarStyle.bg} ${avatarStyle.text}` : 'bg-gray-100 dark:bg-gray-700'
                }`}>
                    {avatarStyle.type === 'color' ? initial : <span className="text-2xl leading-none">{avatarStyle.emoji}</span>}
                </div>
                <div className="flex-1">
                    <p className="text-sm font-semibold">{member?.nickname || '...'}</p>
                    <p className="text-xs text-gray-400 mt-0.5">@{member?.username || '...'}</p>
                </div>
                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                </svg>
            </div>

            {/* 설정 */}
            <p className="text-xs text-gray-400 mb-2 ml-1">설정</p>
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 mb-6">
                <div className="flex items-center justify-between py-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                        </svg>
                        <span className="text-sm">다크 모드</span>
                    </div>
                    <button
                        onClick={toggleDark}
                        style={{
                            width: 44, height: 24, borderRadius: 12,
                            backgroundColor: dark ? '#3b82f6' : '#d1d5db',
                            position: 'relative', border: 'none', cursor: 'pointer',
                            transition: 'background-color 0.2s', flexShrink: 0,
                        }}
                    >
            <span style={{
                position: 'absolute', top: 2, left: dark ? 22 : 2,
                width: 20, height: 20, borderRadius: '50%',
                backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                transition: 'left 0.2s', display: 'block',
            }} />
                    </button>
                </div>

                <div className="flex items-center justify-between py-4">
                    <div className="flex items-center gap-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                        </svg>
                        <span className="text-sm">마감 알림</span>
                    </div>
                    <span className="text-xs text-gray-400">준비 중</span>
                </div>
            </div>

            {/* 로그아웃 — 설정 카드 바로 아래 */}
            <button
                onClick={() => setShowLogoutModal(true)}
                className="w-full bg-gray-100 dark:bg-gray-800 rounded-2xl py-4 text-sm font-medium text-red-400"
            >
                로그아웃
            </button>

            {/* 로그아웃 확인 팝업 */}
            {showLogoutModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6"
                     onClick={() => setShowLogoutModal(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-xs"
                         onClick={(e) => e.stopPropagation()}>
                        <p className="text-base font-semibold mb-2 text-center text-gray-900 dark:text-white">로그아웃 하시겠어요?</p>
                        <p className="text-sm text-gray-400 text-center mb-6">
                            다시 로그인하려면<br />아이디와 비밀번호가 필요해요.
                        </p>
                        <div className="flex gap-2">
                            <button onClick={() => setShowLogoutModal(false)}
                                    className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-xl py-3 text-sm font-medium text-gray-900 dark:text-white">
                                취소
                            </button>
                            <button onClick={onLogout}
                                    className="flex-1 bg-red-500 text-white rounded-xl py-3 text-sm font-medium">
                                로그아웃
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}