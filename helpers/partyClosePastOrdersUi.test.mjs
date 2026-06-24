import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('company close-past action shows financial result and payout status', async () => {
  const component = await source('app/company/CompanyWorkspaceClient.js')
  const closePastBlock = component.slice(
    component.indexOf('const closePastOrders = useCallback'),
    component.indexOf('const createOrderFromCall = useCallback')
  )

  assert.match(closePastBlock, /response\.data\?\.closed/)
  assert.match(closePastBlock, /buildClosePastOrdersAlert/)
  assert.match(component, /Финансовый результат закрытых заказов/)
  assert.match(component, /Маржа:/)
  assert.match(component, /Статус выплат:/)
  assert.match(component, /formatClosePayoutStatus/)
})
