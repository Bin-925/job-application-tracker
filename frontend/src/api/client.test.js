import test from 'node:test'
import assert from 'node:assert/strict'
import { AxiosError } from 'axios'
import { createSessionClient } from './client.js'

const response = (config, data = {}) => ({ config, data, status: 200, statusText: 'OK', headers: {} })
const fail = (config, status) => { throw new AxiosError('Rejected', 'ERR_BAD_RESPONSE', config, {}, { status, data: {} }) }

test('credentials accompany every request and fresh CSRF precedes every mutation', async () => {
  const seen = []
  let token = 0
  const api = createSessionClient({ adapter: async config => {
    seen.push(config)
    if (config.url === '/members/csrf') return response(config, { headerName: 'X-CSRF-TOKEN', token: String(++token) })
    return response(config)
  } })
  await api.get('/members/me')
  await api.post('/members/login', {})
  await api.patch('/members/me/nickname', {})
  await api.delete('/members/me', { data: { currentPassword: 'dummy' } })
  assert.deepEqual(seen.map(c => c.url), ['/members/me', '/members/csrf', '/members/login', '/members/csrf', '/members/me/nickname', '/members/csrf', '/members/me'])
  for (const config of seen) {
    assert.equal(config.withCredentials, true)
    assert.equal(config.headers.has('Authorization'), false)
  }
  assert.deepEqual(seen.filter(c => c.method !== 'get').map(c => c.headers.get('X-CSRF-TOKEN')), ['1', '2', '3'])
})

test('failed CSRF fetch prevents the write', async () => {
  const seen = []
  const api = createSessionClient({ adapter: async config => { seen.push(config.url); return fail(config, 503) } })
  await assert.rejects(api.post('/applications', {}))
  assert.deepEqual(seen, ['/members/csrf'])
})

test('403 does not automatically retry a mutation', async () => {
  let writes = 0
  const api = createSessionClient({ adapter: async config => {
    if (config.url === '/members/csrf') return response(config, { headerName: 'X-CSRF-TOKEN', token: 'csrf' })
    writes++
    return fail(config, 403)
  } })
  await assert.rejects(api.post('/applications', {}))
  assert.equal(writes, 1)
})

test('401 notifies session expiry except for login and the session probe', async () => {
  let expired = 0
  const api = createSessionClient({ onUnauthorized: () => expired++, adapter: async config => {
    if (config.url === '/members/csrf') return response(config, { headerName: 'X-CSRF-TOKEN', token: 'csrf' })
    return fail(config, 401)
  } })
  await assert.rejects(api.get('/members/me'))
  await assert.rejects(api.post('/members/login', {}))
  assert.equal(expired, 0)
  await assert.rejects(api.get('/applications'))
  await assert.rejects(api.delete('/members/me'))
  assert.equal(expired, 2)
})
