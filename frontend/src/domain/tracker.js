import { format, parseISO } from 'date-fns'

export const statuses = { TO_APPLY: '지원 예정', APPLIED: '지원 완료', DOC_PASSED: '서류 합격', INTERVIEW: '면접', ACCEPTED: '최종 합격', REJECTED: '불합격' }
export const isActive = app => ['APPLIED', 'DOC_PASSED', 'INTERVIEW'].includes(app.status)
export const dateKey = (date = new Date()) => format(date, 'yyyy-MM-dd')
export const prettyDate = date => date ? format(parseISO(date), 'M월 d일') : '미정'

// Legacy dates remain visible until explicitly edited or removed.
export function eventsOf(app) {
  const events = [...(app.schedules || [])]
  if (app.interviewDate) events.push({ id: 'legacy-interview', type: 'INTERVIEW', title: '면접', date: app.interviewDate, time: app.interviewTime, state: 'SCHEDULED' })
  if (app.deadline) events.push({ id: 'legacy-deadline', type: 'DEADLINE', title: '서류 마감', date: app.deadline, state: 'SCHEDULED' })
  if (app.appliedDate) events.push({ id: 'applied', type: 'APPLIED', title: '지원 완료', date: app.appliedDate, state: 'COMPLETED' })
  return events.map(event => ({ ...event, applicationId: app.id, company: app.company, position: app.position, applicationStatus: app.status }))
}

export function isUpcoming(event, now = new Date()) {
  if (event.state !== 'SCHEDULED') return false
  const today = dateKey(now)
  return event.date > today || (event.date === today && (!event.time || event.time.slice(0, 5) >= format(now, 'HH:mm')))
}
export const hasUpcomingInterview = (app, now = new Date()) => isActive(app) && eventsOf(app).some(event => event.type === 'INTERVIEW' && isUpcoming(event, now))

export function filterApplications(apps, params, now = new Date()) {
  const query = (params.get('q') || '').trim().toLocaleLowerCase()
  return apps.filter(app => {
    if (params.get('view') === 'in-progress' && !isActive(app)) return false
    if (params.get('view') === 'upcoming-interviews' && !hasUpcomingInterview(app, now)) return false
    if (params.get('status') && app.status !== params.get('status')) return false
    return (app.company + ' ' + app.position).toLocaleLowerCase().includes(query)
  }).sort((a, b) => params.get('sort') === 'company'
    ? a.company.localeCompare(b.company, 'ko')
    : (b.appliedDate || b.createdAt || '').localeCompare(a.appliedDate || a.createdAt || '') || b.id - a.id)
}
export const sortEvents = events => [...events].sort((a, b) => (a.date + (a.time || '00:00')).localeCompare(b.date + (b.time || '00:00')))
export const errorMessage = error => error.response?.data?.message || (error.response?.status === 401
  ? '로그인이 만료되었습니다.'
  : error.response ? '요청을 완료하지 못했습니다. 오류 코드: ' + error.response.status
    : '서버에 연결하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.')
export const safeLink = value => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : null } catch { return null }
}
