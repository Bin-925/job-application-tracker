import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

let server, origin, revision, releaseSave
let currentMember, memberStatus, holdLists, pendingLists, listStatuses
let applications
const root = path.resolve('dist')
const member = { id: 1, username: 'pwatest', nickname: '테스트' }

test.beforeEach(async () => {
  revision = 1
  releaseSave = null
  currentMember = member
  memberStatus = 200
  holdLists = false
  pendingLists = []
  listStatuses = []
  applications = []
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname
    response.setHeader('Cache-Control', 'no-store')
    if (pathname.startsWith('/api/')) {
      response.setHeader('Content-Type', 'application/json')
      if (pathname.endsWith('/csrf')) return response.end(JSON.stringify({ headerName: 'X-CSRF-TOKEN', token: 'fixture' }))
      if (pathname.endsWith('/me')) {
        if (memberStatus === 0) return response.destroy()
        response.statusCode = memberStatus
        return response.end(JSON.stringify(currentMember))
      }
      if (request.method === 'GET' && pathname.endsWith('/applications') && holdLists) {
        response.statusCode = listStatuses[pendingLists.length] || 200
        response.flushHeaders()
        pendingLists.push(response)
        return
      }
      if (request.method === 'GET' && pathname.endsWith('/applications')) return response.end(JSON.stringify(applications))
      if (request.method === 'GET') return response.end('[]')
      if (request.method === 'POST' && pathname.endsWith('/applications')) await new Promise(resolve => { releaseSave = resolve })
      return response.end(JSON.stringify(member))
    }
    const file = path.resolve(root, '.' + pathname)
    if (file !== root && !file.startsWith(root + path.sep)) { response.writeHead(404); return response.end() }
    try {
      let content = await readFile(file)
      if (pathname === '/sw.js') content = Buffer.concat([content, Buffer.from(`\n// Test deployment ${revision}\n`)])
      const types = { '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.html': 'text/html', '.webmanifest': 'application/manifest+json' }
      response.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream')
      response.end(content)
    } catch {
      response.setHeader('Content-Type', 'text/html')
      response.end(await readFile(path.join(root, 'index.html')))
    }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
})

test.afterEach(async () => {
  releaseSave?.()
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
})

test('recovery email request preserves errors and clears password after successful delivery', async ({ page }) => {
  let sent = false, body
  await page.route('**/api/v1/members/me/recovery-email', route => route.fulfill({ json: { available: true, verifiedEmail: 'old@example.test', pendingEmail: sent ? 'new@example.test' : null, expiresAt: '2026-10-04T12:00:00Z' } }))
  await page.route('**/api/v1/members/me/recovery-email/requests', route => {
    body = route.request().postDataJSON()
    if (!sent) { sent = true; return route.fulfill({ status: 503, json: { message: '인증 메일을 보낼 수 없습니다.' } }) }
    return route.fulfill({ status: 204 })
  })
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto(origin + '/mypage')
  await expect(page.getByText('인증된 이메일: old@example.test')).toBeVisible()
  await page.getByLabel('복구 이메일', { exact: true }).fill('new@example.test')
  await page.getByLabel('이메일 등록용 현재 비밀번호').fill('Test1234')
  await page.getByRole('button', { name: '인증 메일 보내기' }).click()
  await expect(page.getByRole('alert')).toContainText('인증 메일을 보낼 수 없습니다.')
  await expect(page.getByLabel('복구 이메일', { exact: true })).toHaveValue('new@example.test')
  await page.getByRole('button', { name: '인증 메일 보내기' }).click()
  await expect(page.getByLabel('이메일 등록용 현재 비밀번호')).toHaveValue('')
  await expect(page.getByText(/인증 대기: new@example.test/)).toBeVisible()
  expect(body).toEqual({ email: 'new@example.test', currentPassword: 'Test1234' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: test.info().outputPath('recovery-email-360.png'), fullPage: true })
})

