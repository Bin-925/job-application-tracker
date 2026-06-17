import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { getNotifications, dDayText } from '../utils/notifications'

export default function NotificationsPage() {
    const navigate = useNavigate()
    const [notis, setNotis] = useState([])
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetch = async () => {
            try {
                const res = await api.get('/applications')
                setNotis(getNotifications(res.data))
            } catch {
            } finally {
                setLoading(false)
            }
        }
        fetch()
    }, [])

    const typeStyle = (type) =>
        type === '면접' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
    const typeIcon = (type) => (type === '면접' ? '🎤' : '⏰')

    return (
        <div className="bg-white dark:bg-black text-gray-900 dark:text-white min-h-full">
            {/* 헤더 */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 dark:border-gray-800">
                <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <span className="text-base font-semibold">알림</span>
            </div>

            <div className="px-4 py-5">
                {loading ? (
                    <p className="text-center text-gray-400 text-sm py-10">불러오는 중...</p>
                ) : notis.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-gray-300">
                        <span className="text-4xl mb-3">🔔</span>
                        <p className="text-sm">3일 이내 일정이 없어요</p>
                        <p className="text-xs mt-1">면접·마감이 다가오면 여기에 표시돼요</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-2">
                        {notis.map((n, i) => (
                            <div
                                key={`${n.id}-${n.type}-${i}`}
                                onClick={() => navigate(`/applications/${n.id}`)}
                                className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-4 cursor-pointer active:opacity-70 flex items-center gap-3"
                            >
                                <span className="text-2xl">{typeIcon(n.type)}</span>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${typeStyle(n.type)}`}>
                      {n.type}
                    </span>
                                        <span className="text-sm font-semibold truncate">{n.company}</span>
                                    </div>
                                    <p className="text-xs text-gray-400">{n.date}</p>
                                </div>
                                <span className={`text-sm font-bold flex-shrink-0 ${n.dDay === 0 ? 'text-red-500' : 'text-blue-500'}`}>
                  {dDayText(n.dDay)}
                </span>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    )
}