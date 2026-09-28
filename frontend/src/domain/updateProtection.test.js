import test from 'node:test'
import assert from 'node:assert/strict'
import { createProtectionStore, createUpdateCoordinator } from './updateProtection.js'

test('independent forms retain protection until all are released', () => {
  const store = createProtectionStore()
  let notifications = 0
  const unsubscribe = store.subscribe(() => notifications++)
  store.set('application', true)
  store.set('password', true)
  store.remove('application')
  assert.equal(store.getSnapshot(), true)
  store.remove('password')
  assert.equal(store.getSnapshot(), false)
  assert.equal(notifications, 2)
  unsubscribe()
})

function fixture() {
  const state = { blocked: false, online: true, reloads: 0, ready: 0, activations: 0 }
  const coordinator = createUpdateCoordinator({ isBlocked: () => state.blocked, isOnline: () => state.online, reload: () => state.reloads++, onReady: () => state.ready++ })
  return { state, coordinator, activate: () => state.activations++ }
}

test('dirty or offline pages do not activate an update', async () => {
  const { state, coordinator, activate } = fixture()
  state.blocked = true
  assert.equal(await coordinator.apply(activate), false)
  state.blocked = false; state.online = false
  assert.equal(await coordinator.apply(activate), false)
  assert.equal(state.activations, 0)
})

test('an explicitly requested clean update reloads after activation', async () => {
  const { state, coordinator, activate } = fixture()
  await coordinator.apply(activate)
  coordinator.activated()
  assert.equal(state.reloads, 1)
})

test('another tab activating never forces this page to reload', async () => {
  const { state, coordinator, activate } = fixture()
  coordinator.activated()
  assert.equal(state.reloads, 0)
  assert.equal(state.ready, 1)
  await coordinator.apply(activate)
  assert.equal(state.reloads, 1)
  assert.equal(state.activations, 0)
})

test('typing while activation is in flight postpones the reload', async () => {
  const { state, coordinator, activate } = fixture()
  await coordinator.apply(activate)
  state.blocked = true
  coordinator.activated()
  assert.equal(state.reloads, 0)
  state.blocked = false
  assert.equal(state.reloads, 0)
  await coordinator.apply(activate)
  assert.equal(state.reloads, 1)
})

test('a rejected activation cannot authorize a later external reload', async () => {
  const { state, coordinator } = fixture()
  await assert.rejects(coordinator.apply(() => Promise.reject(new Error('failed'))))
  coordinator.activated()
  assert.equal(state.reloads, 0)
})
