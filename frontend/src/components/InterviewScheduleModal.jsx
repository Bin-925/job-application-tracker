import { useState } from 'react'

export default function InterviewScheduleModal({ app, onClose, onSave }) {
    // 기존 값으로 초기화 (없으면 빈 값)
    const [date, setDate] = useState(app.interviewDate || '')
    const [time, setTime] = useState(app.interviewTime ? app.interviewTime.slice(0, 5) : '')
    const [saving, setSaving] = useState(false)

    const openPicker = (id) => {
        const el = document.getElementById(id)
        if (el) el.showPicker?.()
    }

    const handleSave = async () => {
        setSaving(true)
        // 시간은 HH:mm:ss 형식으로 (백엔드 LocalTime), 없으면 null
        const interviewTime = time ? `${time}:00` : null
        const interviewDate = date || null
        await onSave({ interviewDate, interviewTime })
        setSaving(false)
    }

    const handleClear = async () => {
        setSaving(true)
        await onSave({ interviewDate: null, interviewTime: null })
        setSaving(false)
    }

    const fieldClass = "bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl"

    return (
        // 배경 오버레이 (클릭하면 닫힘)
        <div
            onClick={onClose}
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6"
        >
            {/* 모달 본체 (클릭 전파 차단) */}
            <div
                onClick={(e) => e.stopPropagation()}
                className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-xs p-5 shadow-xl"
            >
                <div className="mb-4">
                    <h3 className="text-base font-semibold">면접 일정</h3>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{app.company} · {app.position}</p>
                </div>

                {/* 날짜 */}
                <div className="flex flex-col gap-1.5 mb-3">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">면접 날짜</label>
                    <div className={`${fieldClass} flex items-center px-3 py-2.5 cursor-pointer`}
                         onClick={() => openPicker('modalInterviewDate')}>
                        <input id="modalInterviewDate" type="date" name="interviewDate"
                               min={app.appliedDate || undefined}
                               value={date} onChange={(e) => setDate(e.target.value)}
                               className="flex-1 bg-transparent text-sm outline-none cursor-pointer" />
                    </div>
                </div>

                {/* 시간 */}
                <div className="flex flex-col gap-1.5 mb-5">
                    <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">면접 시간</label>
                    <div className={`${fieldClass} flex items-center px-3 py-2.5 cursor-pointer`}
                         onClick={() => openPicker('modalInterviewTime')}>
                        <input id="modalInterviewTime" type="time" name="interviewTime"
                               value={time} onChange={(e) => setTime(e.target.value)}
                               className="flex-1 bg-transparent text-sm outline-none cursor-pointer" />
                    </div>
                </div>

                {/* 버튼 */}
                <div className="flex gap-2">
                    <button
                        onClick={onClose}
                        disabled={saving}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 disabled:opacity-50"
                    >
                        취소
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex-1 py-2.5 rounded-xl text-sm font-medium bg-blue-500 text-white disabled:opacity-50"
                    >
                        {saving ? '저장 중...' : '저장'}
                    </button>
                </div>

                {/* 면접일 있으면 삭제 버튼 */}
                {app.interviewDate && (
                    <button
                        onClick={handleClear}
                        disabled={saving}
                        className="w-full mt-2 py-2.5 rounded-xl text-sm font-medium bg-gray-100 dark:bg-gray-800 text-red-500 disabled:opacity-50"
                    >
                        면접 일정 삭제
                    </button>
                )}
            </div>
        </div>
    )
}