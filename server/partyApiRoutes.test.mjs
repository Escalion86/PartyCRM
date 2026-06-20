import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const route = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party health route checks PartyCRM product database explicitly', async () => {
  const source = await route('app/api/party/health/route.js')

  assert.match(source, /PRODUCTS\.PARTYCRM/)
  assert.match(source, /getProductDbConnection\(PRODUCTS\.PARTYCRM\)/)
  assert.match(source, /partycrm_db_unavailable/)
})

test('party memberships route exposes only membership context for current session', async () => {
  const source = await route('app/api/party/memberships/route.js')

  assert.match(source, /getPartyMembershipContext/)
  assert.match(source, /sessionUser/)
  assert.match(source, /memberships/)
  assert.match(source, /unauthorized/)
})

test('party me route resolves active company through request context', async () => {
  const source = await route('app/api/party/me/route.js')

  assert.match(source, /getPartyRequestContext\(\{\s*req\s*\}\)/)
  assert.match(source, /tenantId/)
  assert.match(source, /staff/)
  assert.match(source, /company/)
})
