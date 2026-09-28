import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { CalendarDays, House, BriefcaseBusiness, UserRound, NotebookPen, Plus, RefreshCw, WifiOff } from 'lucide-react'
import api from '../api/client'
import { errorMessage } from '../domain/tracker'
import { Editor } from './Editor'
import { PwaStatus } from './PwaStatus'

export function Workspace() {
  const { pathname } = useLocation()
  const [apps, setApps] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState(null)
  const [notice, setNotice] = useState('')
  const [online, setOnline] = useState(navigator.onLine)
  const [now, setNow] = useState(new Date())
  const refresh = useCallback(() => api.get('/applications')
    .then(response => { setApps(response.data); setError('') })
    .catch(failure => setError(errorMessage(failure)))
    .finally(() => setLoading(false)), [])
  useEffect(() => {
    refresh()
    const updateNetwork = () => setOnline(navigator.onLine)
    const timer = setInterval(() => setNow(new Date()), 30000)
    window.addEventListener('online', updateNetwork)
    window.addEventListener('offline', updateNetwork)
    return () => { clearInterval(timer); window.removeEventListener('online', updateNetwork); window.removeEventListener('offline', updateNetwork) }
  }, [refresh])
  useEffect(() => { if (notice) { const timer = setTimeout(() => setNotice(''), 5000); return () => clearTimeout(timer) } }, [notice])
  const context = { apps, now, refresh, open: setEditor, notify: setNotice }
  return <div className="workspace">
    <aside className="navigation"><NavLink to="/" className="brand"><NotebookPen size={25} />취준노트</NavLink>
      <nav aria-label="주 메뉴">{[[House, '/', '오늘'], [BriefcaseBusiness, '/applications', '지원'], [CalendarDays, '/calendar', '일정'], [UserRound, '/mypage', '내 정보']].map(([Icon, path, label]) => <NavLink key={path} to={path} end={path === '/'}><Icon size={21} /><span>{label}</span></NavLink>)}</nav>
      <span className="nav-footer">나의 다음 커리어</span>
    </aside>
    <div className="content">
      <header className="mobile-header"><NavLink to="/" className="brand"><NotebookPen size={22} />취준노트</NavLink><button className="icon" title="새로고침" onClick={refresh}><RefreshCw size={19} /></button></header>
      {!online && <div role="status" className="notice"><WifiOff size={18} />오프라인입니다. 변경 사항을 저장하려면 연결이 필요합니다.</div>}
      <PwaStatus />
      {loading ? <p className="empty" role="status">지원 내역을 불러오는 중…</p> : error ? <section className="empty"><p role="alert">{error}</p><button onClick={refresh}><RefreshCw size={16} />다시 시도</button></section> : <Outlet context={context} />}
      {!pathname.startsWith('/mypage') && <button className="fab" title="지원 추가" aria-label="지원 추가" onClick={() => setEditor({ kind: 'application' })}><Plus size={26} /></button>}
    </div>
    {editor && <Editor key={editor.kind + '-' + (editor.app?.id || '') + '-' + (editor.event?.id || '')} {...editor} apps={apps} onClose={() => setEditor(null)} onSaved={async (message, next) => { await refresh(); setEditor(next || null); setNotice(message) }} />}
    {notice && <div role="status" className="toast">{notice}</div>}
  </div>
}
