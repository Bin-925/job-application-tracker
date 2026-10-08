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
      if (pathname.endsWith('/registration/options')) return response.end(JSON.stringify({ required: false }))
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

for (const width of [360, 1440]) {
  test(`dirty account form protects menu and browser back at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(origin + '/applications')
    await page.getByRole('link', { name: '내 정보', exact: true }).click()
    await page.getByLabel('닉네임', { exact: true }).fill('작성중')
    await page.getByRole('link', { name: '일정', exact: true }).click()
    const confirmation = page.getByRole('dialog', { name: '작성 화면을 나갈까요?' })
    await expect(confirmation).toBeVisible()
    await page.screenshot({ path: testInfo.outputPath(`navigation-${width}.png`), fullPage: true })
    await confirmation.getByRole('button', { name: '계속 작성' }).click()
    await expect(page.getByLabel('닉네임', { exact: true })).toHaveValue('작성중')
    await page.evaluate(() => history.back())
    await expect(confirmation).toBeVisible()
    await confirmation.getByRole('button', { name: '나가기', exact: true }).click()
    await expect(page).toHaveURL(origin + '/applications')
  })
}

test('pending save blocks back and successful save releases navigation without a second prompt', async ({ page }) => {
  await page.goto(origin + '/applications')
  await page.getByRole('link', { name: '내 정보', exact: true }).click()
  await page.getByRole('link', { name: '지원', exact: true }).click()
  await page.getByRole('button', { name: '지원 추가', exact: true }).click()
  await page.getByLabel('회사명').fill('Save company')
  await page.getByLabel('직무', { exact: true }).fill('Developer')
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect.poll(() => !!releaseSave).toBe(true)
  await page.evaluate(() => history.back())
  const confirmation = page.getByRole('dialog', { name: '요청 처리 중입니다' })
  await expect(confirmation).toBeVisible()
  await expect(confirmation.getByRole('button', { name: '나가기', exact: true })).toBeDisabled()
  await confirmation.getByRole('button', { name: '계속 작성' }).click()
  releaseSave()
  await expect(page).toHaveURL(origin + '/applications')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

test('device draft is opt-in and can be restored after reload then removed after save', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 360, height: 900 })
  await page.goto(origin + '/applications/new')
  await page.getByLabel('회사명').fill('Draft company')
  await page.getByLabel('직무', { exact: true }).fill('Developer')
  expect(await page.evaluate(() => Object.keys(localStorage).some(key => key.startsWith('jobtracker.application-draft.')))).toBe(false)
  await page.getByLabel('이 기기에 새 지원 초안 보관').check()
  await page.getByLabel('메모', { exact: true }).fill('기기 보관 메모')
  await expect(page.getByText('기기에 초안을 보관했습니다.')).toBeVisible()
  page.once('dialog', dialog => dialog.accept())
  await page.reload()
  await expect(page.getByLabel('회사명')).toBeEmpty()
  await page.getByRole('button', { name: '초안 불러오기' }).click()
  await expect(page.getByLabel('회사명')).toHaveValue('Draft company')
  await expect(page.getByRole('textbox', { name: '메모', exact: true })).toHaveValue('기기 보관 메모')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('draft-mobile.png'), fullPage: true })
  await page.getByRole('button', { name: '저장', exact: true }).click()
  await expect.poll(() => !!releaseSave).toBe(true)
  releaseSave()
  await expect(page).toHaveURL(origin + '/applications')
  expect(await page.evaluate(() => localStorage.getItem('jobtracker.application-draft.v1.1'))).toBeNull()
})

test('session expiry clears device draft and does not let navigation guard retain private inputs', async ({ page }) => {
  await page.goto(origin + '/applications/new')
  await page.getByLabel('회사명').fill('Private company')
  await page.getByLabel('이 기기에 새 지원 초안 보관').check()
  memberStatus = 401
  await page.evaluate(() => window.dispatchEvent(new Event('auth-expired')))
  await expect(page).toHaveURL(origin + '/login')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('jobtracker.application-draft.v1.1'))).toBeNull()
})

test('device draft storage failure retains form and reports failure instead of saved', async ({ page }) => {
  await page.goto(origin + '/applications/new')
  await page.getByLabel('회사명').fill('Retain input')
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError') } })
  await page.getByLabel('이 기기에 새 지원 초안 보관').check()
  await expect(page.getByRole('alert')).toContainText('초안을 저장하지 못했습니다')
  await expect(page.getByLabel('회사명')).toHaveValue('Retain input')
  await expect(page.getByText('기기에 초안을 보관했습니다.')).toHaveCount(0)
})

test('draft deleted by another tab is not silently recreated', async ({ page, context }) => {
  await page.goto(origin + '/applications/new')
  await page.getByLabel('회사명').fill('Private draft')
  await page.getByLabel('이 기기에 새 지원 초안 보관').check()
  const second = await context.newPage()
  await second.goto(origin + '/applications')
  await second.evaluate(() => localStorage.removeItem('jobtracker.application-draft.v1.1'))
  await expect(page.getByLabel('이 기기에 새 지원 초안 보관')).not.toBeChecked()
  await page.getByLabel('메모', { exact: true }).fill('Unsaved edit')
  expect(await page.evaluate(() => localStorage.getItem('jobtracker.application-draft.v1.1'))).toBeNull()
})

test('email-first registration requests only email and does not call legacy signup or login', async ({ page }) => {
  memberStatus = 401
  await page.route('**/api/v1/members/registration/options', route => route.fulfill({ json: { required: true } }))
  let requested = 0, legacy = 0
  await page.route('**/api/v1/members/registration/requests', route => {
    requested++
    expect(route.request().postDataJSON()).toEqual({ email: 'signup@example.test' })
    return route.fulfill({ status: 202 })
  })
  await page.route('**/api/v1/members/join', route => { legacy++; return route.fulfill({ status: 201 }) })
  await page.route('**/api/v1/members/login', route => { legacy++; return route.fulfill({ json: member }) })
  await page.goto(origin + '/join')
  await expect(page.getByLabel('아이디', { exact: true })).toHaveCount(0)
  await page.getByLabel('이메일', { exact: true }).fill('signup@example.test')
  await page.getByRole('button', { name: '인증 메일 요청' }).click()
  await expect(page.getByRole('status')).toContainText('인증 메일을 요청')
  expect(requested).toBe(1); expect(legacy).toBe(0)
})

for (const width of [360, 1440]) {
  test(`registration confirmation preserves duplicate input and checks password confirmation at ${width}px`, async ({ page }) => {
    memberStatus = 401
    const token = 'r'.repeat(43)
    let sent = 0
    await page.route('**/api/v1/members/registration/confirm', route => {
      sent++
      expect(route.request().postDataJSON()).toEqual({ token, member: { username: sent === 1 ? 'existing' : 'newuser', password: 'Signup123', nickname: '지원자' } })
      return route.fulfill(sent === 1 ? { status: 409, json: { message: '이미 사용 중인 아이디입니다.' } } : { status: 201 })
    })
    await page.setViewportSize({ width, height: 900 })
    await page.goto(origin + '/verify-registration#token=' + token)
    await expect(page).toHaveURL(origin + '/verify-registration')
    expect(sent).toBe(0)
    await page.getByLabel('아이디', { exact: true }).fill('existing')
    await page.getByLabel('닉네임', { exact: true }).fill('지원자')
    await page.getByLabel('비밀번호', { exact: true }).fill('Signup123')
    await page.getByLabel('비밀번호 확인', { exact: true }).fill('Mismatch123')
    await page.getByRole('button', { name: '가입 완료', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('일치하지')
    expect(sent).toBe(0)
    await page.getByLabel('비밀번호 확인', { exact: true }).fill('Signup123')
    await page.getByRole('button', { name: '가입 완료', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText('이미 사용 중')
    await expect(page.getByLabel('비밀번호', { exact: true })).toHaveValue('Signup123')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByLabel('아이디', { exact: true }).fill('newuser')
    await page.getByRole('button', { name: '가입 완료', exact: true }).click()
    await expect(page.getByRole('status')).toContainText('가입을 완료')
    await expect(page).toHaveURL(origin + '/verify-registration')
    await expect(page.getByLabel('비밀번호', { exact: true })).toHaveCount(0)
  })
}

test('registration settings failure offers retry and missing link cannot submit', async ({ page }) => {
  memberStatus = 401
  let attempts = 0
  await page.route('**/api/v1/members/registration/options', route => {
    attempts++
    return route.fulfill(attempts === 1 ? { status: 503, json: { message: '서버 연결을 확인해 주세요.' } } : { json: { required: true } })
  })
  await page.goto(origin + '/join')
  await expect(page.getByRole('alert')).toContainText('서버 연결')
  await page.getByRole('button', { name: '다시 확인' }).click()
  await expect(page.getByLabel('이메일', { exact: true })).toBeVisible()
  await page.goto(origin + '/verify-registration')
  await expect(page.getByRole('alert')).toContainText('유효한 가입 링크가 없습니다')
  await expect(page.getByRole('button', { name: '가입 완료', exact: true })).toHaveCount(0)
})

test('registration does not confuse a currently signed-in account with a new one', async ({ page }) => {
  await page.goto(origin + '/verify-registration#token=' + 'r'.repeat(43))
  await expect(page.getByRole('heading', { name: '현재 로그인 중입니다' })).toBeVisible()
  await expect(page.getByRole('button', { name: '가입 완료', exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '내 정보로 이동' })).toHaveAttribute('href', '/mypage')
})

test('Google login is hidden while disabled and refuses an untrusted redirect', async ({ page }) => {
  memberStatus = 401
  let enabled = false
  await page.route('**/api/v1/oauth/google/options', route => route.fulfill({ json: { enabled } }))
  await page.goto(origin + '/login')
  await expect(page.getByRole('button', { name: '로그인', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Google로 계속하기' })).toHaveCount(0)
  enabled = true
  await page.reload()
  await page.route('**/api/v1/oauth/google/start', route => {
    expect(route.request().postDataJSON()).toEqual({ mode: 'LOGIN', rememberMe: true })
    return route.fulfill({ json: { authorizationUrl: 'https://untrusted.invalid' } })
  })
  await page.getByRole('checkbox', { name: '로그인 상태 유지', exact: true }).check()
  await page.getByRole('button', { name: 'Google로 계속하기' }).click()
  await expect(page.getByRole('alert')).toContainText('인증 경로를 확인할 수 없습니다')
  await expect(page).toHaveURL(origin + '/login')
})

test('Google enrollment uses only username and nickname and preserves duplicate input', async ({ page }) => {
  memberStatus = 401
  await page.route('**/api/v1/oauth/google/enrollment', route => route.fulfill({ json: { pending: true } }))
  await page.route('**/api/v1/oauth/google/complete', route => {
    expect(route.request().postDataJSON()).toEqual({ username: 'existing', nickname: '지원자' })
    return route.fulfill({ status: 409, json: { message: '이미 사용 중인 아이디입니다.' } })
  })
  await page.goto(origin + '/complete-google-signup')
  await page.getByLabel('아이디', { exact: true }).fill('existing')
  await page.getByLabel('닉네임', { exact: true }).fill('지원자')
  await expect(page.getByLabel('비밀번호', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '가입 완료', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('이미 사용 중')
  await expect(page.getByLabel('닉네임', { exact: true })).toHaveValue('지원자')
})

test('expired Google enrollment and cancelled authentication are recoverable', async ({ page }) => {
  memberStatus = 401
  await page.route('**/api/v1/oauth/google/enrollment', route => route.fulfill({ json: { pending: false } }))
  await page.goto(origin + '/complete-google-signup')
  await expect(page.getByRole('status')).toContainText('Google 인증을 다시 진행')
  await expect(page.getByRole('button', { name: '가입 완료', exact: true })).toHaveCount(0)
  await page.goto(origin + '/login?googleError')
  await expect(page.getByRole('alert')).toContainText('Google 인증을 완료하지 못했습니다')
})

for (const width of [360, 1440]) {
  test(`Google-only account requires fresh proof and consumes it after email request at ${width}px`, async ({ page }) => {
    currentMember = { ...member, hasPassword: false }
    await page.route('**/api/v1/members/me/login-methods', route => route.fulfill({ json: { googleEnabled: true, googleLinked: true, hasPassword: false, googleVerified: true } }))
    await page.route('**/api/v1/members/me/recovery-email', route => route.fulfill({ json: { available: true, verifiedEmail: null, pendingEmail: null } }))
    await page.route('**/api/v1/members/me/google/recovery-email', route => {
      expect(route.request().postDataJSON()).toEqual({ email: 'verify@example.test' })
      return route.fulfill({ status: 204 })
    })
    await page.setViewportSize({ width, height: 1000 })
    await page.goto(origin + '/mypage')
    await expect(page.getByRole('button', { name: 'Google 연결 해제' })).toHaveCount(0)
    await expect(page.getByLabel('이메일 등록용 현재 비밀번호')).toHaveCount(0)
    await expect(page.getByRole('button', { name: '비밀번호 추가', exact: true })).toBeEnabled()
    await page.getByLabel('복구 이메일', { exact: true }).fill('verify@example.test')
    await page.getByRole('button', { name: '인증 메일 보내기' }).click()
    await expect(page.getByText(/인증 메일을 발송 서버에 전달했습니다/)).toBeVisible()
    await expect(page.getByRole('button', { name: '비밀번호 추가', exact: true })).toBeDisabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}

test('Google-only account deletion needs confirmation and fresh proof', async ({ page }) => {
  currentMember = { ...member, hasPassword: false }
  await page.route('**/api/v1/members/me/login-methods', route => route.fulfill({ json: { googleEnabled: true, googleLinked: true, hasPassword: false, googleVerified: true } }))
  await page.route('**/api/v1/members/me/recovery-email', route => route.fulfill({ json: { available: false } }))
  let deleted = 0
  await page.route('**/api/v1/members/me/google/delete', route => {
    deleted++; memberStatus = 401; return route.fulfill({ status: 204 })
  })
  await page.goto(origin + '/mypage')
  await page.getByRole('button', { name: '회원 탈퇴', exact: true }).click()
  await page.getByRole('button', { name: '계정 영구 삭제' }).click()
  expect(deleted).toBe(0)
  await page.getByRole('checkbox', { name: '삭제되는 내용을 확인했습니다.' }).check()
  await page.getByRole('button', { name: '계정 영구 삭제' }).click()
  await expect(page).toHaveURL(origin + '/login')
  expect(deleted).toBe(1)
})

test('password reset request reports accepted without exposing an account and retains rejected input', async ({ page }) => {
  await page.route('**/api/v1/members/password-reset/options', route => route.fulfill({ json: { available: true } }))
  let attempts = 0
  await page.route('**/api/v1/members/password-reset/requests', route => {
    attempts++
    expect(route.request().postDataJSON()).toEqual({ username: 'missing', email: 'user@example.test' })
    return route.fulfill(attempts === 1 ? { status: 429, json: { message: '잠시 후 다시 시도해 주세요.' } } : { status: 202 })
  })
  await page.setViewportSize({ width: 360, height: 800 })
  await page.goto(origin + '/forgot-password')
  await page.getByLabel('아이디', { exact: true }).fill('missing')
  await page.getByLabel('복구 이메일', { exact: true }).fill('user@example.test')
  await page.getByRole('button', { name: '재설정 메일 요청' }).click()
  await expect(page.getByRole('alert')).toContainText('잠시 후')
  await expect(page.getByLabel('아이디', { exact: true })).toHaveValue('missing')
  await page.getByRole('button', { name: '재설정 메일 요청' }).click()
  await expect(page.getByRole('status')).toContainText('일치하면')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('password reset link requires explicit submission and matching passwords, clears fragment and never auto logs in', async ({ page }) => {
  const token = 't'.repeat(43)
  let sent = 0, logins = 0
  await page.route('**/api/v1/members/login', route => { logins++; return route.fulfill({ json: member }) })
  await page.route('**/api/v1/members/password-reset/confirm', route => {
    sent++
    expect(route.request().postDataJSON()).toEqual({ token, newPassword: 'Changed123' })
    return route.fulfill(sent === 1 ? { status: 400, json: { message: '현재 비밀번호와 다른 비밀번호를 입력해 주세요.' } } : { status: 204 })
  })
  await page.goto(origin + '/reset-password#token=' + token)
  await expect(page).toHaveURL(origin + '/reset-password')
  expect(sent).toBe(0)
  await page.getByLabel('새 비밀번호', { exact: true }).fill('Changed123')
  await page.getByLabel('새 비밀번호 확인', { exact: true }).fill('Mismatch123')
  await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('일치하지')
  expect(sent).toBe(0)
  await page.getByLabel('새 비밀번호 확인', { exact: true }).fill('Changed123')
  await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('다른 비밀번호')
  await page.getByRole('button', { name: '비밀번호 변경', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('모든 기기')
  await expect(page.getByLabel('새 비밀번호', { exact: true })).toHaveCount(0)
  expect(logins).toBe(0)
})

test('password reset handles disabled mail and missing token', async ({ page }) => {
  await page.route('**/api/v1/members/password-reset/options', route => route.fulfill({ json: { available: false } }))
  await page.goto(origin + '/forgot-password')
  await expect(page.getByRole('status')).toContainText('사용할 수 없습니다')
  await expect(page.getByRole('button', { name: '재설정 메일 요청' })).toHaveCount(0)
  await page.goto(origin + '/reset-password')
  await expect(page.getByRole('alert')).toContainText('유효한 재설정 링크가 없습니다')
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

for (const width of [360, 1440]) {
  test(`account remains usable during initial application failure at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 960 })
    await page.route('**/api/v1/applications', route => route.fulfill({ status: 503, json: { message: '지원 목록을 불러오지 못했습니다.' } }))
    let logouts = 0
    await page.route('**/api/v1/members/logout', route => {
      logouts++
      currentMember = null
      memberStatus = 401
      return route.fulfill({ status: 204 })
    })
    await page.goto(origin + (width === 360 ? '/mypage/account/password' : '/mypage'))
    await expect(page.getByRole('heading', { name: '내 정보', exact: true })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText('지원 목록을 불러오지 못했습니다.')
    await expect(page.getByRole('button', { name: '다시 시도', exact: true })).toHaveCSS('white-space', 'nowrap')
    await expect(page.getByRole('textbox', { name: '닉네임', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: '회원 탈퇴', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '회원 탈퇴', exact: true })
    await expect(dialog).toContainText('모든 지원 내역')
    await expect(dialog).not.toContainText('0건')
    await dialog.getByRole('button', { name: '취소', exact: true }).click()
    await page.screenshot({ path: test.info().outputPath(`account-list-failure-${width}.png`), fullPage: true })
    await page.getByRole('button', { name: '로그아웃', exact: true }).click()
    await expect(page).toHaveURL(origin + '/login')
    expect(logouts).toBe(1)
  })
}

test('pending application list does not block or remount account inputs', async ({ page }) => {
  holdLists = true
  await page.goto(origin + '/mypage')
  await expect(page.getByRole('textbox', { name: '닉네임', exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '닉네임', exact: true }).fill('유지할입력')
  await expect.poll(() => pendingLists.length).toBeGreaterThan(0)
  holdLists = false
  pendingLists.splice(0).forEach(response => response.end('[]'))
  await expect(page.getByRole('textbox', { name: '닉네임', exact: true })).toHaveValue('유지할입력')
  await page.getByRole('button', { name: '회원 탈퇴', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '회원 탈퇴', exact: true })).toContainText('지원 내역 0건')
})

test('unauthenticated account route still requires login', async ({ page }) => {
  memberStatus = 401
  currentMember = null
  await page.goto(origin + '/mypage')
  await expect(page).toHaveURL(origin + '/login')
  await expect(page.getByRole('heading', { name: '내 정보', exact: true })).toHaveCount(0)
})

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
