import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const source = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('financial operations require approval for payment and freeze onsite receipts after submission', async () => {
  const text = await source('server/partyFinancialSettlements.js')
  assert.match(
    text,
    /normalized\.type === 'payment' && settlement\.status !== 'approved'/
  )
  assert.match(
    text,
    /normalized\.type === 'received_on_site'[\s\S]*!\['draft', 'revision'\]\.includes\(settlement\.status\)/
  )
  assert.match(
    text,
    /normalized\.amountKopecks > Math\.max\(0, totals\.balance\)/
  )
  assert.match(
    text,
    /tenantId: context\.tenantId,[\s\S]*idempotencyKey: normalized\.idempotencyKey/
  )
})

test('approved payroll period is closed for late settlements and unsettled lines', async () => {
  const [settlements, payroll, route] = await Promise.all([
    source('server/partyFinancialSettlements.js'),
    source('server/partyPayrollStatements.js'),
    source('app/api/party/financial-settlements/[id]/route.js'),
  ])
  assert.match(settlements, /status: \{ \$in: \['approved', 'paid'\] \}/)
  assert.match(route, /periodKey: current\.periodKey/)
  assert.match(payroll, /status: \{ \$ne: 'approved' \}/)
  assert.match(payroll, /item\.totals\.balance !== 0/)
})

test('financial UI is available in orders, performer cabinet and payroll route', async () => {
  const [orderView, performer, payrollPage, menu] = await Promise.all([
    source('components/party/modals/OrderViewModal.js'),
    source('app/performer/PerformerWorkspaceClient.js'),
    source('app/company/payroll/page.js'),
    source('components/party/PartyAppShell.js'),
  ])
  assert.match(orderView, /PartyFinancialSettlementsPanel/)
  assert.match(performer, /Расчёт по празднику/)
  assert.match(payrollPage, /\['owner', 'admin'\]/)
  assert.match(menu, /href: '\/company\/payroll'/)
})