test('recovery email unavailable state has no pretend delivery form', async ({ page }) => {
  await page.route('**/api/v1/members/me/recovery-email', route => route.fulfill({ json: { available: false, verifiedEmail: null, pendingEmail: null } }))
  await page.goto(origin + '/mypage')
  await expect(page.getByText('현재 이메일 인증을 사용할 수 없습니다.')).toBeVisible()
  await expect(page.getByRole('button', { name: '인증 메일 보내기' })).toHaveCount(0)
})

test('verification scrubs fragment, never consumes on GET, and submits only on explicit confirmation', async ({ page }) => {
  let calls = 0
  const token = 'a'.repeat(43)
  currentMember = null; memberStatus = 401
  await page.route('**/api/v1/members/recovery-email/confirm', route => {
    calls++
    expect(route.request().postDataJSON()).toEqual({ token })
    expect(route.request().headers()['x-csrf-token']).toBe('fixture')
    return route.fulfill({ status: 204 })
  })
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto(origin + '/verify-email#token=' + token)
  await expect(page.getByRole('button', { name: '이메일 인증 완료' })).toBeVisible()
  await expect(page).toHaveURL(origin + '/verify-email')
  expect(calls).toBe(0)
  expect(await page.evaluate(value => JSON.stringify({ ...localStorage, ...sessionStorage }).includes(value), token)).toBe(false)
  await page.screenshot({ path: test.info().outputPath('verify-email-360.png'), fullPage: true })
  await page.getByRole('button', { name: '이메일 인증 완료' }).click()
  await expect(page.getByRole('status')).toContainText('이메일 인증을 완료했습니다.')
  expect(calls).toBe(1)
  await page.reload()
  await expect(page.getByRole('alert')).toContainText('인증 링크를 다시 열거나')
  expect(calls).toBe(1)
})

test('expired verification shows actionable error without automatic retry', async ({ page }) => {
  let calls = 0
  await page.route('**/api/v1/members/recovery-email/confirm', route => { calls++; return route.fulfill({ status: 400, json: { message: '인증 링크가 유효하지 않거나 만료되었습니다. 새 메일을 요청해 주세요.' } }) })
  await page.goto(origin + '/verify-email#token=' + 'z'.repeat(43))
  await page.getByRole('button', { name: '이메일 인증 완료' }).click()
  await expect(page.getByRole('alert')).toContainText('새 메일을 요청해 주세요.')
  expect(calls).toBe(1)
})

async function open(page, route = '/') {
  await page.goto(origin + route)
  await expect(page.getByRole('heading', { name: route === '/mypage' ? '내 정보' : '오늘', exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state)).toBe('activated')
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
}

async function update(page) {
  revision++
  await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration()).update() })
  await expect(page.getByRole('button', { name: '업데이트', exact: true })).toBeVisible()
}

for (const rememberMe of [false, true]) {
  test(`login retention is explicit and defaults off on both auth routes: ${rememberMe}`, async ({ page }) => {
    memberStatus = 401
    currentMember = null
    const logins = []
    const joins = []
    await page.route('**/api/v1/members/login', async route => {
      logins.push(route.request().postDataJSON())
      await route.fulfill({ status: 401, json: { message: 'Fixture rejected' } })
    })
    await page.route('**/api/v1/members/join', async route => {
      joins.push(route.request().postDataJSON())
      await route.fulfill({ status: 201, body: 'Created' })
    })
    await page.setViewportSize({ width: 360, height: 960 })
    await page.goto(origin + '/login')
    for (const join of [false, true]) {
      const checkbox = page.getByRole('checkbox', { name: '로그인 상태 유지', exact: true })
      await expect(checkbox).not.toBeChecked()
      await expect(checkbox).toHaveAccessibleDescription('선택하면 이 기기에서 최대 7일간 유지됩니다. 공용 기기에서는 선택하지 마세요.')
      await checkbox.setChecked(rememberMe)
      await page.getByLabel('아이디', { exact: true }).fill('retentiontest')
      await page.getByLabel('비밀번호', { exact: true }).fill('Retention123')
      if (join) await page.getByLabel('닉네임', { exact: true }).fill('테스트')
      if (!rememberMe) {
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        await page.screenshot({ path: test.info().outputPath(`retention-${join ? 'join' : 'login'}-360.png`), fullPage: true })
      }
      await page.getByRole('button', { name: join ? '가입하고 시작하기' : '로그인', exact: true }).click()
      await expect(page.getByRole('alert')).toBeVisible()
      expect(logins.at(-1)).toEqual({ username: 'retentiontest', password: 'Retention123', rememberMe })
      if (!join) await page.getByRole('link', { name: '회원가입', exact: true }).click()
    }
    expect(joins).toEqual([{ username: 'retentiontest', password: 'Retention123', nickname: '테스트' }])
  })
}

