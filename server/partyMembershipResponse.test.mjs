import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('./partyMembershipResponse.js', import.meta.url), 'utf8')
const { serializePartyMembershipResponse, serializePartyMembershipCompany } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)
const secret = 'secret-must-never-appear'
const company = {
  _id: 'company', title: 'Компания', status: 'active', balance: 4000, legalTitle: 'Юрлицо',
  privateFutureField: secret,
  settings: {
    timeZone: 'Asia/Krasnoyarsk', defaultTown: 'Красноярск', defaultOrderDurationMinutes: 90,
    eventTypes: ['Праздник', { unknownSecret: secret }],
    publicLeadApiKeys: [{ key: secret }], publicLeadRoutingRules: [{ privateLocation: secret }],
    documents: { privateFile: secret }, notifications: { subscriptions: [secret] }, unknown: secret,
    integrations: { avitoEnabled: true, avitoStatus: 'connected', avitoClientSecret: secret, vkGroups: [{ token: secret }], telegramBusinessBotToken: secret, telegramBusinessWebhookUrl: secret, aiLastError: secret, futureCredential: secret },
    googleCalendar: { accessToken: secret, refreshToken: secret, calendarId: secret, enabled: true },
  },
}
const membership = (role) => ({ staffId: 'staff', tenantId: 'company', role, status: 'active', isAdmin: true, extra: secret, company, staff: { _id: 'staff', tenantId: 'company', role, firstName: 'Имя', authUserId: 'user', privateFutureField: secret } })

test('owner and admin receive whitelisted display settings and indicators, never credentials', () => {
  for (const role of ['owner', 'admin']) {
    const result = serializePartyMembershipResponse(membership(role))
    assert.equal(result.company.balance, 4000)
    assert.equal(result.company.settings.defaultTown, 'Красноярск')
    assert.deepEqual(result.company.settings.eventTypes, ['Праздник'])
    assert.equal(result.company.settings.integrations.avitoStatus, 'connected')
    assert.equal(result.company.settings.googleCalendar.connected, true)
    assert.equal(result.staff.authUserId, 'user')
    assert.ok(!JSON.stringify(result).includes(secret))
  }
})

test('performer and unknown/scoped roles get company identity/timezone only, never billing or integration data', () => {
  for (const role of ['performer', 'location_owner', 'unknown']) {
    const result = serializePartyMembershipResponse(membership(role))
    assert.equal(result.isAdmin, false)
    assert.deepEqual(Object.keys(result.company).sort(), ['_id', 'tenantId', 'title', 'status', 'settings'].sort())
    assert.deepEqual(result.company.settings, { timeZone: 'Asia/Krasnoyarsk' })
    assert.equal(result.company.balance, undefined)
    assert.ok(!JSON.stringify(result).includes(secret))
  }
})

test('serialization leaves internal context credentials intact for server integrations', () => {
  const before = JSON.stringify(company)
  serializePartyMembershipCompany(company, 'owner')
  assert.equal(JSON.stringify(company), before)
  assert.equal(company.settings.googleCalendar.refreshToken, secret)
})

test('integration free-form error and unknown status payloads cannot leak via indicators', () => {
  const result = serializePartyMembershipCompany({ ...company, settings: { integrations: { avitoStatus: secret, avitoLastCheckedAt: secret, avitoLastError: secret } } }, 'owner')
  assert.equal(result.settings.integrations.avitoStatus, '')
  assert.equal(result.settings.integrations.avitoLastCheckedAt, null)
  assert.ok(!JSON.stringify(result).includes(secret))
})
