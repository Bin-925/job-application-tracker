import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api/client'
import axios from 'axios'

export default function JoinPage() {
    const navigate = useNavigate()
    const [form, setForm] = useState({ username: '', password: '', nickname: '' })
    const [errors, setErrors] = useState({})
    const [usernameStatus, setUsernameStatus] = useState(null)
    const [loading, setLoading] = useState(false)

    const inputClass = "w-full bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"

    const validate = () => {
        const e = {}
        if (!/^[a-z0-9]{4,20}$/.test(form.username))
            e.username = '아이디는 영문 소문자·숫자 4~20자여야 합니다.'
        if (!/^(?=.*[a-zA-Z])(?=.*[0-9]).{8,30}$/.test(form.password))
            e.password = '비밀번호는 영문+숫자 조합 8자 이상이어야 합니다.'
        if (!form.nickname.trim() || form.nickname.length > 10)
            e.nickname = '닉네임은 1~10자여야 합니다.'
        if (usernameStatus !== 'available')
            e.usernameCheck = '아이디 중복 확인을 해주세요.'
        return e
    }

    const onChange = (e) => {
        const { name, value } = e.target
        setForm({ ...form, [name]: value })
        setErrors({ ...errors, [name]: '' })
        if (name === 'username') setUsernameStatus(null)
    }

    const checkUsername = async () => {
        if (!/^[a-z0-9]{4,20}$/.test(form.username)) {
            setErrors({ ...errors, username: '아이디는 영문 소문자·숫자 4~20자여야 합니다.' })
            return
        }
        setUsernameStatus('checking')
        setErrors({ ...errors, username: '', usernameCheck: '' })
        try {
            await axios.get(`http://localhost:8080/api/v1/members/check-username?username=${form.username}`)
            setUsernameStatus('available')
        } catch {
            setUsernameStatus('taken')
        }
    }

    const onSubmit = async () => {
        const e = validate()
        if (Object.keys(e).length > 0) { setErrors(e); return }
        setLoading(true)
        try {
            await api.post('/members/join', form)
            navigate('/login')
        } catch (err) {
            setErrors({ general: err.response?.data?.message || '회원가입에 실패했습니다.' })
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex flex-col justify-center px-6 bg-white dark:bg-black">
            <div className="mb-10">
                <h1 className="text-2xl font-semibold">회원가입</h1>
                <p className="text-sm text-gray-500 mt-1">지원 현황을 관리해보세요</p>
            </div>
            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold text-gray-700">아이디</label>
                    <div className="flex gap-2">
                        <input
                            name="username"
                            value={form.username}
                            onChange={onChange}
                            onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                            placeholder="영문 소문자·숫자 4~20자"
                            className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <button
                            onClick={checkUsername}
                            className="bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-sm font-medium whitespace-nowrap"
                        >
                            중복 확인
                        </button>
                    </div>
                    {errors.username && <p className="text-xs text-red-500">{errors.username}</p>}
                    {errors.usernameCheck && !errors.username && (
                        <p className="text-xs text-red-500">{errors.usernameCheck}</p>
                    )}
                    {usernameStatus === 'checking' && <p className="text-xs text-gray-400">확인 중...</p>}
                    {usernameStatus === 'available' && <p className="text-xs text-green-500">✓ 사용 가능한 아이디입니다.</p>}
                    {usernameStatus === 'taken' && <p className="text-xs text-red-500">이미 사용 중인 아이디입니다.</p>}
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold text-gray-700">비밀번호</label>
                    <input name="password" type="password" value={form.password}
                           onChange={onChange} onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                           placeholder="영문+숫자 조합 8자 이상" className={inputClass} />
                    {errors.password && <p className="text-xs text-red-500">{errors.password}</p>}
                </div>

                <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold text-gray-700">닉네임</label>
                    <input name="nickname" value={form.nickname}
                           onChange={onChange} onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                           placeholder="1~10자" className={inputClass} />
                    {errors.nickname && <p className="text-xs text-red-500">{errors.nickname}</p>}
                </div>

                {errors.general && <p className="text-sm text-red-500">{errors.general}</p>}

                <button onClick={onSubmit} disabled={loading}
                        className="w-full bg-blue-500 text-white rounded-xl py-3 text-sm font-medium mt-2 disabled:opacity-50">
                    {loading ? '가입 중...' : '회원가입'}
                </button>

                <p className="text-center text-sm text-gray-400 mt-2">
                    이미 계정이 있으신가요?{' '}
                    <Link to="/login" className="text-blue-500 font-medium">로그인</Link>
                </p>
            </div>
        </div>
    )
}