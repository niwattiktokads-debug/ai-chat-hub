import assert from 'node:assert/strict'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

const testDir = join(tmpdir(), `ai-chat-hub-test-${process.pid}`)
mkdirSync(testDir, { recursive: true })

process.env.CHAT_HUB_DISABLE_LISTEN = '1'
process.env.CHAT_HUB_DATA_PATH = join(testDir, 'runtime-state.json')
process.env.CHAT_HUB_API_KEY = 'test-key'
process.env.CHAT_HUB_ALLOWED_ORIGINS = 'http://127.0.0.1:5174'

const { dashboard, reviewText, server, verifyHmacSignature } = await import('./index.mjs')

function listen() {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server.address()))
  })
}

function close() {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()))
  })
}

test.after(async () => {
  if (server.listening) await close()
  rmSync(testDir, { recursive: true, force: true })
})

test('reviewText blocks risky pricing and refund messages', () => {
  assert.deepEqual(reviewText('ลดได้ไหม').risk, 'medium')
  assert.equal(reviewText('ลดได้ไหม').score, 6)
  assert.deepEqual(reviewText('ขอยกเลิกและคืนเงิน').risk, 'high')
  assert.equal(reviewText('ขอยกเลิกและคืนเงิน').score, 4)
  assert.deepEqual(reviewText('มีสีดำไซซ์ M ไหม').risk, 'low')
})

test('dashboard returns numeric values', () => {
  const result = dashboard()
  assert.equal(Number.isNaN(result.avgScore), false)
  assert.equal(Number.isNaN(result.avgLatency), false)
})

test('verifyHmacSignature accepts valid signatures and rejects invalid ones', () => {
  const payload = Buffer.from('{"text":"hello"}')
  const valid = verifyHmacSignature({
    algorithm: 'sha256',
    secret: 'secret',
    signatureHeader: 'sha256=3b3b2696b97f30066225d75f057c5960f6518d7a42d500f01f4704290c7fdf8a',
    payload,
    prefix: 'sha256=',
  })
  assert.equal(valid.ok, true)

  const invalid = verifyHmacSignature({
    algorithm: 'sha256',
    secret: 'secret',
    signatureHeader: 'sha256=bad',
    payload,
    prefix: 'sha256=',
  })
  assert.equal(invalid.ok, false)
})

test('protected API writes require x-chat-hub-api-key when configured', async () => {
  const address = server.listening ? server.address() : await listen()
  const baseUrl = `http://${address.address}:${address.port}`

  const blocked = await fetch(`${baseUrl}/api/chat-hub/knowledge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ title: 'Blocked' }),
  })
  assert.equal(blocked.status, 401)

  const allowed = await fetch(`${baseUrl}/api/chat-hub/knowledge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-chat-hub-api-key': 'test-key' },
    body: JSON.stringify({ title: 'Allowed', content: 'ok' }),
  })
  const body = await allowed.json()
  assert.equal(allowed.status, 200)
  assert.equal(body.ok, true)
})
