import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import api from '../api/client'

const STATUS_OPTIONS = [
    { value: 'TO_APPLY', label: '지원예정' },
    { value: 'APPLIED', label: '지원완료' },
    { value: 'DOC_PASSED', label: '서류합격' },
    { value: 'INTERVIEW', label: '면접' },
    { value: 'ACCEPTED', label: '최종합격' },
    { value: 'REJECTED', label: '불합격' },
]

export default function ApplicationEditPage() {
    const navigate = useNavigate()
    const { id } = useParams()
    const [form, setForm] = useState({
        company: '',
        position: '',
        status: 'APPLIED',
        appliedDate: '',
        deadline: '',
        interviewDate: '',
        interviewTime: '',
        link: '',
        memo: '',
    })
    const [errors, setErrors] = useState({})
    const [loading, setLoading] = useState(false)
    const [fetching, setFetching] = useState(true)

    useEffect(() => {
        const fetch = async () => {
            try {
                const res = await api.get(`/applications/${id}`)
                const d = res.data
                setForm({
                    company: d.company || '',
                    position: d.position || '',
                    status: d.status || 'APPLIED',
                    appliedDate: d.appliedDate || '',
                    deadline: d.deadline || '',
                    interviewDate: d.interviewDate || '',
                    interviewTime: d.interviewTime || '',
                    link: d.link || '',
                    memo: d.memo || '',
                })
            } catch {
                navigate('/')
            } finally {
                setFetching(false)
            }
        }
        fetch()
    }, [id])

    const onChange = (e) => {
        const { name, value } = e.target
        setForm({ ...form, [name]: value })
        setErrors({ ...errors, [name]: '' })
    }

    const validate = () => {
        const e = {}
        if (!form.company.trim()) e.company = '회사명을 입력해주세요.'
        if (!form.position.trim()) e.position = '포지션을 입력해주세요.'
        if (!form.appliedDate) e.appliedDate = '지원일을 입력해주세요.'
        // 마감일은 지원일 이후여야 함
        if (form.deadline && form.appliedDate && form.deadline < form.appliedDate)
            e.deadline = '마감일은 지원일 이후로 선택해주세요.'
        // 면접일은 지원일 이후여야 함
        if (form.interviewDate && form.appliedDate && form.interviewDate < form.appliedDate)
            e.interviewDate = '면접일은 지원일 이후로 선택해주세요.'
        return e
    }

    const onSubmit = async () => {
        const e = validate()
        if (Object.keys(e).length > 0) { setErrors(e); return }
        setLoading(true)
        try {
            await api.put(`/applications/${id}`, {
                company: form.company,
                position: form.position,
                status: form.status,
                appliedDate: form.appliedDate,
                deadline: form.deadline || null,
                interviewDate: form.interviewDate || null,
                interviewTime: form.interviewTime || null,
                link: form.link || null,
                memo: form.memo || null,
            })
            navigate('/')
        } catch {
            setErrors({ general: '수정에 실패했습니다.' })
        } finally {
            setLoading(false)
        }
    }

    const onDelete = async () => {
        if (!window.confirm('정말 삭제하시겠습니까?')) return
        try {
            await api.delete(`/applications/${id}`)
            navigate('/')
        } catch {
            setErrors({ general: '삭제에 실패했습니다.' })
        }
    }

    const openPicker = (id) => {
        const el = document.getElementById(id)
        if (el) el.showPicker?.()
    }

    const fieldClass = "bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl"
    const inputClass = `w-full ${fieldClass} px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500`
    const labelClass = "text-sm font-semibold text-gray-900 dark:text-white"

    if (fetching) return (
        <div className="flex justify-center items-center h-full text-gray-400 text-sm">
            불러오는 중...
        </div>
    )

    return (
        <div className="bg-white dark:bg-black text-gray-900 dark:text-white">
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-3">
                    <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <span className="text-base font-semibold">지원 수정</span>
                </div>
                <button onClick={onDelete} className="text-red-400 text-sm font-medium">삭제</button>
            </div>

            <div className="px-4 py-5 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>회사명 <span className="text-red-400">*</span></label>
                    <input name="company" value={form.company} onChange={onChange}
                           placeholder="예: 토스" className={inputClass} />
                    {errors.company && <p className="text-xs text-red-500">{errors.company}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>포지션 <span className="text-red-400">*</span></label>
                    <input name="position" value={form.position} onChange={onChange}
                           placeholder="예: 백엔드 개발자" className={inputClass} />
                    {errors.position && <p className="text-xs text-red-500">{errors.position}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>상태</label>
                    <div className="relative">
                        <select name="status" value={form.status} onChange={onChange}
                                className={`${inputClass} appearance-none pr-10 cursor-pointer`}>
                            {STATUS_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-gray-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </span>
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>지원일 <span className="text-red-400">*</span></label>
                    <div className={`${fieldClass} flex items-center px-4 py-3 cursor-pointer`}
                         onClick={() => openPicker('appliedDate')}>
                        <input id="appliedDate" type="date" name="appliedDate"
                               value={form.appliedDate} onChange={onChange}
                               className="flex-1 bg-transparent text-sm outline-none cursor-pointer" />
                    </div>
                    {errors.appliedDate && <p className="text-xs text-red-500">{errors.appliedDate}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>마감일</label>
                    <div className={`${fieldClass} flex items-center px-4 py-3 cursor-pointer`}
                         onClick={() => openPicker('deadline')}>
                        <input id="deadline" type="date" name="deadline"
                               min={form.appliedDate || undefined}
                               value={form.deadline} onChange={onChange}
                               className="flex-1 bg-transparent text-sm outline-none cursor-pointer" />
                    </div>
                    {errors.deadline && <p className="text-xs text-red-500">{errors.deadline}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>면접일</label>
                    <div className={`${fieldClass} flex items-center px-4 py-3 cursor-pointer`}
                         onClick={() => openPicker('interviewDate')}>
                        <input id="interviewDate" type="date" name="interviewDate"
                               min={form.appliedDate || undefined}
                               value={form.interviewDate} onChange={onChange}
                               className="flex-1 bg-transparent text-sm outline-none cursor-pointer" />
                    </div>
                    {errors.interviewDate && <p className="text-xs text-red-500">{errors.interviewDate}</p>}
                </div>

                {/* 면접 시간 */}
                <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>면접 시간</label>
                    <div className={`${fieldClass} flex items-center px-4 py-3 cursor-pointer`}
                         onClick={() => openPicker('interviewTime')}>
                        <input id="interviewTime" type="time" name="interviewTime"
                               value={form.interviewTime} onChange={onChange}
                               className="flex-1 bg-transparent text-sm outline-none cursor-pointer" />
                    </div>
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>공고 링크</label>
                    <input name="link" value={form.link} onChange={onChange}
                           placeholder="https://..." className={inputClass} />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>메모</label>
                    <textarea name="memo" value={form.memo} onChange={onChange}
                              placeholder="자유롭게 메모하세요" rows={3}
                              className={`${inputClass} resize-none`} />
                </div>

                {errors.general && <p className="text-sm text-red-500">{errors.general}</p>}

                <button onClick={onSubmit} disabled={loading}
                        className="w-full bg-blue-500 text-white rounded-xl py-3 text-sm font-medium mt-2 disabled:opacity-50">
                    {loading ? '저장 중...' : '수정 완료'}
                </button>
            </div>
        </div>
    )
}