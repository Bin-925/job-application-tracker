import test from 'node:test'
import assert from 'node:assert/strict'
import { createDraftStorage, DRAFT_PREFIX, DRAFT_TTL } from './applicationDraft.js'
import { createNavigationProtection } from './navigationProtection.js'

function memoryStorage() {
  const map = new Map()
  return { get length() { return map.size }, key: i => [...map.keys()][i], getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) }
}
const values = { company: 'Example', position: 'Developer', status: 'TO_APPLY', memo: 'draft' }

test('draft allowlist excludes credentials and isolates members', () => {
  const store = createDraftStorage(memoryStorage(), () => 100)
  store.write(1, { ...values, password: 'not-saved', token: 'not-saved', memberId: 2 })
  assert.equal(store.read(1).values.password, undefined)
  assert.equal(store.read(1).values.token, undefined)
  assert.equal(store.read(2), null)
  store.write(2, values)
  store.retainOnly(1)
  assert.equal(store.read(1).values.company, 'Example')
  assert.equal(store.read(2), null)
  assert.throws(() => store.write('../1', values))
})
test('draft expiry, corruption, owner and bounds are validated', () => {
  const storage = memoryStorage()
  let now = 100
  const store = createDraftStorage(storage, () => now)
  store.write(1, values)
  now += DRAFT_TTL
  assert.equal(store.read(1), null)
  for (const raw of ['bad json', JSON.stringify({ version: 1, memberId: 2, savedAt: now, values }), JSON.stringify({ version: 1, memberId: 1, savedAt: now + 1, values })]) {
    storage.setItem(DRAFT_PREFIX + 1, raw)
    assert.equal(store.read(1), null)
  }
  assert.throws(() => store.write(1, { ...values, memo: 'x'.repeat(1001) }))
})
test('cleanup removes only application drafts and storage errors remain observable', () => {
  const storage = memoryStorage(), store = createDraftStorage(storage)
  storage.setItem('theme', 'dark'); store.write(1, values); store.write(2, values); store.clear()
  assert.equal(storage.length, 1); assert.equal(storage.getItem('theme'), 'dark')
  assert.throws(() => createDraftStorage({ setItem() { throw new Error('quota') } }).write(1, values), /quota/)
})
test('navigation protection aggregates independent dirty and pending forms', () => {
  const store = createNavigationProtection()
  const a = Symbol(), b = Symbol()
  store.set(a, { dirty: true, busy: false }); store.set(b, { dirty: false, busy: true })
  store.remove(a)
  assert.deepEqual(store.getSnapshot(), { blocked: true, busy: true })
  store.set(b, { dirty: true, busy: false })
  assert.deepEqual(store.getSnapshot(), { blocked: true, busy: false })
  store.clear()
  assert.deepEqual(store.getSnapshot(), { blocked: false, busy: false })
})
