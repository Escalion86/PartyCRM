import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import {
  normalizePartyOrderAgreedProposal,
  normalizePartyOrderCommercialRevision,
  normalizePartyOrderEventBrief,
  normalizePartyOrderItems,
} from './partyOrderBrief.js'

test('normalizePartyOrderEventBrief normalizes the complete event brief', () => {
  const brief = normalizePartyOrderEventBrief({
    occasion: '  День рождения  ',
    celebrantName: '  Маша ',
    celebrantAge: '7',
    guestCount: '14',
    guestAgeRange: ' 5–9 лет ',
    interests: '  Единороги ',
    previousPrograms: ' Квест ',
    characters: ' Фея и дракон ',
    costumeOptions: ' Розовый костюм феи ',
    eventFormat: ' Анимационная программа ',
    venueConditions: ' Мало места ',
    cakeAndGifts: ' Торт после программы, подарки у родителей ',
    wishes: ' Спокойный темп ',
    restrictions: ' Аллергия на латекс ',
  })

  assert.equal(brief.occasion, 'День рождения')
  assert.equal(brief.celebrantName, 'Маша')
  assert.equal(brief.celebrantAge, 7)
  assert.equal(brief.guestCount, 14)
  assert.equal(brief.guestAgeRange, '5–9 лет')
  assert.equal(brief.characters, 'Фея и дракон')
  assert.equal(brief.restrictions, 'Аллергия на латекс')
})

test('normalizePartyOrderEventBrief bounds numeric values and text length', () => {
  const brief = normalizePartyOrderEventBrief({
    celebrantAge: 999,
    guestCount: -5,
    occasion: ` ${'а'.repeat(250)} `,
  })

  assert.equal(brief.celebrantAge, 120)
  assert.equal(brief.guestCount, 0)
  assert.equal(brief.occasion.length, 180)
})

test('normalizePartyOrderItems recalculates totals and drops invalid rows', () => {
  const serviceId = '507f1f77bcf86cd799439011'
  const items = normalizePartyOrderItems([
    {
      serviceId,
      title: '  Анимационная программа ',
      quantity: '2.5',
      unit: ' час ',
      durationMinutes: '90',
      unitPrice: '1500.555',
      discount: '200',
      total: 999999,
    },
    { title: '   ', unitPrice: 500 },
  ])

  assert.deepEqual(items, [
    {
      serviceId,
      title: 'Анимационная программа',
      description: '',
      quantity: 2.5,
      unit: 'час',
      durationMinutes: 90,
      unitPrice: 1500.56,
      discount: 200,
      total: 3551.4,
    },
  ])
})

test('normalizePartyOrderItems limits discount to the line subtotal', () => {
  const [item] = normalizePartyOrderItems([
    { title: 'Шоу', quantity: 2, unitPrice: 1000, discount: 5000 },
  ])

  assert.equal(item.discount, 2000)
  assert.equal(item.total, 0)
})

test('order item quantity keeps the full range accepted by proposal items', () => {
  const [item] = normalizePartyOrderItems([
    { title: 'Расходный материал', quantity: 50000, unitPrice: 1 },
  ])

  assert.equal(item.quantity, 50000)
  assert.equal(item.total, 50000)
})

test('normalizePartyOrderAgreedProposal keeps only bounded snapshot metadata', () => {
  const proposalId = '507f1f77bcf86cd799439012'
  const staffId = '507f1f77bcf86cd799439013'
  const agreed = normalizePartyOrderAgreedProposal({
    proposalId,
    number: ' КП-42 ',
    version: '3',
    subtotal: '12500',
    discount: '500',
    total: '12000',
    appliedAt: '2026-09-05T10:00:00.000Z',
    appliedByStaffId: staffId,
    snapshotHash: ` ${'f'.repeat(200)} `,
  })

  assert.equal(agreed.proposalId, proposalId)
  assert.equal(agreed.number, 'КП-42')
  assert.equal(agreed.version, 3)
  assert.equal(agreed.subtotal, 12500)
  assert.equal(agreed.discount, 500)
  assert.equal(agreed.total, 12000)
  assert.equal(agreed.appliedAt.toISOString(), '2026-09-05T10:00:00.000Z')
  assert.equal(agreed.appliedByStaffId, staffId)
  assert.equal(agreed.snapshotHash.length, 128)
})

test('brief and commercial normalizers accept absent legacy values', () => {
  const empty = normalizePartyOrderEventBrief(null)

  assert.deepEqual(normalizePartyOrderEventBrief('legacy text'), empty)
  assert.equal(empty.celebrantAge, null)
  assert.equal(empty.costumeOptions, '')
  assert.equal(normalizePartyOrderCommercialRevision(undefined), 0)
  assert.equal(normalizePartyOrderCommercialRevision(-2), 0)
})

test('generic order endpoints keep accepted proposal metadata server-owned', async () => {
  const [createSource, updateSource] = await Promise.all([
    readFile(
      new URL('../app/api/party/orders/route.js', import.meta.url),
      'utf8'
    ),
    readFile(
      new URL('../app/api/party/orders/[id]/route.js', import.meta.url),
      'utf8'
    ),
  ])

  assert.match(createSource, /agreedProposal: \{\},\s*commercialRevision: 0/)
  assert.match(updateSource, /agreedProposal: currentOrder\.agreedProposal/)
  assert.match(updateSource, /commercialRevision: currentOrder\.commercialRevision/)
  assert.match(updateSource, /partycrm_order_revision_conflict/)
  assert.match(updateSource, /payload\.agreedProposal = \{\}/)
  assert.match(
    updateSource,
    /\{ _id: id, tenantId: context\.tenantId, \.\.\.revisionFilter \}/
  )
})
