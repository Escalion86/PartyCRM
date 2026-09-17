import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'

const source = (await readFile(new URL('../app/company/inbox/page.js', import.meta.url), 'utf8'))
  .replace(/^import .*\r?\n/gm, '')
  .replaceAll('export const ', 'const ')
  .replace('export default async function', 'async function')
  .replace('return <PartyInboxClient companies={companies} />', 'return companies')
const render = (context) => compileFunction(`${source}\nreturn InboxPage()`, ['redirect', 'getPartyMembershipContext'])(
  (url) => { throw new Error(url) }, async () => context
)
const member = (tenantId, staffId, role = 'owner', status = 'active') => ({ tenantId, staffId, role, status, company: { title: `Компания ${tenantId}`, privateField: 'secret' } })

test('inbox company options are unique and keep the first eligible membership identity', async () => {
  const companyId = '6a1828661014527ee8515e4e'
  const result = await render({ sessionUser: { _id: 'user' }, memberships: [
    member(companyId, 'dev:user:company'),
    member(companyId, 'actual-owner'),
    member(companyId, 'actual-admin', 'admin'),
    member('second', 'second-admin', 'admin'),
  ] })
  assert.deepEqual(result, [
    { id: companyId, title: `Компания ${companyId}`, staffId: 'dev:user:company' },
    { id: 'second', title: 'Компания second', staffId: 'second-admin' },
  ])
  assert.equal(new Set(result.map(item => item.id)).size, result.length)
})

test('inbox filtering still requires active management membership and login', async () => {
  await assert.rejects(render({ sessionUser: null, memberships: [] }), { message: '/party/login?callbackUrl=/company/inbox' })
  const excluded = [member('a', 'performer', 'performer'), member('b', 'paused', 'admin', 'paused'), member('c', 'location-owner', 'location_owner'), member(null, 'missing-tenant')]
  await assert.rejects(render({ sessionUser: { _id: 'user' }, memberships: excluded }), { message: '/party/entry' })
  assert.deepEqual(await render({ sessionUser: { _id: 'user' }, memberships: [...excluded, member('b', 'active-admin', 'admin')] }), [{ id: 'b', title: 'Компания b', staffId: 'active-admin' }])
})
