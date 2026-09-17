import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { buildPartyProposalApplication } from './partyProposalApply.js'
import { normalizePartyOrderItems } from '../server/partyOrderBrief.js'
import { buildPartyProposalItemsFromOrder, calculatePartyProposalTotals } from './partyProposalCore.js'

test('proposal snapshot survives order save and a new proposal with fractional quantity and duration', () => {
  const items = [{ title: 'Шоу', quantity: 1.234, unit: 'час', unitPrice: 1000, durationMinutes: 75 }]
  const totals = calculatePartyProposalTotals(items, 100)
  const application = buildPartyProposalApplication({ proposal: { ...totals, version: 1 } })
  const savedItems = normalizePartyOrderItems(application.orderItems)
  assert.deepEqual(savedItems, application.orderItems)
  assert.equal(savedItems[0].total, 1234)
  assert.equal(savedItems[0].durationMinutes, 75)
  const next = calculatePartyProposalTotals(buildPartyProposalItemsFromOrder({ ...application, orderItems: savedItems }), application.agreedProposal.discount)
  assert.deepEqual(next, totals)
})

test('all accepted proposal rows survive saving an order with more than 100 lines', () => {
  const items = Array.from({ length: 120 }, (_, i) => ({ title: `Позиция ${i}`, quantity: 1, unitPrice: 100 }))
  const application = buildPartyProposalApplication({ proposal: calculatePartyProposalTotals(items) })
  assert.deepEqual(normalizePartyOrderItems(application.orderItems), application.orderItems)
})

test('accepted proposal becomes an immutable commercial snapshot without financial operations', () => {
  const result = buildPartyProposalApplication({
    proposal: { _id: 'p1', number: 'КП-7', version: 2, subtotal: 12500, discount: 500, total: 12000, items: [
      { serviceId: 's1', title: 'Анимация', quantity: 2, unit: 'час', unitPrice: 5000, discount: 500 },
      { title: 'Шоу', quantity: 1, unitPrice: 2500 },
    ] },
    appliedAt: new Date('2026-09-05T10:00:00Z'), appliedByStaffId: 'staff1',
  })
  assert.equal(result.contractAmount, 12000)
  assert.deepEqual(result.orderItems.map(({ title, total }) => ({ title, total })), [
    { title: 'Анимация', total: 9500 }, { title: 'Шоу', total: 2500 },
  ])
  assert.equal(result.agreedProposal.version, 2)
  assert.equal(result.agreedProposal.discount, 500)
  assert.match(result.agreedProposal.snapshotHash, /^[a-f0-9]{64}$/)
  assert.equal(Object.hasOwn(result, 'transactions'), false)
})

test('proposal item values are bounded and totals are recalculated on the server', () => {
  const result = buildPartyProposalApplication({ proposal: { total: -5, items: [
    { title: '  Герой  ', quantity: 0, unitPrice: 100, discount: 999, total: 99999 },
    { title: '   ', unitPrice: 10 },
  ] } })
  assert.equal(result.contractAmount, 0)
  assert.equal(result.orderItems.length, 1)
  assert.equal(result.orderItems[0].total, 0)
})

test('apply endpoint is tenant-scoped, accepted-only and changes no payment operations', async () => {
  const source = await readFile(new URL('../app/api/party/proposals/[id]/apply-to-order/route.js', import.meta.url), 'utf8')
  assert.match(source, /_id: id, tenantId: context\.tenantId/)
  assert.match(source, /proposal\.status !== 'accepted'/)
  assert.match(source, /getPartyOrderWriteGuard\(current\)/)
  assert.match(source, /'clientPayment\.totalAmount': application\.contractAmount/)
  assert.doesNotMatch(source, /getPartyTransactionModel|transactions:\s*application|\$push:\s*\{\s*transactions/)
  assert.match(source, /String\(current\.agreedProposal\?\.proposalId \|\| ''\) === String\(proposal\._id\)/)
})

test('order modal applies only commercial fields and preserves the unsaved brief', async () => {
  const source = await readFile(
    new URL(
      '../components/party/modals/OrderModal.js',
      import.meta.url
    ),
    'utf8'
  )

  assert.doesNotMatch(source, /\{ \.\.\.current, \.\.\.updatedOrder \}/)
  assert.match(source, /\.\.\.current,\s*orderItems: updatedOrder\.orderItems/)
  assert.match(source, /clientPayment:\s*\{\s*\.\.\.\(current\.clientPayment/)
})
