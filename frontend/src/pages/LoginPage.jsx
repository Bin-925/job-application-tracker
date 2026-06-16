import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api/client'
import { setToken } from '../store/auth'

export default function LoginPage() {
    const navigate = useNavigate()
    const [form, setForm] = useState({ username: '', password: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

    const onSubmit = async () => {
        if (!form.username || !form.password) {
            setError('아이디와 비밀번호를 입력해주세요.')
            return
        }
        setLoading(true)
        setError('')
        try {
            const res = await api.post('/members/login', form)
            setToken(res.data.accessToken)
            navigate('/')
        } catch {
            setError('아이디 또는 비밀번호가 올바르지 않습니다.')
        } finally {
            setLoading(false)
        }
    }

    return (
        <div className="min-h-screen flex flex-col justify-center px-6 bg-white dark:bg-black text-gray-900 dark:text-white">
            <div className="mb-10">
                <h1 className="text-2xl font-semibold">안녕하세요 👋</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">계속하려면 로그인해주세요</p>
            </div>
            <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">아이디</label>
                    <input
                        name="username"
                        value={form.username}
                        onChange={onChange}
                        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                        placeholder="아이디 입력"
                        className="w-full bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold text-gray-700 dark:text-gray-300">비밀번호</label>
                    <input
                        name="password"
                        type="password"
                        value={form.password}
                        onChange={onChange}
                        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                        placeholder="비밀번호 입력"
                        className="w-full bg-gray-100 dark:bg-gray-700 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                {error && <p className="text-sm text-red-500">{error}</p>}
                <button
                    onClick={onSubmit}
                    disabled={loading}
                    className="w-full bg-blue-500 text-white rounded-xl py-3 text-sm font-medium mt-2 disabled:opacity-50"
                >
                    {loading ? '로그인 중...' : '로그인'}
                </button>
                <p className="text-center text-sm text-gray-400 mt-2">
                    계정이 없으신가요?{' '}
                    <Link to="/join" className="text-blue-500 font-medium">회원가입</Link>
                </p>
            </div>
        </div>
    )
}