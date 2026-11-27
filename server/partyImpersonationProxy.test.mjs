import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { NextRequest, NextResponse } from 'next/server.js'
import * as constants from '../helpers/partyImpersonationConstants.js'

const source = readFileSync(new URL('../proxy.js', import.meta.url), 'utf8')
  .replace(/^import [\s\S]*? from '[^']+'\r?\n/gm, '')
  .replaceAll('export ', '')
const proxy = new Function(
  'NextResponse',
  ...Object.keys(constants),
  `${source}\nreturn proxy`
)(NextResponse, ...Object.values(constants))

const targetContext = 'test-target-context'
const run = (path, { method = 'PATCH', context, impersonating = false } = {}) => {
  const request = new NextRequest(`http://127.0.0.1:3007/api/party/${path}`, { method })
  if (impersonating) {
    request.cookies.set(constants.PARTY_IMPERSONATION_COOKIE, 'session')
    request.cookies.set(constants.PARTY_IMPERSONATION_UI_COOKIE, targetContext)
  }
  if (context) request.headers.set(constants.PARTY_SESSION_CONTEXT_HEADER, context)
  return proxy(request)
}

test('allows ordinary writes and integration actions in the selected account', () => {
  const options = { context: targetContext, impersonating: true }
  for (const [path, method] of [
    ['auth/me', 'PATCH'],
    ['tasks', 'POST'],
    ['orders/order-id', 'DELETE'],
    ['google-calendar/auth-url', 'GET'],
  ]) {
    const response = run(path, { ...options, method })
    assert.equal(response.headers.get('x-middleware-next'), '1')
    assert.match(response.headers.get('cache-control'), /no-store/)
  }
})

test('rejects writes queued under a different account on entry and return', () => {
  assert.equal(run('auth/me', { context: 'own', impersonating: true }).status, 409)
  assert.equal(run('auth/me', { context: targetContext }).status, 409)
  assert.equal(run('auth/me', { context: 'previous-target', impersonating: true }).status, 409)
  assert.equal(run('auth/me', { context: 'own' }).headers.get('x-middleware-next'), '1')
})

test('keeps return available and protects the original login cookie', () => {
  const options = { context: targetContext, impersonating: true }
  for (const action of ['login', 'logout', 'register', 'vk']) {
    assert.equal(run(`auth/${action}`, { ...options, method: 'POST' }).status, 409)
  }
  assert.equal(run('auth/impersonation', { ...options, method: 'DELETE' }).headers.get('x-middleware-next'), '1')
  assert.equal(run('auth/logout', { context: 'own', method: 'POST' }).headers.get('x-middleware-next'), '1')
})
