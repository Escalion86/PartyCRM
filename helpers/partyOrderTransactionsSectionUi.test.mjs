import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party order transaction editor opens in a modal with party form fields', async () => {
  const transactionsSection = await source(
    'components/party/orders/PartyOrderTransactionsSection.js'
  )

  assert.match(transactionsSection, /import Modal from '@components\/Modal'/)
  assert.match(transactionsSection, /import Input from '@components\/Input'/)
  assert.match(transactionsSection, /import Select from '@components\/Select'/)
  assert.match(transactionsSection, /<Modal[\s\S]*title=\{draft\?\._id \? 'Редактировать транзакцию' : 'Добавить транзакцию'\}/)
  assert.match(transactionsSection, /<Input[\s\S]*label="Сумма"[\s\S]*tone="party"[\s\S]*postfix="₽"/)
  assert.match(transactionsSection, /<Select[\s\S]*label="Тип"/)
  assert.match(transactionsSection, /<Select[\s\S]*label="Категория"/)
  assert.match(transactionsSection, /<Input[\s\S]*label="Дата"[\s\S]*type="date"/)
  assert.match(transactionsSection, /grid gap-x-3 gap-y-4 md:grid-cols-2/)
  assert.doesNotMatch(
    transactionsSection,
    /<Input[\s\S]*label="Сумма"[\s\S]*fullWidth[\s\S]*postfix="₽"/
  )
  assert.doesNotMatch(transactionsSection, /grid gap-2 rounded-md border border-sky-100 bg-sky-50/)
})

test('payout transaction performer is limited to assigned order staff', async () => {
  const transactionsSection = await source(
    'components/party/orders/PartyOrderTransactionsSection.js'
  )

  assert.match(transactionsSection, /assignedStaffIds/)
  assert.match(transactionsSection, /new Set\(\s*\(Array\.isArray\(assignedStaff\) \? assignedStaff : \[\]\)/)
  assert.match(transactionsSection, /assignedStaffIds\.has\(String\(draft\.staffId\)\)/)
  assert.match(transactionsSection, /Выберите исполнителя из назначенных в заказе/)
  assert.doesNotMatch(transactionsSection, /Array\.isArray\(staff\) \? staff : \[\]\)\s*\.map\(\(assignment\)/)
})

test('party order transactions requests include active company context', async () => {
  const transactionsSection = await source(
    'components/party/orders/PartyOrderTransactionsSection.js'
  )
  const orderModal = await source('components/party/modals/OrderModal.js')
  const transactionsHook = await source('helpers/usePartyTransactionsQuery.js')

  assert.match(transactionsSection, /activeCompanyId/)
  assert.match(
    transactionsSection,
    /usePartyTransactionsQuery\(\s*\{\s*orderId,\s*activeCompanyId/
  )
  assert.match(
    transactionsSection,
    /useCreatePartyTransactionMutation\(\s*activeCompanyId\s*\)/
  )
  assert.match(
    transactionsSection,
    /useUpdatePartyTransactionMutation\(\s*activeCompanyId\s*\)/
  )
  assert.match(
    transactionsSection,
    /useDeletePartyTransactionMutation\(\s*activeCompanyId\s*\)/
  )
  assert.match(orderModal, /activeCompanyId=\{activeCompanyId\}/)
  assert.match(transactionsHook, /buildCompanyHeaders/)
  assert.match(transactionsHook, /'x-partycrm-company-id': activeCompanyId/)
  assert.match(transactionsHook, /headers: buildCompanyHeaders\(activeCompanyId\)/)
})
