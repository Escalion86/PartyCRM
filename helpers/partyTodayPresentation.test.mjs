import assert from 'node:assert/strict'
import test from 'node:test'
import {
  partyTodayDate,
  partyTodayHref,
  partyTodayPhoneHref,
} from './partyTodayPresentation.js'
import { resolvePartyInboxCompanyLink } from './partyInboxCompanyLink.js'
import { getPartyMobileNavItems } from './partyMobileNavigation.js'

const companyId = 'a'.repeat(24),
  orderId = 'b'.repeat(24),
  taskId = 'c'.repeat(24)

test('Today links preserve focused entity, force current company and follow workspace variant', () => {
  const order = new URL(
    partyTodayHref(
      `/performer/work?companyId=${taskId}&orderId=${orderId}&secret=private`,
      companyId,
      true
    ),
    'https://fixture.test'
  )
  assert.equal(order.pathname, '/company/work')
  assert.equal(order.searchParams.get('companyId'), companyId)
  assert.equal(order.searchParams.get('orderId'), orderId)
  assert.equal(order.searchParams.has('secret'), false)
  assert.equal(
    new URL(
      partyTodayHref(`/company/tasks?taskId=${taskId}`, companyId),
      'https://fixture.test'
    ).pathname,
    '/performer/tasks'
  )
  assert.equal(
    new URL(partyTodayHref('/company/inbox', companyId), 'https://fixture.test')
      .pathname,
    '/company/inbox'
  )
})

test('Today never turns server data into arbitrary URLs, tenant switches or invalid entity links', () => {
  for (const href of [
    'https://evil.test',
    '//evil.test',
    '/\\evil.test',
    '/company/settings',
    '/company/work?orderId=bad',
    `/company/tasks?orderId=${orderId}`,
    `/company/work?taskId=${taskId}`,
  ])
    assert.equal(partyTodayHref(href, companyId), null, href)
  assert.equal(partyTodayHref('/performer/work', ''), null)
})

test('contact action accepts only a complete canonical phone; dates use the company time zone', () => {
  assert.equal(partyTodayPhoneHref('+7 (913) 123-45-67'), 'tel:+79131234567')
  for (const phone of [
    'javascript:alert(1)',
    '79131234567;ext=55',
    '9131234567',
    '+441234567890',
    '',
    null,
  ])
    assert.equal(partyTodayPhoneHref(phone), null)
  assert.match(partyTodayDate('2026-10-28T18:00:00Z', 'Asia/Krasnoyarsk'), /29/)
  assert.match(
    partyTodayDate('2026-10-28T18:00:00Z', 'Asia/Krasnoyarsk', {
      timeOnly: true,
    }),
    /01:00/
  )
  assert.equal(partyTodayDate('bad', 'Asia/Krasnoyarsk'), '')
})

test('an explicit inbox company beats stored preference and an inaccessible link never falls back', () => {
  const companies = [{ id: companyId }, { id: orderId }]
  assert.equal(
    resolvePartyInboxCompanyLink({
      companies,
      requested: orderId,
      stored: companyId,
    }).companyId,
    orderId
  )
  const denied = resolvePartyInboxCompanyLink({
    companies,
    requested: taskId,
    stored: companyId,
  })
  assert.equal(denied.companyId, '')
  assert.ok(denied.error)
  assert.equal(
    resolvePartyInboxCompanyLink({ companies, stored: orderId }).companyId,
    orderId
  )
  assert.equal(resolvePartyInboxCompanyLink({ companies }).companyId, companyId)
})

test('mobile Today uses only an authorized menu item and retains orders, create and tasks', () => {
  const items = [
    '/company/today',
    '/company',
    '/company/work',
    '/company/tasks',
  ].map((href) => ({ href }))
  assert.deepEqual(
    getPartyMobileNavItems({ menu: items, company: true, canCreate: true }).map(
      (item) => (item.create ? 'create' : item.href)
    ),
    ['/company/today', '/company/work', 'create', '/company/tasks']
  )
  assert.equal(
    getPartyMobileNavItems({ menu: [{ href: '/performer/tasks' }] }).some(
      (item) => item.href.endsWith('/today')
    ),
    false
  )
  assert.equal(
    getPartyMobileNavItems({
      menu: [{ href: '/performer/today' }, { href: '/performer/tasks' }],
    })[0].href,
    '/performer/today'
  )
})