test('auth route changes clear errors and all credentials in both directions', async ({ page }) => {
  memberStatus = 401
  currentMember = null
  await page.route('**/api/v1/members/login', route => route.fulfill({ status: 401, json: { message: 'Login rejected' } }))
  await page.route('**/api/v1/members/join', route => route.fulfill({ status: 400, json: { message: 'Join rejected' } }))
  await page.goto(origin + '/login')
  await page.getByLabel('아이디', { exact: true }).fill('routecheck')
  await page.getByLabel('비밀번호', { exact: true }).fill('RouteSecret9')
  await page.getByRole('button', { name: '로그인', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('link', { name: '회원가입', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByLabel('아이디', { exact: true })).toBeEmpty()
  await expect(page.getByLabel('비밀번호', { exact: true })).toBeEmpty()
  await page.getByLabel('아이디', { exact: true }).fill('routecheck')
  await page.getByLabel('비밀번호', { exact: true }).fill('RouteSecret9')
  await page.getByLabel('닉네임', { exact: true }).fill('테스트')
  await page.getByRole('button', { name: '가입하고 시작하기', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('link', { name: '로그인', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByLabel('아이디', { exact: true })).toBeEmpty()
  await expect(page.getByLabel('비밀번호', { exact: true })).toBeEmpty()
  await expect(page.getByLabel('닉네임', { exact: true })).toHaveCount(0)
})

test('signup rules are visible and linked to fields before submission', async ({ page }) => {
  memberStatus = 401
  currentMember = null
  await page.goto(origin + '/join')
  await expect(page.getByLabel('아이디', { exact: true })).toHaveAccessibleDescription('영문 소문자와 숫자만 사용, 4~20자')
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveAccessibleDescription('영문과 숫자를 모두 포함, 8~30자')
  await expect(page.getByLabel('닉네임', { exact: true })).toHaveAccessibleDescription('1~10자')
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 960 })
    await expect(page.getByText('영문과 숫자를 모두 포함, 8~30자', { exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`signup-rules-${width}.png`), fullPage: true })
  }
  await page.getByRole('link', { name: '로그인', exact: true }).click()
  await expect(page.getByText('영문과 숫자를 모두 포함, 8~30자', { exact: true })).toHaveCount(0)
})

test('calendar defaults to applied dates and preserves explicit hidden preferences', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2028-01-31T12:00:00'))
  applications = [{ id: 7, company: 'Applied fixture', position: 'Engineer', status: 'APPLIED', appliedDate: '2028-01-31', schedules: [] }]
  await page.goto(origin + '/calendar')
  await expect(page.getByRole('checkbox', { name: '지원일', exact: true })).toBeChecked()
  await expect(page.getByRole('button', { name: /Applied fixture/ })).toBeVisible()
  for (const types of [['INTERVIEW', 'DEADLINE'], []]) {
    await page.evaluate(value => localStorage.setItem('calendar-types', JSON.stringify(value)), types)
    await page.reload()
    await expect(page.getByRole('checkbox', { name: '지원일', exact: true })).not.toBeChecked()
    await expect(page.getByRole('button', { name: /Applied fixture/ })).toHaveCount(0)
    await page.getByRole('button', { name: '지원 기록 1건 표시', exact: true }).click()
    await expect(page.getByRole('button', { name: /Applied fixture/ })).toBeVisible()
    await expect(page.getByRole('button', { name: '지원 기록 1건 표시', exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('checkbox', { name: '지원일', exact: true })).toBeChecked()
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('calendar-types')))).toEqual([...types, 'APPLIED'])
  }
})

test('cancelled calendar events can be inspected and restored without leaving the calendar', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 960 })
  await page.clock.setFixedTime(new Date('2028-01-31T12:00:00'))
  applications = [{ id: 7, company: 'Cancelled fixture', position: 'Engineer', status: 'INTERVIEW', schedules: [
    { id: 8, type: 'INTERVIEW', title: 'Cancelled interview', date: '2028-01-31', state: 'CANCELLED', version: 0 },
  ] }]
  await page.route('**/applications/7/schedules/8', async route => {
    applications[0].schedules[0] = { ...applications[0].schedules[0], ...route.request().postDataJSON() }
    await route.fulfill({ json: applications[0].schedules[0] })
  })
  await page.goto(origin + '/calendar')
  await expect(page.getByRole('checkbox', { name: '취소 일정 포함' })).not.toBeChecked()
  await expect(page.getByRole('button', { name: /Cancelled interview/ })).toHaveCount(0)
  await page.getByRole('checkbox', { name: '취소 일정 포함' }).check()
  await expect(page.getByRole('button', { name: /Cancelled interview · 취소/ })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('cancelled-calendar-360.png'), fullPage: true })
  await page.getByRole('checkbox', { name: '면접', exact: true }).uncheck()
  await expect(page.getByRole('button', { name: /Cancelled interview/ })).toHaveCount(0)
  await page.getByRole('checkbox', { name: '면접', exact: true }).check()
  await page.getByRole('button', { name: /Cancelled interview · 취소/ }).click()
  await page.getByRole('combobox', { name: '일정 상태', exact: true }).selectOption('SCHEDULED')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('checkbox', { name: '취소 일정 포함' }).uncheck()
  await expect(page.getByRole('button', { name: /Cancelled interview/ })).toBeVisible()
  expect(applications[0].schedules[0].state).toBe('SCHEDULED')
})

