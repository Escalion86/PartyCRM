import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('company orders flow checks and displays location or performer conflicts', async () => {
  const workspace = await source('app/company/CompanyWorkspaceClient.js')
  const ordersList = await source('components/party/lists/OrdersList.js')
  const checkRoute = await source('app/api/party/orders/check-conflicts/route.js')

  assert.match(workspace, /hasOrderConflict/)
  assert.match(workspace, /Обнаружен конфликт по времени или исполнителям/)
  assert.match(workspace, /value:\s*'conflict'/)
  assert.match(ordersList, /Конфликт/)
  assert.match(checkRoute, /findPartyOrderConflicts/)
  assert.match(checkRoute, /hasConflicts/)
  assert.match(checkRoute, /locationConflicts/)
  assert.match(checkRoute, /staffConflicts/)
})
