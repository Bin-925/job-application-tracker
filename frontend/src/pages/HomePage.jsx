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

// 필터 칩 목록 (전체 + 6개 상태)
const FILTERS = [
    { value: 'ALL', label: '전체' },
    { value: 'TO_APPLY', label: '지원예정' },
    { value: 'APPLIED', label: '지원완료' },
    { value: 'DOC_PASSED', label: '서류합격' },
    { value: 'INTERVIEW', label: '면접' },
    { value: 'ACCEPTED', label: '최종합격' },
    { value: 'REJECTED', label: '불합격' },
]

export default function HomePage() {
    const navigate = useNavigate()
    const [applications, setApplications] = useState([])
    const [stats, setStats] = useState({})
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('ALL')
    const dragScroll = useDragScroll()

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
            } finally {
                setLoading(false)
            }
        }
        fetchData()
    }, [])

    const inProgress = (stats.APPLIED || 0) + (stats.DOC_PASSED || 0) + (stats.INTERVIEW || 0)

    // 선택된 필터에 맞는 목록만
    const filteredApps = filter === 'ALL'
        ? applications
        : applications.filter((app) => app.status === filter)

    if (loading) return (
        <div className="flex justify-center items-center h-full text-gray-400 text-sm">
            불러오는 중...
        </div>
    )

    return (
        <div className="px-4 pt-6 pb-4">
            <div className="mb-5">
                <h1 className="text-lg font-semibold">지원 트래커</h1>
                <p className="text-sm text-gray-400 mt-0.5">내 지원 현황을 한눈에</p>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
                {[
                    { label: '전체 지원', value: applications.length },
                    { label: '진행 중', value: inProgress },
                    { label: '면접', value: stats.INTERVIEW || 0, color: 'text-amber-500' },
                    { label: '최종 합격', value: stats.ACCEPTED || 0, color: 'text-green-500' },
                ].map((s) => (
                    <div key={s.label} className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-4">
                        <p className="text-xs text-gray-500 mb-1">{s.label}</p>
                        <p className={`text-2xl font-semibold ${s.color || ''}`}>{s.value}</p>
                    </div>
                ))}
            </div>

            {/* 필터 칩 */}
            <div className="flex gap-2 overflow-x-auto pb-2 mb-3 -mx-4 px-4">
                {FILTERS.map((f) => (
                    <button
                        key={f.value}
                        onClick={() => setFilter(f.value)}
                        className={`flex-shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                            filter === f.value
                                ? 'bg-blue-500 text-white border-blue-500'
                                : 'bg-transparent text-gray-500 border-gray-300 dark:border-gray-600'
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">내 지원</span>
                <span className="text-xs text-gray-400">{filteredApps.length}건</span>
            </div>

            {filteredApps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                    {applications.length === 0 ? (
                        <>
                            <p className="text-sm">아직 지원 내역이 없어요</p>
                            <p className="text-xs mt-1">아래 + 버튼으로 추가해보세요</p>
                        </>
                    ) : (
                        <p className="text-sm">해당 상태의 지원이 없어요</p>
                    )}
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {filteredApps.map((app) => (
                        <div
                            key={app.id}
                            onClick={() => navigate(`/calendar?date=${app.appliedDate || ''}`)}
                            className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-4 cursor-pointer active:opacity-70"
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                    <p className="text-sm font-semibold truncate">{app.company}</p>
                                    <p className="text-xs text-gray-400 mt-0.5 truncate">{app.position}</p>
                                </div>
                                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLE[app.status]}`}>
                    {STATUS_LABEL[app.status]}
                  </span>
                                    {app.deadline && (
                                        <span className="text-xs text-red-400">⏰ 마감 {app.deadline}</span>
                                    )}
                                </div>
                            </div>

                            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs">
                                <span className="text-blue-500">📨 지원 {app.appliedDate || '-'}</span>
                                <span className="text-green-500">
                  🎤 {app.interviewDate || '-'}
                                    {app.interviewTime ? ` ${app.interviewTime.slice(0, 5)}` : ''}
                </span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}