test('stale status keeps the dialog and does not retry or open an interview schedule', async ({ page }) => {
  applications = [{ id: 7, version: 3, company: 'Status fixture', position: 'Engineer', status: 'APPLIED', appliedDate: '2026-01-01', schedules: [] }]
  let writes = 0
  await page.route('**/applications/7/status', async route => {
    writes++
    expect(route.request().postDataJSON().version).toBe(3)
    await route.fulfill({ status: 409, json: { message: '다른 화면에서 변경된 기록입니다. 새로고침 후 다시 시도해 주세요.' } })
  })
  await page.goto(origin + '/applications')
  await page.getByRole('combobox', { name: 'Status fixture 상태 변경' }).selectOption('INTERVIEW')
  await page.getByRole('checkbox', { name: '상태 저장 후 면접 일정 등록' }).check()
  await page.getByRole('button', { name: '상태 저장 후 일정 등록', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('다른 화면에서 변경된 기록')
  await expect(page.getByRole('button', { name: '상태 저장 후 일정 등록', exact: true })).toBeEnabled()
  await expect(page.getByRole('dialog', { name: '일정 추가', exact: true })).toHaveCount(0)
  expect(writes).toBe(1)
  expect(applications[0].status).toBe('APPLIED')
})

test('interview option clearly saves status before opening a cancellable schedule form', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 960 })
  applications = [{ id: 7, version: 3, company: 'Status fixture', position: 'Engineer', status: 'APPLIED', appliedDate: '2026-01-01', schedules: [] }]
  await page.route('**/applications/7/status', async route => {
    expect(route.request().postDataJSON().version).toBe(3)
    applications[0] = { ...applications[0], version: 4, status: route.request().postDataJSON().status }
    await route.fulfill({ json: applications[0] })
  })
  await page.goto(origin + '/applications')
  await page.getByRole('combobox', { name: 'Status fixture 상태 변경' }).selectOption('INTERVIEW')
  await page.getByRole('checkbox', { name: '상태 저장 후 면접 일정 등록' }).check()
  await page.getByRole('button', { name: '상태 저장 후 일정 등록', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '일정 추가', exact: true })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '상태를 변경했습니다.' })).toBeVisible()
  await page.getByRole('button', { name: '취소', exact: true }).click()
  await expect(page.getByRole('combobox', { name: 'Status fixture 상태 변경' })).toHaveValue('INTERVIEW')
  expect(applications[0].schedules).toEqual([])
})

