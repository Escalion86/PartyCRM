import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party public lead API and Tilda create draft orders and notify managers', async () => {
  const apiRoute = await source('app/api/party/public/lead/route.js')
  const tildaRoute = await source('app/api/party/public/lead/tilda/route.js')
  const service = await source('server/partyPublicLeadService.js')
  const core = await source('server/partyPublicLeadCore.js')

  for (const route of [apiRoute, tildaRoute]) {
    assert.match(route, /resolvePartyPublicLeadCompany/)
    assert.match(route, /createPartyPublicLeadOrder/)
    assert.match(route, /status:\s*order\.status/)
    assert.match(route, /status:\s*201/)
  }

  assert.match(tildaRoute, /normalizePartyTildaLeadPayload/)
  assert.match(apiRoute, /normalizePartyPublicLeadPayload/)
  assert.match(core, /status:\s*'draft'/)
  assert.match(core, /leadMeta:\s*\{/)
  assert.match(service, /PartyOrders\.create\(\{/)
  assert.match(service, /sendPushToTenant\(\{/)
  assert.match(service, /product:\s*'partycrm'/)
  assert.match(service, /source:\s*'party-public-lead'/)
  assert.match(service, /leadSource:\s*normalized\.source/)
  assert.match(service, /client\.leadSource = normalized\.source/)
  assert.match(service, /url:\s*'\/company\/orders'/)
})
