import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party company shell exposes calls section for Novofon call processing', async () => {
  const page = await source('app/company/[section]/page.js')
  const shell = await source('components/party/PartyAppShell.js')
  const workspace = await source('app/company/CompanyWorkspaceClient.js')

  assert.match(page, /calls:\s*'Звонки'/)
  assert.match(shell, /href:\s*'\/company\/calls'/)
  assert.match(shell, /label:\s*'Звонки'/)
  assert.match(workspace, /\/api\/party\/calls/)
  assert.match(workspace, /section === 'calls'/)
  assert.match(workspace, /createOrderFromCall/)
})

test('party calls UI keeps order creation explicit and company-scoped', async () => {
  const callsList = await source('components/party/lists/CallsList.js')
  const workspace = await source('app/company/CompanyWorkspaceClient.js')

  assert.match(callsList, /Создать заказ/)
  assert.match(callsList, /orderDraft/)
  assert.match(callsList, /linkedOrderId/)
  assert.match(workspace, /\/api\/party\/calls\/\$\{callId\}\/create-order/)
  assert.match(workspace, /buildCompanyRequestOptions\(activeCompanyId/)
  assert.match(workspace, /setOrders\(\(prev\) => \[.*createdOrder/s)
})
