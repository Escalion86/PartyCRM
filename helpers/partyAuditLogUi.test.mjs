import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('audit log API is tenant-aware and management-only', async () => {
  const route = await source('app/api/party/audit-log/route.js')

  assert.match(route, /getPartyRequestContext/)
  assert.match(route, /managementOnly:\s*true/)
  assert.match(route, /tenantId:\s*context\.tenantId/)
  assert.match(route, /query\.entityId\s*=\s*orderId/)
})

test('company UI exposes global and per-order audit history', async () => {
  const [workspace, orderView, shell] = await Promise.all([
    source('app/company/CompanyWorkspaceClient.js'),
    source('components/party/modals/OrderViewModal.js'),
    source('components/party/PartyAppShell.js'),
  ])

  assert.match(workspace, /section === 'audit'/)
  assert.match(workspace, /<PartyAuditLog[\s\S]*?activeCompanyId=/)
  assert.match(orderView, /orderId=\{String\(order\?\._id/)
  assert.match(shell, /managementOnly:\s*true/)
  assert.match(shell, /\/company\/audit/)
})
