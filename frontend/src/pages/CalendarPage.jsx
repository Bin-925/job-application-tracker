import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../api/client'
import InterviewScheduleModal from '../components/InterviewScheduleModal'

const STATUS_LABEL = {
    TO_APPLY: '지원예정', APPLIED: '지원완료', DOC_PASSED: '서류합격',
    INTERVIEW: '면접', ACCEPTED: '최종합격', REJECTED: '불합격',
}
const STATUS_STYLE = {
    TO_APPLY: 'bg-gray-100 text-gray-600', APPLIED: 'bg-blue-100 text-blue-600',
    DOC_PASSED: 'bg-indigo-100 text-indigo-600', INTERVIEW: 'bg-amber-100 text-amber-600',
    ACCEPTED: 'bg-green-100 text-green-600', REJECTED: 'bg-red-100 text-red-600',
}
const STATUS_ORDER = ['TO_APPLY', 'APPLIED', 'DOC_PASSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED']

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

function toKey(year, month, day) {
    const m = String(month + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${year}-${m}-${d}`
}

export default function CalendarPage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const dateParam = searchParams.get('date')

    const today = new Date()
    const todayKey = toKey(today.getFullYear(), today.getMonth(), today.getDate())
    const initDate = dateParam ? new Date(dateParam) : today

    const [applications, setApplications] = useState([])
    const [current, setCurrent] = useState(initDate)
    const [selected, setSelected] = useState(dateParam || todayKey)
    const [openStatusId, setOpenStatusId] = useState(null)
    const [interviewModalApp, setInterviewModalApp] = useState(null)

    const fetchApps = async () => {
        try {
            const res = await api.get('/applications')
            setApplications(res.data)
        } catch {}
    }

    useEffect(() => {
        fetchApps()
    }, [])

    // 상태 변경
    const changeStatus = async (e, appId, newStatus) => {
        e.stopPropagation()
        setOpenStatusId(null)
        setApplications((prev) =>
            prev.map((app) => (app.id === appId ? { ...app, status: newStatus } : app)))
        try {
            await api.patch(`/applications/${appId}/status`, { status: newStatus })
        } catch {
            fetchApps()
        }
    }

    const toggleStatusMenu = (e, key) => {
        e.stopPropagation()
        setOpenStatusId(openStatusId === key ? null : key)
    }

    // 면접 일정 모달 열기
    const openInterviewModal = (e, app) => {
        e.stopPropagation()
        setInterviewModalApp(app)
    }

    // 면접 일정 저장 (PUT)
    const saveInterview = async ({ interviewDate, interviewTime }) => {
        const app = interviewModalApp
        setApplications((prev) =>
            prev.map((a) => (a.id === app.id ? { ...a, interviewDate, interviewTime } : a)))
        try {
            await api.put(`/applications/${app.id}`, {
                company: app.company,
                position: app.position,
                status: app.status,
                appliedDate: app.appliedDate,
                deadline: app.deadline || null,
                interviewDate: interviewDate,
                interviewTime: interviewTime,
                link: app.link || null,
                memo: app.memo || null,
            })
        } catch {
            fetchApps()
        } finally {
            setInterviewModalApp(null)
        }
    }

    const year = current.getFullYear()
    const month = current.getMonth()

    const eventMap = {}
    const addEvent = (dateStr, type, app) => {
        if (!dateStr) return
        if (!eventMap[dateStr]) eventMap[dateStr] = { applied: [], interview: [], deadline: [] }
        eventMap[dateStr][type].push(app)
    }
    applications.forEach((app) => {
        addEvent(app.appliedDate, 'applied', app)
        addEvent(app.interviewDate, 'interview', app)
        addEvent(app.deadline, 'deadline', app)
    })

    const firstDay = new Date(year, month, 1).getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const cells = []
    for (let i = 0; i < firstDay; i++) cells.push(null)
    for (let d = 1; d <= daysInMonth; d++) cells.push(d)

    const prevMonth = () => setCurrent(new Date(year, month - 1, 1))
    const nextMonth = () => setCurrent(new Date(year, month + 1, 1))

    const selectedEvents = eventMap[selected] || { applied: [], interview: [], deadline: [] }
    const allSelectedApps = [
        ...selectedEvents.applied.map((a) => ({ ...a, _type: '지원', _color: 'bg-blue-500' })),
        ...selectedEvents.interview.map((a) => ({ ...a, _type: '면접', _color: 'bg-green-500' })),
        ...selectedEvents.deadline.map((a) => ({ ...a, _type: '마감', _color: 'bg-red-500' })),
    ]

    return (
        <div className="px-4 pt-6 pb-4" onClick={() => setOpenStatusId(null)}>
            <div className="flex items-center justify-between mb-5">
                <button onClick={prevMonth} className="text-gray-400 p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <span className="text-base font-semibold">{year}년 {month + 1}월</span>
                <button onClick={nextMonth} className="text-gray-400 p-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            <div className="grid grid-cols-7 mb-2">
                {WEEKDAYS.map((w, i) => (
                    <div key={w} className={`text-center text-xs font-medium ${
                        i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-gray-400'
                    }`}>
                        {w}
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-7 gap-y-1 mb-5">
                {cells.map((day, idx) => {
                    if (day === null) return <div key={`empty-${idx}`} />
                    const key = toKey(year, month, day)
                    const ev = eventMap[key]
                    const isToday = key === todayKey
                    const isSelected = key === selected

                    return (
                        <button
                            key={key}
                            onClick={(e) => { e.stopPropagation(); setSelected(key) }}
                            className="flex flex-col items-center py-1"
                        >
                            <div className={`w-8 h-8 flex items-center justify-center rounded-full text-sm ${
                                isSelected ? 'bg-blue-500 text-white font-semibold'
                                    : isToday ? 'ring-1 ring-blue-400 text-blue-500'
                                        : 'text-gray-700 dark:text-gray-300'
                            }`}>
                                {day}
                            </div>
                            <div className="flex gap-0.5 h-1.5 mt-0.5">
                                {ev?.applied.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                                {ev?.interview.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-green-500" />}
                                {ev?.deadline.length > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                            </div>
                        </button>
                    )
                })}
            </div>

            <div className="flex items-center justify-center gap-4 mb-5 text-xs text-gray-400">
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> 지원일</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> 면접일</div>
                <div className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> 마감일</div>
            </div>

            <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
                <p className="text-sm font-semibold mb-3">{selected.replaceAll('-', '. ')}</p>
                {allSelectedApps.length === 0 ? (
                    <p className="text-sm text-gray-300 text-center py-6">이 날짜에 일정이 없어요</p>
                ) : (
                    <div className="flex flex-col gap-2">
                        {allSelectedApps.map((app, i) => {
                            const cardKey = `${app.id}-${app._type}-${i}`
                            return (
                                <div
                                    key={cardKey}
                                    onClick={() => navigate(`/applications/${app.id}`)}
                                    className="bg-gray-100 dark:bg-gray-800 rounded-2xl p-4 cursor-pointer active:opacity-70"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className={`w-2 h-2 rounded-full ${app._color} flex-shrink-0`} />
                                                <span className="text-xs text-gray-400">{app._type}</span>
                                            </div>
                                            <p className="text-sm font-semibold truncate mt-1">{app.company}</p>
                                            <p className="text-xs text-gray-400 mt-0.5 truncate">{app.position}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                            {/* 상태 배지 (탭하면 드롭다운) */}
                                            <div className="relative">
                                                <button
                                                    onClick={(e) => toggleStatusMenu(e, cardKey)}
                                                    className={`text-xs font-medium px-2.5 py-1 rounded-full flex items-center gap-1 ${STATUS_STYLE[app.status]}`}
                                                >
                                                    {STATUS_LABEL[app.status]}
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                                                    </svg>
                                                </button>
                                                {openStatusId === cardKey && (
                                                    <div
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="absolute right-0 mt-1 w-28 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 overflow-hidden"
                                                    >
                                                        {STATUS_ORDER.map((st) => (
                                                            <button
                                                                key={st}
                                                                onClick={(e) => changeStatus(e, app.id, st)}
                                                                className={`w-full text-left text-xs px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-800 ${
                                                                    st === app.status ? 'font-semibold text-blue-500' : 'text-gray-700 dark:text-gray-300'
                                                                }`}
                                                            >
                                                                {STATUS_LABEL[st]}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            {app.deadline && (
                                                <span className="text-xs text-red-400">⏰ 마감 {app.deadline}</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 text-xs">
                                        <span className="text-blue-500">📨 지원 {app.appliedDate || '-'}</span>
                                        {/* 면접일/시간 (탭하면 모달) */}
                                        <button
                                            onClick={(e) => openInterviewModal(e, app)}
                                            className="text-green-500 hover:underline"
                                        >
                                            🎤 {app.interviewDate || '일정 추가'}
                                            {app.interviewTime ? ` ${app.interviewTime.slice(0, 5)}` : ''}
                                        </button>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>

            {/* 면접 일정 모달 */}
            {interviewModalApp && (
                <InterviewScheduleModal
                    app={interviewModalApp}
                    onClose={() => setInterviewModalApp(null)}
                    onSave={saveInterview}
                />
            )}
        </div>
    )
}