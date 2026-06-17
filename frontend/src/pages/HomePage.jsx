import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { getNotifications } from '../utils/notifications'

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

const FILTERS = [
    { value: 'ALL', label: '전체' },
    { value: 'TO_APPLY', label: '지원예정' },
    { value: 'APPLIED', label: '지원완료' },
    { value: 'DOC_PASSED', label: '서류합격' },
    { value: 'INTERVIEW', label: '면접' },
    { value: 'ACCEPTED', label: '최종합격' },
    { value: 'REJECTED', label: '불합격' },
]

const SORT_OPTIONS = [
    { value: 'appliedDate', label: '지원일' },
    { value: 'deadline', label: '마감일' },
    { value: 'interviewDate', label: '면접일' },
]

export default function HomePage() {
    const navigate = useNavigate()
    const [applications, setApplications] = useState([])
    const [stats, setStats] = useState({})
    const [loading, setLoading] = useState(true)
    const [filter, setFilter] = useState('ALL')
    const [search, setSearch] = useState('')
    const [sortKey, setSortKey] = useState('appliedDate')
    const [sortDesc, setSortDesc] = useState(true)

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
    const notiCount = getNotifications(applications).length

    // 필터 → 검색 → 정렬
    let visibleApps = filter === 'ALL'
        ? applications
        : applications.filter((app) => app.status === filter)

    if (search.trim()) {
        const q = search.trim().toLowerCase()
        visibleApps = visibleApps.filter((app) =>
            app.company?.toLowerCase().includes(q))
    }

    visibleApps = [...visibleApps].sort((a, b) => {
        const av = a[sortKey]
        const bv = b[sortKey]
        if (!av && !bv) return 0
        if (!av) return 1
        if (!bv) return -1
        const cmp = av.localeCompare(bv)
        return sortDesc ? -cmp : cmp
    })

    if (loading) return (
        <div className="flex justify-center items-center h-full text-gray-400 text-sm">
            불러오는 중...
        </div>
    )

    const selectClass = "w-full appearance-none bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg pl-3 pr-7 py-1.5 text-xs outline-none cursor-pointer"
    const chevron = (
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
      <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </span>
    )

    return (
        <div className="px-4 pt-6 pb-4">
            <div className="flex items-start justify-between mb-5">
                <div>
                    <h1 className="text-lg font-semibold">지원 트래커</h1>
                    <p className="text-sm text-gray-400 mt-0.5">내 지원 현황을 한눈에</p>
                </div>
                <button onClick={() => navigate('/notifications')} className="relative p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-gray-600 dark:text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    {notiCount > 0 && (
                        <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-black" />
                    )}
                </button>
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

            {/* 검색창 */}
            <div className="relative mb-3">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </span>
                <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="회사명 검색"
                    className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>

            {/* 상태 필터 + 정렬 기준 + 정렬 방향 (한 줄) */}
            <div className="flex items-center gap-2 mb-3">
                <div className="relative flex-[3]">
                    <select value={filter} onChange={(e) => setFilter(e.target.value)} className={selectClass}>
                        {FILTERS.map((f) => (
                            <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                    </select>
                    {chevron}
                </div>

                <div className="relative flex-[3]">
                    <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className={selectClass}>
                        {SORT_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </select>
                    {chevron}
                </div>

                <div className="relative flex-[4]">
                    <select
                        value={sortDesc ? 'desc' : 'asc'}
                        onChange={(e) => setSortDesc(e.target.value === 'desc')}
                        className={selectClass}
                    >
                        <option value="desc">늦은 날짜순</option>
                        <option value="asc">빠른 날짜순</option>
                    </select>
                    {chevron}
                </div>
            </div>

            <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold">내 지원</span>
                <span className="text-xs text-gray-400">{visibleApps.length}건</span>
            </div>

            {visibleApps.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-300">
                    {applications.length === 0 ? (
                        <>
                            <p className="text-sm">아직 지원 내역이 없어요</p>
                            <p className="text-xs mt-1">아래 + 버튼으로 추가해보세요</p>
                        </>
                    ) : (
                        <p className="text-sm">조건에 맞는 지원이 없어요</p>
                    )}
                </div>
            ) : (
                <div className="flex flex-col gap-2">
                    {visibleApps.map((app) => (
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