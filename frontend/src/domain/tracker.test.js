import test from 'node:test'
import assert from 'node:assert/strict'
import { eventsOf, filterApplications, hasUpcomingInterview, isUpcoming, safeLink } from './tracker.js'

const now = new Date(2026, 8, 23, 14, 30, 0)
const app = { id: 1, company: '테스트회사', position: '백엔드', status: 'APPLIED', appliedDate: '2026-09-20', schedules: [] }
const interview = (date, time, state = 'SCHEDULED') => ({ id: 2, type: 'INTERVIEW', date, time, state })
test('upcoming interview respects local date, time, and completion', () => {
  assert.equal(isUpcoming(interview('2026-09-23', null), now), true)
  assert.equal(isUpcoming(interview('2026-09-23', '14:29:00'), now), false)
  assert.equal(isUpcoming(interview('2026-09-23', '14:30:00'), now), true)
  assert.equal(isUpcoming(interview('2026-09-24', null, 'COMPLETED'), now), false)
  assert.equal(isUpcoming(interview('2026-09-24', null, 'CANCELLED'), now), false)
  assert.equal(isUpcoming(interview('2026-09-22', null), now), false)
})
test('multiple interviews count one application and terminal statuses are excluded', () => {
  const upcoming = { ...app, schedules: [interview('2026-09-24'), interview('2026-09-25')] }
  assert.equal(hasUpcomingInterview(upcoming, now), true)
  assert.equal(hasUpcomingInterview({ ...upcoming, status: 'ACCEPTED' }, now), false)
  assert.equal(hasUpcomingInterview({ ...upcoming, status: 'TO_APPLY' }, now), false)
  const apps = [upcoming, { ...app, id: 2 }]
  assert.equal(apps.filter(a => hasUpcomingInterview(a, now)).length, filterApplications(apps, new URLSearchParams('view=upcoming-interviews'), now).length)
})
test('in-progress excludes saved and finished applications', () => {
  const apps = ['TO_APPLY', 'APPLIED', 'DOC_PASSED', 'INTERVIEW', 'ACCEPTED', 'REJECTED'].map((status, id) => ({ ...app, id, status }))
  assert.equal(filterApplications(apps, new URLSearchParams('view=in-progress'), now).length, 3)
})
test('legacy schedules and applied dates are preserved without mutation', () => {
  const legacy = { ...app, interviewDate: '2026-09-25', interviewTime: '10:00:00', deadline: '2026-09-30' }
  assert.deepEqual(eventsOf(legacy).map(e => e.id), ['legacy-interview', 'legacy-deadline', 'applied'])
  assert.equal(legacy.schedules.length, 0)
})
test('URL search and status filters compose', () => {
  assert.equal(filterApplications([app], new URLSearchParams('q=백엔드&status=APPLIED'), now).length, 1)
  assert.equal(filterApplications([app], new URLSearchParams('q=디자이너'), now).length, 0)
})
test('external links only permit http and https', () => {
  assert.equal(safeLink('javascript:alert(1)'), null)
  assert.equal(safeLink('data:text/html,hello'), null)
  assert.equal(safeLink('https://example.com/job'), 'https://example.com/job')
})
