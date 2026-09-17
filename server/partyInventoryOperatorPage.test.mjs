import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const permissionsSource = await readFile(new URL('../helpers/partyOperationalPermissions.js', import.meta.url), 'utf8')
const permissionsUrl = `data:text/javascript;base64,${Buffer.from(permissionsSource).toString('base64')}`
const pageSource = await readFile(new URL('../app/performer/inventory/page.js', import.meta.url), 'utf8')
const source = pageSource
  .replace("import { redirect } from 'next/navigation'", 'const redirect = (path) => { throw new Error(path) }')
  .replace("import getPartyMembershipContext from '@server/getPartyMembershipContext'", 'const getPartyMembershipContext = async () => globalThis.__inventoryPageTestContext')
  .replace('@helpers/partyOperationalPermissions', permissionsUrl)
  .replace(/^import PartyInventoryOperatorWorkspace.*$/m, '')
  .replace('return <PartyInventoryOperatorWorkspace companies={companies} />', 'return companies')
const { default: renderPage } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`)

const membership = (tenantId, role = 'performer', permissions = []) => ({
  tenantId, role, status: 'active', company: { title: tenantId, secret: 'private' },
  staff: { tenantId, role, status: 'active', operationalPermissions: permissions },
})

test('warehouse page requires authentication and direct access permission', async () => {
  globalThis.__inventoryPageTestContext = { sessionUser: null, memberships: [] }
  await assert.rejects(renderPage(), { message: '/party/login?callbackUrl=/performer/inventory' })
  globalThis.__inventoryPageTestContext = { sessionUser: { _id: 'u', role: 'admin' }, memberships: [membership('a')] }
  await assert.rejects(renderPage(), { message: '/performer' })
})

test('warehouse page sends identity only for permitted memberships', async () => {
  const mismatched = membership('wrong', 'performer', ['inventory.movements'])
  mismatched.staff.tenantId = 'other'
  const archived = membership('archived', 'performer', ['inventory.movements'])
  archived.staff.status = 'archived'
  globalThis.__inventoryPageTestContext = {
    sessionUser: { _id: 'u' },
    memberships: [membership('a'), membership('b', 'performer', ['inventory.movements']), membership('c', 'owner'), membership('c', 'performer', ['inventory.movements']), membership('d', 'location_owner', ['inventory.movements']), mismatched, archived],
  }
  assert.deepEqual(await renderPage(), [{ id: 'b', title: 'b' }, { id: 'c', title: 'c' }])
})
