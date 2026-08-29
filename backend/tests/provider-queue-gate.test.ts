import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  acquireSlot,
  gateKey,
  getInFlightCount,
  getWaiterCount,
  registerSlot,
  releaseSlot,
  resetProviderQueueGate,
  resolveQueueSize,
} from '../src/services/provider-queue-gate.ts'

beforeEach(() => {
  resetProviderQueueGate()
})

test('resolveQueueSize: missing/invalid → null', () => {
  assert.equal(resolveQueueSize(null), null)
  assert.equal(resolveQueueSize(undefined), null)
  assert.equal(resolveQueueSize({}), null)
  assert.equal(resolveQueueSize({ queueSize: 0 }), null)
  assert.equal(resolveQueueSize({ queueSize: 21 }), null)
  assert.equal(resolveQueueSize({ queueSize: 'x' }), null)
  assert.equal(resolveQueueSize('{"queueSize":3}'), 3)
  assert.equal(resolveQueueSize({ queueSize: 5 }), 5)
})

test('gateKey normalizes provider + baseUrl', () => {
  assert.equal(
    gateKey('ComfyUI', 'http://127.0.0.1:8188/'),
    gateKey('comfyui', 'http://127.0.0.1:8188'),
  )
  assert.notEqual(
    gateKey('comfyui', 'http://127.0.0.1:8188'),
    gateKey('volcengine', 'http://127.0.0.1:8188'),
  )
})

test('acquireSlot: limit=2 blocks third until release', async () => {
  const key = gateKey('comfyui', 'http://127.0.0.1:8188')
  const active = () => true

  assert.equal(await acquireSlot({ key, limit: 2, taskId: 1, isActive: active }), true)
  assert.equal(await acquireSlot({ key, limit: 2, taskId: 2, isActive: active }), true)
  assert.equal(getInFlightCount(key), 2)

  let thirdDone = false
  const third = acquireSlot({ key, limit: 2, taskId: 3, isActive: active }).then((ok) => {
    thirdDone = true
    return ok
  })

  await new Promise((r) => setTimeout(r, 50))
  assert.equal(thirdDone, false)
  assert.equal(getWaiterCount(key), 1)

  releaseSlot(1)
  assert.equal(await third, true)
  assert.equal(getInFlightCount(key), 2)
  assert.equal(getWaiterCount(key), 0)

  releaseSlot(2)
  releaseSlot(3)
  assert.equal(getInFlightCount(key), 0)
})

test('acquireSlot: cancelled waiter does not take slot', async () => {
  const key = gateKey('comfyui', 'http://a')
  let alive = true
  assert.equal(await acquireSlot({ key, limit: 1, taskId: 10, isActive: () => true }), true)

  const waiting = acquireSlot({
    key,
    limit: 1,
    taskId: 11,
    isActive: () => alive,
  })

  await new Promise((r) => setTimeout(r, 50))
  assert.equal(getWaiterCount(key), 1)

  alive = false
  // interval is 200ms — wait for cancel detection
  assert.equal(await waiting, false)
  assert.equal(getInFlightCount(key), 1)

  releaseSlot(10)
  assert.equal(getInFlightCount(key), 0)
})

test('releaseSlot is idempotent; registerSlot occupies count', () => {
  const key = gateKey('comfyui', 'http://b')
  registerSlot(key, 100, 2)
  registerSlot(key, 100, 2)
  assert.equal(getInFlightCount(key), 1)

  releaseSlot(100)
  releaseSlot(100)
  assert.equal(getInFlightCount(key), 0)
})
