import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'

export default function PasswordChangePage() {
    const navigate = useNavigate()
    const [form, setForm] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    })
    const [errors, setErrors] = useState({})
    const [loading, setLoading] = useState(false)
    const [done, setDone] = useState(false)

    const onChange = (e) => {
        const { name, value } = e.target
        setForm({ ...form, [name]: value })
        setErrors({ ...errors, [name]: '', general: '' })
    }

    const validate = () => {
        const e = {}
        if (!form.currentPassword) e.currentPassword = '현재 비밀번호를 입력해주세요.'
        if (!form.newPassword) {
            e.newPassword = '새 비밀번호를 입력해주세요.'
        } else if (form.newPassword.length < 8 || form.newPassword.length > 30) {
            e.newPassword = '비밀번호는 8~30자여야 합니다.'
        } else if (!/^(?=.*[a-zA-Z])(?=.*[0-9]).+$/.test(form.newPassword)) {
            e.newPassword = '영문과 숫자를 모두 포함해야 합니다.'
        }
        if (form.newPassword !== form.confirmPassword) {
            e.confirmPassword = '새 비밀번호가 일치하지 않습니다.'
        }
        return e
    }

    const onSubmit = async () => {
        const e = validate()
        if (Object.keys(e).length > 0) { setErrors(e); return }
        setLoading(true)
        try {
            await api.patch('/members/me/password', {
                currentPassword: form.currentPassword,
                newPassword: form.newPassword,
            })
            setDone(true)
        } catch (err) {
            const msg = err.response?.data || '비밀번호 변경에 실패했습니다.'
            setErrors({ general: typeof msg === 'string' ? msg : '비밀번호 변경에 실패했습니다.' })
        } finally {
            setLoading(false)
        }
    }

    const fieldClass = "w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
    const labelClass = "text-sm font-semibold text-gray-900 dark:text-white"

    // 완료 화면
    if (done) return (
        <div className="h-full flex flex-col justify-center items-center px-6 bg-white dark:bg-black text-gray-900 dark:text-white text-center">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-3xl mb-4">✅</div>
            <p className="text-lg font-bold mb-2">비밀번호가 변경되었어요</p>
            <p className="text-sm text-gray-400 mb-8">다음 로그인부터 새 비밀번호를 사용하세요.</p>
            <button onClick={() => navigate('/mypage/account')}
                    className="w-full max-w-xs bg-blue-500 text-white rounded-xl py-3 text-sm font-medium">
                확인
            </button>
        </div>
    )

    return (
        <div className="bg-white dark:bg-black text-gray-900 dark:text-white">
            {/* 헤더 */}
            <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 dark:border-gray-800">
                <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <span className="text-base font-semibold">비밀번호 변경</span>
            </div>

            <div className="px-4 py-5 flex flex-col gap-4">
                <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>현재 비밀번호</label>
                    <input type="password" name="currentPassword" value={form.currentPassword}
                           onChange={onChange} placeholder="현재 비밀번호" className={fieldClass} />
                    {errors.currentPassword && <p className="text-xs text-red-500">{errors.currentPassword}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>새 비밀번호</label>
                    <input type="password" name="newPassword" value={form.newPassword}
                           onChange={onChange} placeholder="영문+숫자 조합 8자 이상" className={fieldClass} />
                    {errors.newPassword && <p className="text-xs text-red-500">{errors.newPassword}</p>}
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className={labelClass}>새 비밀번호 확인</label>
                    <input type="password" name="confirmPassword" value={form.confirmPassword}
                           onChange={onChange} placeholder="새 비밀번호 다시 입력" className={fieldClass} />
                    {errors.confirmPassword && <p className="text-xs text-red-500">{errors.confirmPassword}</p>}
                </div>

                {errors.general && <p className="text-sm text-red-500">{errors.general}</p>}

                <button onClick={() => navigate('/mypage/account', { replace: true })}
                        className="w-full max-w-xs bg-blue-500 text-white rounded-xl py-3 text-sm font-medium">
                    확인
                </button>
            </div>
        </div>
    )
}