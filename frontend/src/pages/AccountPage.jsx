import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/client'
import { removeToken } from '../store/auth'

const COLOR_OPTIONS = [
    { value: 'blue', bg: 'bg-blue-100', text: 'text-blue-500' },
    { value: 'green', bg: 'bg-green-100', text: 'text-green-500' },
    { value: 'amber', bg: 'bg-amber-100', text: 'text-amber-500' },
    { value: 'red', bg: 'bg-red-100', text: 'text-red-500' },
    { value: 'purple', bg: 'bg-purple-100', text: 'text-purple-500' },
    { value: 'pink', bg: 'bg-pink-100', text: 'text-pink-500' },
]

const EMOJI_OPTIONS = ['🐱', '🐶', '🦊', '🐰', '🐻', '🐼', '🦁', '🐯', '🚀', '⭐', '🔥', '💎']

function getAvatarStyle(avatar) {
    const color = COLOR_OPTIONS.find((c) => c.value === avatar)
    if (color) return { type: 'color', bg: color.bg, text: color.text }
    return { type: 'emoji', emoji: avatar }
}

export default function AccountPage() {
    const navigate = useNavigate()
    const [member, setMember] = useState(null)
    const [editing, setEditing] = useState(false)
    const [nickname, setNickname] = useState('')
    const [error, setError] = useState('')
    const [showDeleteModal, setShowDeleteModal] = useState(false)
    const [showAvatarModal, setShowAvatarModal] = useState(false)

    useEffect(() => {
        const fetch = async () => {
            try {
                const res = await api.get('/members/me')
                setMember(res.data)
                setNickname(res.data.nickname)
            } catch {
                navigate('/login')
            }
        }
        fetch()
    }, [])

    const onSaveNickname = async () => {
        if (!nickname.trim() || nickname.length > 10) {
            setError('닉네임은 1~10자여야 합니다.')
            return
        }
        try {
            const res = await api.patch('/members/me/nickname', { nickname })
            setMember(res.data)
            setNickname(res.data.nickname)
            setEditing(false)
            setError('')
        } catch {
            setError('닉네임 수정에 실패했습니다.')
        }
    }

    const onSelectAvatar = async (avatar) => {
        try {
            const res = await api.patch('/members/me/avatar', { avatar })
            setMember(res.data)
            setShowAvatarModal(false)
        } catch {
            alert('아바타 변경에 실패했습니다.')
        }
    }

    const onDelete = async () => {
        try {
            await api.delete('/members/me')
            removeToken()
            navigate('/login')
        } catch {
            setShowDeleteModal(false)
            alert('탈퇴에 실패했습니다.')
        }
    }

    const initial = member?.nickname?.charAt(0).toUpperCase() || '?'
    const avatarStyle = member ? getAvatarStyle(member.avatar) : { type: 'color', bg: 'bg-blue-100', text: 'text-blue-500' }

    const labelClass = "text-xs font-semibold text-gray-900 dark:text-white"
    const valueClass = "text-sm text-gray-500 dark:text-gray-400"

    return (
        <div className="bg-white dark:bg-black text-gray-900 dark:text-white">
            <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100 dark:border-gray-800">
                <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-gray-600">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 19l-7-7 7-7" />
                    </svg>
                </button>
                <span className="text-base font-semibold">계정 정보</span>
            </div>

            <div className="px-4 pt-6">
                {/* 아바타 */}
                <div className="flex flex-col items-center mb-8">
                    <button onClick={() => setShowAvatarModal(true)} className="relative mb-3">
                        <div className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl font-semibold ${
                            avatarStyle.type === 'color' ? `${avatarStyle.bg} ${avatarStyle.text}` : 'bg-gray-100 dark:bg-gray-700'
                        }`}>
                            {avatarStyle.type === 'color' ? initial : <span className="text-3xl leading-none">{avatarStyle.emoji}</span>}
                        </div>
                        <div className="absolute bottom-0 right-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center border-2 border-white dark:border-black">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H9v-2a2 2 0 01.586-1.414z" />
                            </svg>
                        </div>
                    </button>
                    <p className="text-base font-semibold">{member?.nickname || '...'}</p>
                    <p className="text-sm text-gray-400 mt-0.5">@{member?.username || '...'}</p>
                </div>

                <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl px-4 mb-6">
                    {/* 닉네임 */}
                    <div className="h-20 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <div className="flex-1">
                            <p className={`${labelClass} mb-1.5`}>닉네임</p>
                            {editing ? (
                                <input
                                    value={nickname}
                                    onChange={(e) => { setNickname(e.target.value); setError('') }}
                                    onKeyDown={(e) => e.key === 'Enter' && onSaveNickname()}
                                    className="w-full bg-white dark:bg-gray-700 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                                    autoFocus
                                />
                            ) : (
                                <p className={valueClass}>{member?.nickname}</p>
                            )}
                        </div>
                        <div className="flex items-center gap-2 ml-2">
                            {editing ? (
                                <>
                                    <button onClick={onSaveNickname} className="text-sm text-blue-500 font-medium">저장</button>
                                    <button onClick={() => { setEditing(false); setNickname(member.nickname); setError('') }}
                                            className="text-sm text-gray-400 font-medium">취소</button>
                                </>
                            ) : (
                                <button onClick={() => setEditing(true)} className="text-sm text-blue-500 font-medium">수정</button>
                            )}
                        </div>
                    </div>
                    {error && <p className="text-xs text-red-500 -mt-2 mb-2 px-1">{error}</p>}

                    {/* 아이디 */}
                    <div className="py-4 border-b border-gray-200 dark:border-gray-700">
                        <p className={`${labelClass} mb-1`}>아이디</p>
                        <p className={valueClass}>{member?.username}</p>
                    </div>

                    {/* 비밀번호 변경 */}
                    <button
                        onClick={() => navigate('/mypage/account/password')}
                        className="w-full py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between"
                    >
                        <p className={labelClass}>비밀번호 변경</p>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>

                    {/* 가입일 */}
                    <div className="py-4">
                        <p className={`${labelClass} mb-1`}>가입일</p>
                        <p className={valueClass}>{member?.createdAt}</p>
                    </div>
                </div>

                <button
                    onClick={() => setShowDeleteModal(true)}
                    className="w-full bg-gray-100 dark:bg-gray-800 rounded-2xl py-4 text-sm font-medium text-red-400"
                >
                    탈퇴하기
                </button>
            </div>

            {/* 아바타 선택 팝업 */}
            {showAvatarModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6"
                     onClick={() => setShowAvatarModal(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-xs"
                         onClick={(e) => e.stopPropagation()}>
                        <p className="text-base font-semibold mb-4 text-center">프로필 선택</p>

                        <p className="text-xs text-gray-400 mb-2">색상</p>
                        <div className="grid grid-cols-6 gap-2 mb-5">
                            {COLOR_OPTIONS.map((c) => (
                                <button key={c.value} onClick={() => onSelectAvatar(c.value)}
                                        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold ${c.bg} ${c.text} ${
                                            member?.avatar === c.value ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-800' : ''
                                        }`}>
                                    {initial}
                                </button>
                            ))}
                        </div>

                        <p className="text-xs text-gray-400 mb-2">이모지</p>
                        <div className="grid grid-cols-6 gap-2">
                            {EMOJI_OPTIONS.map((emoji) => (
                                <button key={emoji} onClick={() => onSelectAvatar(emoji)}
                                        className={`w-9 h-9 rounded-full flex items-center justify-center text-lg bg-gray-100 dark:bg-gray-700 ${
                                            member?.avatar === emoji ? 'ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-gray-800' : ''
                                        }`}>
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* 탈퇴 확인 팝업 */}
            {showDeleteModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-6"
                     onClick={() => setShowDeleteModal(false)}>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-xs"
                         onClick={(e) => e.stopPropagation()}>
                        <p className="text-base font-semibold mb-2 text-center">정말 탈퇴하시겠어요?</p>
                        <p className="text-sm text-gray-400 text-center mb-6">
                            계정과 모든 지원 데이터가<br />영구적으로 삭제됩니다.
                        </p>
                        <div className="flex gap-2">
                            <button onClick={() => setShowDeleteModal(false)}
                                    className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-xl py-3 text-sm font-medium">
                                취소
                            </button>
                            <button onClick={onDelete}
                                    className="flex-1 bg-red-500 text-white rounded-xl py-3 text-sm font-medium">
                                탈퇴하기
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}