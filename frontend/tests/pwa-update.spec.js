import { test, expect } from '@playwright/test'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

let server, origin, revision, releaseSave
const root = path.resolve('dist')
const member = { id: 1, username: 'pwatest', nickname: '테스트' }

test.beforeEach(async () => {
  revision = 1
  releaseSave = null
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname
    response.setHeader('Cache-Control', 'no-store')
    if (pathname.startsWith('/api/')) {
      response.setHeader('Content-Type', 'application/json')
      if (pathname.endsWith('/csrf')) return response.end(JSON.stringify({ headerName: 'X-CSRF-TOKEN', token: 'fixture' }))
      if (pathname.endsWith('/me')) return response.end(JSON.stringify(member))
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

test('password input blocks update and is never persisted', async ({ page }) => {
  await open(page, '/mypage')
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
  await expect(page.getByLabel('현재 비밀번호')).toBeEmpty()
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
