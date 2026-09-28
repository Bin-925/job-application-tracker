import { useEffect, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { ko } from 'date-fns/locale'
import { ArrowLeft, CalendarPlus, ChevronLeft, ChevronRight, ExternalLink, LogOut, Moon, Pencil, Plus, Search, Sun, Trash2 } from 'lucide-react'
import { dateKey, errorMessage, eventsOf, filterApplications, hasUpcomingInterview, isActive, isUpcoming, prettyDate, safeLink, sortEvents, statuses } from '../domain/tracker'
import api from '../api/client'
import { notifySessionChanged } from '../store/auth'
import { Editor } from './Editor'
import { useFormProtection } from './useFormProtection'
import { useSession } from '../store/sessionContext'

export function ApplicationAction({ edit = false }) {
  const { apps, refresh, notify } = useOutletContext()
  const { id } = useParams()
  const navigate = useNavigate()
  const app = edit ? apps.find(a => String(a.id) === id) : undefined
  const close = () => navigate(edit ? '/applications/' + id : '/applications', { replace: true })
  if (edit && !app) return <Detail />
  return <Editor kind="application" app={app} apps={apps} onClose={close} onSaved={async message => { await refresh(); notify(message); close() }} />
}

function Heading({ title, children, sub }) {
  return <div className="page-heading"><div><h1>{title}</h1>{sub && <p className="muted">{sub}</p>}</div>{children}</div>
}

function EventRows({ events, empty = '등록된 일정이 없습니다.' }) {
  const { apps, open } = useOutletContext()
  if (!events.length) return <p className="empty">{empty}</p>
  return <div className="event-list">{events.map(event => <button key={event.applicationId + '-' + event.id} className={'event-row ' + event.type.toLowerCase() + (event.state === 'CANCELLED' ? ' cancelled' : '')}
    onClick={() => open({ kind: event.type === 'APPLIED' ? 'application' : 'schedule', app: apps.find(a => a.id === event.applicationId), event: event.type === 'APPLIED' ? undefined : event })}>
    <span className="event-time">{event.time?.slice(0, 5) || (event.type === 'APPLIED' ? '기록' : '시간 미정')}<small>{prettyDate(event.date)}</small></span>
    <span className="event-info"><strong>{event.company}</strong><span>{event.position}</span><small>{event.title}{event.state === 'COMPLETED' ? ' · 완료' : event.state === 'CANCELLED' ? ' · 취소' : ''}</small></span>
    <ChevronRight size={18} />
  </button>)}</div>
}

export function Today() {
  const { apps, now } = useOutletContext()
  const activeEvents = sortEvents(apps.filter(a => isActive(a) || a.status === 'TO_APPLY').flatMap(eventsOf).filter(e => e.type !== 'APPLIED' && e.state === 'SCHEDULED'))
  const todayEvents = activeEvents.filter(e => e.date === dateKey(now))
  const upcoming = activeEvents.filter(e => e.date > dateKey(now)).slice(0, 6)
  return <>
    <Heading title="오늘" sub={format(now, 'M월 d일 EEEE', { locale: ko })} />
    <div className="summaries">
      <Link className="summary progress" to="/applications?view=in-progress"><span>진행 중<ChevronRight size={18} /></span><strong>{apps.filter(isActive).length}<small>건</small></strong></Link>
      <Link className="summary interview" to="/applications?view=upcoming-interviews"><span>면접 예정<ChevronRight size={18} /></span><strong>{apps.filter(a => hasUpcomingInterview(a, now)).length}<small>건</small></strong></Link>
    </div>
    <section className="page-section"><div className="section-heading"><h2>오늘의 일정 <span>{todayEvents.length}</span></h2><Link to="/calendar">캘린더<ChevronRight size={16} /></Link></div><EventRows events={todayEvents} empty="오늘은 예정된 일정이 없습니다." /></section>
    <section className="page-section"><div className="section-heading"><h2>다가오는 일정</h2><Link to="/calendar">전체 보기<ChevronRight size={16} /></Link></div><EventRows events={upcoming} empty="다가오는 일정이 없습니다." /></section>
    {!apps.length && <div className="welcome"><h2>첫 지원을 기록해 볼까요?</h2><p className="muted">기억해 둘 채용 공고부터 차근차근.</p></div>}
  </>
}

function ApplicationRow({ app }) {
  const { open, now } = useOutletContext()
  const next = sortEvents(eventsOf(app).filter(e => e.type !== 'APPLIED' && isUpcoming(e, now)))[0]
  return <article className="application-row">
    <div className="application-main"><Link to={'/applications/' + app.id}><h2>{app.company}</h2><p>{app.position}</p></Link>
      <select className={'status-select ' + app.status.toLowerCase()} aria-label={app.company + ' 상태 변경'} value={app.status} onChange={event => open({ kind: 'status', app, status: event.target.value })}>
        {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    <div className="application-meta"><span>{app.appliedDate ? prettyDate(app.appliedDate) + ' 지원' : '지원일 미등록'}</span>{next && <span className={next.type.toLowerCase()}>{prettyDate(next.date)} {next.title}</span>}</div>
    <div className="application-actions"><button className="text-button" onClick={() => open({ kind: 'schedule', app })}><CalendarPlus size={16} />일정 추가</button><Link to={'/applications/' + app.id}>상세 보기<ChevronRight size={16} /></Link></div>
  </article>
}

export function Applications() {
  const { apps, now } = useOutletContext()
  const [params, setParams] = useSearchParams()
  const filtered = filterApplications(apps, params, now)
  function setFilter(key, value) { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); setParams(next, { replace: key === 'q' }) }
  return <>
    <Heading title="지원" sub={'전체 ' + apps.length + '건'} />
    <div className="search-field"><Search size={19} /><input aria-label="회사 또는 직무 검색" placeholder="회사 또는 직무 검색" value={params.get('q') || ''} onChange={e => setFilter('q', e.target.value)} /></div>
    <div className="view-tabs" aria-label="지원 보기">{[['', '전체'], ['in-progress', '진행 중'], ['upcoming-interviews', '면접 예정']].map(([value, label]) => <button key={value} aria-pressed={(params.get('view') || '') === value} onClick={() => { const next = new URLSearchParams(params); next.delete('status'); if (value) next.set('view', value); else next.delete('view'); setParams(next) }}>{label}</button>)}</div>
    <div className="filter-bar"><select aria-label="지원 상태 필터" value={params.get('status') || ''} onChange={e => setFilter('status', e.target.value)}><option value="">모든 상태</option>{Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="정렬" value={params.get('sort') || 'recent'} onChange={e => setFilter('sort', e.target.value)}><option value="recent">최근 지원순</option><option value="company">회사명순</option></select><span>{filtered.length}건</span></div>
    {filtered.length ? <div className="application-list">{filtered.map(app => <ApplicationRow key={app.id} app={app} />)}</div> : <div className="empty"><p>{apps.length ? '조건에 맞는 지원 내역이 없습니다.' : '아직 등록한 지원이 없습니다.'}</p>{params.size > 0 && <button onClick={() => setParams({})}>필터 초기화</button>}</div>}
  </>
}

function readCalendarFilters() {
  try { const value = JSON.parse(localStorage.getItem('calendar-types')); if (Array.isArray(value)) return value.filter(v => ['APPLIED', 'INTERVIEW', 'DEADLINE'].includes(v)) } catch { /* Use the default for stale preferences. */ }
  return ['INTERVIEW', 'DEADLINE']
}

export function Calendar() {
  const { apps, open } = useOutletContext()
  const [selected, setSelected] = useState(dateKey())
  const [month, setMonth] = useState(startOfMonth(new Date()))
  const [types, setTypes] = useState(readCalendarFilters)
  const events = sortEvents(apps.flatMap(eventsOf).filter(e => types.includes(e.type) && e.state !== 'CANCELLED'))
  const days = eachDayOfInterval({ start: startOfWeek(month), end: endOfWeek(endOfMonth(month)) })
  function toggle(type) { const next = types.includes(type) ? types.filter(t => t !== type) : [...types, type]; setTypes(next); localStorage.setItem('calendar-types', JSON.stringify(next)) }
  return <>
    <section className="month-calendar" aria-label="월간 캘린더">
      <div className="month-toolbar"><h1>{format(month, 'yyyy년 M월')}</h1><div><button className="icon" aria-label="이전 달" title="이전 달" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={20} /></button><button onClick={() => { setMonth(startOfMonth(new Date())); setSelected(dateKey()) }}>오늘</button><button className="icon" aria-label="다음 달" title="다음 달" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={20} /></button></div></div>
      <div className="calendar-grid weekdays">{['일', '월', '화', '수', '목', '금', '토'].map(day => <span key={day}>{day}</span>)}</div>
      <div className="calendar-grid">{days.map(day => { const key = dateKey(day); const daily = events.filter(e => e.date === key); return <button key={key} className={'calendar-day' + (!isSameMonth(day, month) ? ' outside' : '') + (selected === key ? ' selected' : '')} aria-label={format(day, 'M월 d일') + ', 일정 ' + daily.length + '건'} aria-pressed={selected === key} aria-current={key === dateKey() ? 'date' : undefined} onClick={() => { setSelected(key); if (!isSameMonth(day, month)) setMonth(startOfMonth(day)) }}><span>{format(day, 'd')}</span><span className="day-dots">{[...new Set(daily.map(e => e.type))].map(type => <i className={type.toLowerCase()} key={type} />)}{daily.length > 3 && <small>+{daily.length - 3}</small>}</span></button> })}</div>
      <div className="calendar-filters">{[['APPLIED', '지원일'], ['INTERVIEW', '면접'], ['DEADLINE', '마감']].map(([type, label]) => <label key={type} className={type.toLowerCase()}><input type="checkbox" checked={types.includes(type)} onChange={() => toggle(type)} />{label}</label>)}</div>
    </section>
    <section className="page-section"><div className="section-heading"><h2>{format(parseISO(selected), 'M월 d일 EEEE', { locale: ko })}</h2><button className="text-button" onClick={() => open({ kind: 'schedule', date: selected })}><Plus size={17} />일정 추가</button></div><EventRows events={events.filter(e => e.date === selected)} empty={types.length ? '이 날짜에 표시할 일정이 없습니다.' : '표시할 일정 종류를 선택해 주세요.'} /></section>
  </>
}

export function Detail() {
  const { id } = useParams()
  const { apps, open } = useOutletContext()
  const app = apps.find(a => String(a.id) === id)
  if (!app) return <div className="empty"><h1>지원 내역을 찾을 수 없습니다.</h1><Link to="/applications">지원 목록으로</Link></div>
  const link = safeLink(app.link)
  return <>
    <Link className="back-link" to="/applications"><ArrowLeft size={18} />지원 목록</Link>
    <Heading title={app.company} sub={app.position}><button className="icon" title="지원 수정" onClick={() => open({ kind: 'application', app })}><Pencil size={20} /></button></Heading>
    <div className="detail-facts"><label>현재 상태<select value={app.status} onChange={e => open({ kind: 'status', app, status: e.target.value })}>{Object.entries(statuses).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label><div><span className="muted">지원일</span><strong>{app.appliedDate || '미등록'}</strong></div>{link && <a href={link} target="_blank" rel="noopener noreferrer">채용 공고<ExternalLink size={16} /></a>}</div>
    <section className="page-section"><div className="section-heading"><h2>일정</h2><button className="text-button" onClick={() => open({ kind: 'schedule', app })}><CalendarPlus size={17} />일정 추가</button></div><EventRows events={sortEvents(eventsOf(app).filter(e => e.type !== 'APPLIED'))} /></section>
    <section className="page-section"><h2>메모</h2><p className="memo">{app.memo || '작성한 메모가 없습니다.'}</p></section>
    <button className="danger text-button" onClick={() => open({ kind: 'delete', app })}><Trash2 size={17} />지원 삭제</button>
  </>
}

export function Settings() {
  const navigate = useNavigate()
  const { canMutate } = useSession()
  const { notify, open, apps } = useOutletContext()
  const [member, setMember] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const nicknameProtection = useFormProtection(busy)
  const passwordProtection = useFormProtection(busy)
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'))
  useEffect(() => { let active = true; api.get('/members/me').then(r => { if (active) setMember(r.data) }).catch(e => { if (active) setError(errorMessage(e)) }); return () => { active = false } }, [])
  async function save(event, type) {
    event.preventDefault()
    if (busy || !canMutate) return
    setBusy(true); setError('')
    const form = event.currentTarget
    try {
      const response = await api.patch('/members/me/' + type, Object.fromEntries(new FormData(form)))
      if (type === 'nickname') { nicknameProtection.clear(); setMember(response.data); notify('변경 사항을 저장했습니다.') }
      else { notifySessionChanged(); navigate('/login?passwordChanged=1', { replace: true }) }
    } catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  async function logout(all = false) {
    setBusy(true); setError('')
    try { await api.post(all ? '/members/logout-all' : '/members/logout'); notifySessionChanged(); navigate('/login', { replace: true }) }
    catch (e) { setError(errorMessage(e)) } finally { setBusy(false) }
  }
  return <>
    <Heading title="내 정보" />
    {error && <p role="alert" className="error">{error}</p>}
    <section className="profile-heading"><span className="avatar">{member?.nickname?.slice(0, 1) || '나'}</span><div><h2>{member?.nickname || '불러오는 중…'}</h2><p className="muted">@{member?.username || ''}</p></div></section>
    <section className="settings-section"><h2>화면 설정</h2><label className="setting-toggle">{dark ? <Moon size={19} /> : <Sun size={19} />}다크 모드<input type="checkbox" role="switch" checked={dark} onChange={e => { setDark(e.target.checked); document.documentElement.classList.toggle('dark', e.target.checked); localStorage.setItem('theme', e.target.checked ? 'dark' : 'light') }} /></label></section>
    {member && <section className="settings-section"><h2>닉네임</h2><form className="inline-form" onChange={nicknameProtection.markDirty} onSubmit={e => save(e, 'nickname')}><input aria-label="닉네임" name="nickname" defaultValue={member.nickname} disabled={busy} required maxLength={10} /><div><button disabled={busy || !canMutate}>저장</button><button type="reset" disabled={busy} onClick={nicknameProtection.clear}>취소</button></div></form></section>}
    <section className="settings-section"><h2>비밀번호 변경</h2><form onChange={passwordProtection.markDirty} onSubmit={e => save(e, 'password')}><label>현재 비밀번호<input name="currentPassword" type="password" autoComplete="current-password" disabled={busy} required /></label><label>새 비밀번호<input name="newPassword" type="password" autoComplete="new-password" disabled={busy} required minLength={8} maxLength={30} pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,30}" title="영문과 숫자를 포함한 8~30자" /></label><div><button disabled={busy || !canMutate}>비밀번호 변경</button><button type="reset" disabled={busy} onClick={passwordProtection.clear}>취소</button></div></form></section>
    <section className="settings-section"><button disabled={busy} onClick={() => logout()}><LogOut size={18} />로그아웃</button><button disabled={busy} onClick={() => logout(true)}><LogOut size={18} />모든 기기에서 로그아웃</button><button disabled={busy} className="text-button danger" onClick={() => open({ kind: 'withdraw', count: apps.length })}>회원 탈퇴</button></section>
  </>
}
