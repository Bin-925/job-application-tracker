import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'

const STATUS_LABEL = {
    TO_APPLY: '지원예정', APPLIED: '지원완료', DOC_PASSED: '서류합격',
    INTERVIEW: '면접', ACCEPTED: '최종합격', REJECTED: '불합격',
}
const STATUS_STYLE = {
    TO_APPLY: 'bg-gray-100 text-gray-600', APPLIED: 'bg-blue-100 text-blue-600',
    DOC_PASSED: 'bg-indigo-100 text-indigo-600', INTERVIEW: 'bg-amber-100 text-amber-600',
    ACCEPTED: 'bg-green-100 text-green-600', REJECTED: 'bg-red-100 text-red-600',
}

export default function ApplicationDetailPage() {
    const navigate = useNavigate()
    const { id } = useParams()
    const [app, setApp] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        const fetch = async () => {
            try {
                const res = await api.get(`/applications/${id}`)
                setApp(res.data)
            } catch {
                navigate('/')
            } finally {
                setLoading(false)
            }
        }
        fetch()
    }, [id])

    if (loading) return (
        <div className="flex justify-center items-center h-full text-gray-400 text-sm">
            불러오는 중...
        </div>
    )
    if (!app) return null

    const rowClass = "py-4 border-b border-gray-200 dark:border-gray-700"
    const labelClass = "text-xs font-semibold text-gray-900 dark:text-white mb-1"
    const valueClass = "text-sm text-gray-500 dark:text-gray-400"

    return (
        <div className="bg-white dark:bg-black text-gray-900 dark:text-white">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <span className="text-base font-semibold">지원 상세</span>
                </div>
                <button
                    onClick={() => navigate(`/applications/${id}/edit`)}
                    className="text-blue-500 text-sm font-medium"
                >
                    수정
                </button>
            </div>

            <div className="px-4 py-5">
                {/* 회사명 + 상태 */}
                <div className="flex items-center gap-2 mb-1">
                    <h1 className="text-xl font-bold">{app.company}</h1>
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${STATUS_STYLE[app.status]}`}>
            {STATUS_LABEL[app.status]}
          </span>
                </div>
                <p className="text-sm text-gray-400 mb-6">{app.position}</p>

                {/* 정보 카드 */}
                <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4">
                    <div className={rowClass}>
                        <p className={labelClass}>지원일</p>
                        <p className={valueClass}>{app.appliedDate || '-'}</p>
                    </div>
                    <div className={rowClass}>
                        <p className={labelClass}>마감일</p>
                        <p className={valueClass}>{app.deadline || '-'}</p>
                    </div>
                    <div className={rowClass}>
                        <p className={labelClass}>면접일</p>
                        <p className={valueClass}>{app.interviewDate || '-'}</p>
                    </div>
                    <div className={rowClass}>
                        <p className={labelClass}>면접 시간</p>
                        <p className={valueClass}>{app.interviewTime ? app.interviewTime.slice(0, 5) : '-'}</p>
                    </div>
                    <div className={rowClass}>
                        <p className={labelClass}>공고 링크</p>
                        {app.link ? (
                            <a href={app.link} target="_blank" rel="noreferrer"
                               className="text-sm text-blue-500 break-all">{app.link}</a>
                        ) : (
                            <p className={valueClass}>-</p>
                        )}
                    </div>
                    <div className="py-4">
                        <p className={labelClass}>메모</p>
                        <p className={`${valueClass} whitespace-pre-wrap`}>{app.memo || '-'}</p>
                    </div>
                </div>
            </div>
        </div>
    )
}