test('calendar primary action adds an event on the selected date or a first application', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2028-01-31T12:00:00'))
  await page.goto(origin + '/calendar')
  await page.getByRole('button', { name: '첫 지원 추가', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '지원 추가', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '취소', exact: true }).click()
  applications = [{ id: 7, company: 'Calendar fixture', position: 'Engineer', status: 'TO_APPLY', schedules: [] }]
  await page.reload()
  await page.getByRole('button', { name: '다음 달', exact: true }).click()
  await page.getByRole('button', { name: '선택 날짜 일정 추가', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '일정 추가', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '날짜', exact: true })).toHaveValue('2028-02-29')
  await page.getByRole('button', { name: '취소', exact: true }).click()
  await page.getByRole('link', { name: '지원', exact: true }).click()
  await page.getByRole('button', { name: '지원 추가', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '지원 추가', exact: true })).toBeVisible()
})

for (const width of [360, 1440]) {
  test(`application detail restores all list filters at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 })
    await page.clock.setFixedTime(new Date('2028-01-31T12:00:00'))
    applications = [{ id: 7, company: 'Filter fixture', position: 'Engineer', status: 'INTERVIEW', appliedDate: '2028-01-30', schedules: [
      { id: 8, type: 'INTERVIEW', title: 'Interview', date: '2028-02-01', state: 'SCHEDULED' },
    ] }]
    const query = '?view=upcoming-interviews&q=fixture&status=INTERVIEW&sort=company'
    await page.goto(origin + '/applications' + query)
    for (const name of ['상세 보기', 'Filter fixture Engineer']) {
      await page.getByRole('link', { name, exact: true }).click()
      await expect(page.getByRole('heading', { name: 'Filter fixture', exact: true })).toBeVisible()
      await page.getByRole('link', { name: '지원 목록', exact: true }).click()
      await expect(page).toHaveURL(origin + '/applications' + query)
      await expect(page.getByRole('button', { name: '면접 예정', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByRole('textbox', { name: '회사 또는 직무 검색' })).toHaveValue('fixture')
      await expect(page.getByRole('combobox', { name: '지원 상태 필터' })).toHaveValue('INTERVIEW')
      await expect(page.getByRole('combobox', { name: '정렬' })).toHaveValue('company')
    }
    await page.goto(origin + '/applications/7')
    await page.getByRole('link', { name: '지원 목록', exact: true }).click()
    await expect(page).toHaveURL(origin + '/applications')
  })
}

for (const width of [360, 1440]) {
  test(`calendar month navigation keeps date, events and new schedule aligned at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 })
    await page.clock.setFixedTime(new Date('2028-01-31T12:00:00'))
    applications = [{ id: 7, company: 'Calendar fixture', position: 'Engineer', status: 'INTERVIEW', appliedDate: '2028-01-30', schedules: [
      { id: 8, type: 'INTERVIEW', title: 'February interview', date: '2028-02-29', time: '10:00:00', state: 'SCHEDULED', version: 0 },
    ] }]
    await page.goto(origin + '/calendar')
    await expect(page.getByRole('heading', { name: '2028년 1월', exact: true })).toBeVisible()
    await page.getByRole('button', { name: '다음 달', exact: true }).click()
    await expect(page.getByRole('heading', { name: '2028년 2월', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '2월 29일 화요일', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '2월 29일, 일정 1건', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: /February interview/ })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`calendar-aligned-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: '일정 추가', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '날짜', exact: true })).toHaveValue('2028-02-29')
    await page.getByRole('button', { name: '취소', exact: true }).click()
    await page.getByRole('button', { name: '이전 달', exact: true }).click()
    await expect(page.getByRole('heading', { name: '1월 29일 토요일', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /February interview/ })).toHaveCount(0)
  })
}

test('calendar handles year boundaries, leap day, adjacent days and today', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2028-01-31T12:00:00'))
  await page.goto(origin + '/calendar')
  await expect(page.getByRole('heading', { name: '2028년 1월', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '이전 달', exact: true }).click()
  await expect(page.getByRole('heading', { name: '2027년 12월', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '12월 31일 금요일', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '다음 달', exact: true }).click()
  await expect(page.getByRole('heading', { name: '1월 31일 월요일', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '오늘', exact: true }).click()
  await expect(page.getByRole('heading', { name: '1월 31일 월요일', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '2월 1일, 일정 0건', exact: true }).click()
  await expect(page.getByRole('heading', { name: '2028년 2월', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '2월 29일, 일정 0건', exact: true }).click()
  await expect(page.getByRole('heading', { name: '2월 29일 화요일', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '다음 달', exact: true }).click()
  await expect(page.getByRole('heading', { name: '3월 29일 수요일', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '오늘', exact: true }).click()
  await expect(page.getByRole('heading', { name: '2028년 1월', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '1월 31일 월요일', exact: true })).toBeVisible()
})

test('calendar uses the current day after clamping to a shorter month', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2027-01-31T12:00:00'))
  await page.goto(origin + '/calendar')
  for (const [direction, date] of [
    ['다음 달', '2월 28일'],
    ['다음 달', '3월 28일'],
    ['이전 달', '2월 28일'],
    ['이전 달', '1월 28일'],
  ]) {
    await page.getByRole('button', { name: direction, exact: true }).click()
    await expect(page.getByRole('button', { name: date + ', 일정 0건', exact: true })).toHaveAttribute('aria-pressed', 'true')
  }
  await page.getByRole('button', { name: '1월 15일, 일정 0건', exact: true }).click()
  await page.getByRole('button', { name: '다음 달', exact: true }).click()
  await expect(page.getByRole('button', { name: '2월 15일, 일정 0건', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '오늘', exact: true }).click()
  await expect(page.getByRole('button', { name: '1월 31일, 일정 0건', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

for (const responseStatus of [200, 401]) {
  test(`leaving a pending login ignores its late ${responseStatus} response`, async ({ page }) => {
    memberStatus = 401
    currentMember = null
    let pendingLogin
    await page.route('**/api/v1/members/login', route => { pendingLogin = route })
    await page.goto(origin + '/login')
    await page.getByLabel('아이디', { exact: true }).fill('routecheck')
    await page.getByLabel('비밀번호', { exact: true }).fill('RouteSecret9')
    await page.getByRole('button', { name: '로그인', exact: true }).click()
    await expect.poll(() => Boolean(pendingLogin)).toBe(true)
    const canceled = page.waitForEvent('requestfailed', { predicate: r => r.url().endsWith('/members/login') })
    await page.getByRole('link', { name: '회원가입', exact: true }).click()
    await canceled
    await expect(page.getByRole('button', { name: '가입하고 시작하기', exact: true })).toBeEnabled()
    await pendingLogin.fulfill({ status: responseStatus, json: responseStatus === 200 ? member : { message: 'Late rejection' } })
    await expect(page).toHaveURL(origin + '/join')
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByLabel('비밀번호', { exact: true })).toBeEmpty()
  })
}

test('cross-tab activation preserves an editor until explicit clean reload', async ({ page, context }) => {
  await open(page)
  const other = await context.newPage()
  await open(other)
  await page.getByRole('button', { name: '지원 추가', exact: true }).click()
  await page.getByLabel('회사명').fill('유지할 회사')
  await update(other)
  const updateButton = page.getByRole('button', { name: '업데이트', exact: true })
  await expect(updateButton).toBeDisabled()
  await other.getByRole('button', { name: '업데이트', exact: true }).click()
  await expect(other.getByRole('button', { name: '업데이트', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('회사명')).toHaveValue('유지할 회사')
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await expect(page.getByLabel('회사명')).toHaveValue('유지할 회사')
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '닫기', exact: true }).click()
  await expect(updateButton).toBeEnabled()
  await updateButton.click()
  await expect(page.getByRole('button', { name: '업데이트', exact: true })).toHaveCount(0)
})

test('password form starts collapsed and only discards drafts after confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 960 })
  await open(page, '/mypage')
  await expect(page.getByRole('button', { name: '비밀번호 변경 열기' })).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByLabel('현재 비밀번호')).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath('settings-collapsed-360.png'), fullPage: true })
  await page.getByRole('button', { name: '비밀번호 변경 열기' }).click()
  await page.getByLabel('현재 비밀번호').fill('Temporary9!')
  await update(page)
  page.once('dialog', dialog => dialog.dismiss())
  await page.getByRole('button', { name: '비밀번호 변경 접기' }).click()
  await expect(page.getByLabel('현재 비밀번호')).toHaveValue('Temporary9!')
  await expect(page.getByRole('button', { name: '업데이트', exact: true })).toBeDisabled()
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: '비밀번호 변경 접기' }).click()
  await expect(page.getByLabel('현재 비밀번호')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '업데이트', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '비밀번호 변경 열기' }).click()
  await expect(page.getByLabel('현재 비밀번호')).toBeEmpty()
})

test('password input blocks update and is never persisted', async ({ page }) => {
  await open(page, '/mypage')
  await page.getByRole('button', { name: '비밀번호 변경 열기', exact: true }).click()
  await page.getByLabel('현재 비밀번호').fill('SecretValue9!')
  await update(page)
  await expect(page.getByRole('button', { name: '업데이트', exact: true })).toBeDisabled()
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 960 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.screenshot({ path: test.info().outputPath(`protected-update-${width}.png`), fullPage: true })
  }
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))
  expect(storage).not.toContain('SecretValue9!')
  expect(await page.evaluate(() => {
    const event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    return event.defaultPrevented
  })).toBe(true)
  await page.getByRole('button', { name: '취소', exact: true }).last().click()
  await expect(page.getByLabel('현재 비밀번호')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '업데이트', exact: true })).toBeEnabled()
})

test('offline refresh preserves account form and cancellation releases its guard', async ({ page, context }) => {
  await page.setViewportSize({ width: 360, height: 960 })
  await open(page, '/mypage')
  await page.getByRole('textbox', { name: '닉네임', exact: true }).fill('유지할이름')
  await update(page)
  await context.setOffline(true)
  await page.getByRole('button', { name: '새로고침', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByRole('textbox', { name: '닉네임', exact: true })).toHaveValue('유지할이름')
  await context.setOffline(false)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '업데이트', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '취소', exact: true }).first().click()
  await expect(page.getByRole('button', { name: '업데이트', exact: true })).toBeEnabled()
})

test('offline save keeps inputs, reconnect never repeats a write, in-flight save blocks update', async ({ page, context }) => {
  await open(page)
  await page.getByRole('button', { name: '지원 추가', exact: true }).click()
  await page.getByLabel('회사명').fill('오프라인 회사')
  await page.getByLabel('직무', { exact: true }).fill('개발자')
  await context.setOffline(true)
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.getByLabel('회사명')).toHaveValue('오프라인 회사')
  await context.setOffline(false)
  expect(releaseSave).toBeNull()
  // Establish the waiting update before deliberately holding a fetch open.
  await update(page)
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect.poll(() => !!releaseSave).toBe(true)
  await expect(page.getByRole('button', { name: '업데이트', exact: true })).toBeDisabled()
  releaseSave()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '업데이트', exact: true })).toBeEnabled()
})

for (const status of [503, 0]) {
  test(`background session failure ${status} preserves input and blocks saving until verified`, async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: '지원 추가', exact: true }).click()
    await page.getByLabel('회사명').fill('보존할 초안')
    await page.getByLabel('직무', { exact: true }).fill('개발자')
    memberStatus = status
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page.getByRole('dialog').getByRole('alert')).toContainText('로그인 상태를 다시 확인하지 못했습니다')
    await expect(page.getByLabel('회사명')).toHaveValue('보존할 초안')
    await expect(page.getByRole('button', { name: '저장', exact: true })).toBeDisabled()
    expect(releaseSave).toBeNull()
    if (status === 503) {
      for (const width of [360, 1440]) {
        await page.setViewportSize({ width, height: 960 })
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
        const bounds = await page.getByRole('dialog').boundingBox()
        expect(bounds.x).toBeGreaterThanOrEqual(0)
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width)
        await page.screenshot({ path: test.info().outputPath(`session-recovery-${width}.png`), fullPage: true })
      }
    }
    memberStatus = 200
    await page.getByRole('dialog').getByRole('button', { name: '로그인 다시 확인', exact: true }).click()
    await expect(page.getByRole('button', { name: '저장', exact: true })).toBeEnabled()
    await expect(page.getByLabel('회사명')).toHaveValue('보존할 초안')
    memberStatus = 401
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(page).toHaveURL(origin + '/login')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
}

test('initial session failure blocks private UI and retry recovers', async ({ page }) => {
  memberStatus = 503
  await page.goto(origin)
  await expect(page.getByRole('alert')).toContainText('서버에 연결할 수 없습니다')
  await expect(page.getByRole('button', { name: '지원 추가', exact: true })).toHaveCount(0)
  memberStatus = 200
  await page.getByRole('button', { name: '다시 시도', exact: true }).click()
  await expect(page.getByRole('heading', { name: '오늘', exact: true })).toBeVisible()
})

test('account inputs survive failed verification and recover without persistent drafts', async ({ page }) => {
  await open(page, '/mypage')
  await page.getByRole('button', { name: '비밀번호 변경 열기', exact: true }).click()
  await page.getByRole('textbox', { name: '닉네임', exact: true }).fill('입력보존')
  await page.getByLabel('현재 비밀번호').fill('Temporary9!')
  memberStatus = 503
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('alert')).toContainText('로그인 상태를 다시 확인하지 못했습니다')
  await expect(page.getByRole('textbox', { name: '닉네임', exact: true })).toHaveValue('입력보존')
  await expect(page.getByLabel('현재 비밀번호')).toHaveValue('Temporary9!')
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '비밀번호 변경', exact: true })).toBeDisabled()
  const storage = await page.evaluate(() => JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }))
  expect(storage).not.toContain('Temporary9!')
  expect(storage).not.toContain('입력보존')
  memberStatus = 200
  await page.getByRole('button', { name: '로그인 다시 확인', exact: true }).click()
  await expect(page.getByRole('button', { name: '저장', exact: true })).toBeEnabled()
  await expect(page.getByRole('textbox', { name: '닉네임', exact: true })).toHaveValue('입력보존')
})

test('a different confirmed member cannot inherit the previous draft', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: '지원 추가', exact: true }).click()
  await page.getByLabel('회사명').fill('이전 계정 초안')
  currentMember = { id: 2, username: 'other', nickname: '다른계정' }
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button', { name: '지원 추가', exact: true }).click()
  await expect(page.getByLabel('회사명')).toBeEmpty()
})

for (const oldStatus of [200, 503]) {
  test(`an older list response ${oldStatus} cannot overwrite the latest result`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 960 })
    await open(page)
    await page.getByRole('link', { name: '지원', exact: true }).click()
    holdLists = true
    listStatuses = [oldStatus, 200]
    await page.getByRole('button', { name: '새로고침', exact: true }).click()
    await expect.poll(() => pendingLists.length).toBe(1)
    await page.getByRole('button', { name: '새로고침', exact: true }).click()
    await expect.poll(() => pendingLists.length).toBe(2)
    const application = { id: 1, version: 0, company: '최신 회사', position: '개발자', status: 'TO_APPLY', schedules: [] }
    pendingLists[1].end(JSON.stringify([application]))
    await expect(page.getByRole('heading', { name: '최신 회사', exact: true })).toBeVisible()
    const oldResponse = page.waitForEvent('requestfinished', request => request.url().endsWith('/applications'))
    pendingLists[0].end(JSON.stringify(oldStatus === 200 ? [] : { message: '오래된 오류' }))
    await oldResponse
    // Flush the already delivered response through React before asserting absence.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    await expect(page.getByRole('heading', { name: '최신 회사', exact: true })).toBeVisible()
    await expect(page.getByText('오래된 오류', { exact: true })).toHaveCount(0)
  })
}
