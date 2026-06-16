import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

const STATUS_LABEL = {
    TO_APPLY: '지원예정',
    APPLIED: '지원완료',
    DOC_PASSED: '서류합격',
    INTERVIEW: '면접',
    ACCEPTED: '최종합격',
    REJECTED: '불합격',
}

const STATUS_STYLE = {
    TO_APPLY: 'bg-gray-100 text-gray-600',
    APPLIED: 'bg-blue-100 text-blue-600',
    DOC_PASSED: 'bg-indigo-100 text-indigo-600',
    INTERVIEW: 'bg-amber-100 text-amber-600',
    ACCEPTED: 'bg-green-100 text-green-600',
    REJECTED: 'bg-red-100 text-red-600',
}

export default function HomePage() {
    const navigate = useNavigate()
    const [applications, setApplications] = useState([])
    const [stats, setStats] = useState({})
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetchData = async () => {
            try {
                const [appRes, statRes] = await Promise.all([
                    api.get('/applications'),
                    api.get('/applications/stats'),
                ])
                setApplications(appRes.data)
                setStats(statRes.data)
            } catch {
                // 토큰 만료 등
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [])

    const inProgress = (stats.APPLIED || 0) + (stats.DOC_PASSED || 0) + (stats.INTERVIEW || 0)

    if (loading) return (
        <div className="flex justify-center items-center h-screen text-gray-400 text-sm">
            불러오는 중...
        </div>
    )

    return (
        <div className="px-4 pt-6 pb-4">
            {/* 헤더 */}
            <div className="mb-5">
                <h1 className="text-lg font-semibold">지원 트래커</h1>
                <p className="text-sm text-gray-400 mt-0.5">내 지원 현황을 한눈에</p>
            </div>

            {/* 통계 4칸 */}
            <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                    { label: '전체 지원', value: applications.length },
                    { label: '진행 중', value: inProgress },
                    { label: '면접', value: stats.INTERVIEW || 0, color: 'text-amber-500' },
                    { label: '최종 합격', value: stats.ACCEPTED || 0, color: 'text-green-500' },
                ].map((s) => (
                    <div key={s.label} className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-4">
                        <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                        <p className={`text-2xl font-semibold ${s.color || ''}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* 목록 헤더 */}
            <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">내 지원</span>
                <span className="text-xs text-gray-400">{applications.length}건</span>
            </div>

            {/* 지원 목록 */}
            {applications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                    <p className="text-sm">아직 지원 내역이 없어요</p>
                    <p className="text-xs mt-1">아래 + 버튼으로 추가해보세요</p>
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {applications.map((app) => (
                        <div
                            key={app.id}
                            className="bg-gray-50 dark:bg-gray-900 rounded-2xl p-4"
                        >
                            <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold">{app.company}</span>
                                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLE[app.status]}`}>
                    {STATUS_LABEL[app.status]}
                  </span>
                                </div>
                                <button
                                    onClick={() => navigate(`/applications/${app.id}/edit`)}
                                    className="text-gray-300 hover:text-gray-500 flex-shrink-0"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
                                    </svg>
                                </button>
                            </div>
                            <p className="text-xs text-gray-400 mb-2">{app.position}</p>
                            {app.deadline && (
                                <p className="text-xs text-gray-300">
                                    마감 {app.deadline}
                                </p>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* 추가 버튼 */}
            <button
                onClick={() => navigate('/applications/new')}
                className="fixed bottom-20 right-4 w-14 h-14 bg-blue-500 text-white rounded-full shadow-lg flex items-center justify-center text-2xl"
            >
                +
            </button>
        </div>
    )
}