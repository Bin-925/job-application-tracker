import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api/client'

export default function JoinPage() {
    const navigate = useNavigate()
    const [form, setForm] = useState({ username: '', password: '', nickname: '' })
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)

    const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value })

    const onSubmit = async () => {
        if (!form.username || !form.password || !form.nickname) {
            setError('모든 항목을 입력해주세요.')
            return
        }
        setLoading(true)
        setError('')
        try {
            await api.post('/members/join', form)
            navigate('/login')
        } catch (e) {
            const msg = e.response?.data?.message
            setError(msg || '회원가입에 실패했습니다.')
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
                    <input
                        name="username"
                        value={form.username}
                        onChange={onChange}
                        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                        placeholder="아이디 입력"
                        className="w-full bg-gray-100 dark:bg-gray-900 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold text-gray-700">비밀번호</label>
                    <input
                        name="password"
                        type="password"
                        value={form.password}
                        onChange={onChange}
                        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                        placeholder="비밀번호 입력"
                        className="w-full bg-gray-100 dark:bg-gray-900 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>
                <div className="flex flex-col gap-1">
                    <label className="text-sm font-semibold text-gray-700">닉네임</label>
                    <input
                        name="nickname"
                        value={form.nickname}
                        onChange={onChange}
                        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
                        placeholder="닉네임 입력"
                        className="w-full bg-gray-100 dark:bg-gray-900 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {error && <p className="text-sm text-red-500">{error}</p>}

                <button
                    onClick={onSubmit}
                    disabled={loading}
                    className="w-full bg-blue-500 text-white rounded-xl py-3 text-sm font-medium mt-2 disabled:opacity-50"
                >
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