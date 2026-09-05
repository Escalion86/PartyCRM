import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildPartyProposalRecipientSnapshot,
  buildPartyProposalSenderSnapshot,
  calculatePartyProposalItem,
  calculatePartyProposalTotals,
  formatPartyProposalAddress,
  normalizePartyProposalPayload,
} from './partyProposalCore.js'
import {
  getPartyProposalTemplateVariablesMap,
  partyProposalAmountToWords,
} from './partyProposalDocuments.js'

test('proposal totals include quantities, row discounts and proposal discount', () => {
  const result = calculatePartyProposalTotals(
    [
      { title: 'Квест', quantity: 2, unitPrice: 15000, discount: 1000 },
      { title: 'Фотограф', quantity: 1, unitPrice: 10000 },
    ],
    2000
  )

  assert.equal(result.items[0].total, 29000)
  assert.equal(result.subtotal, 39000)
  assert.equal(result.discount, 2000)
  assert.equal(result.total, 37000)
})

test('proposal item normalization prevents negative money and empty units', () => {
  const item = calculatePartyProposalItem({
    title: '  Ведущий  ',
    quantity: 0,
    unit: '',
    unitPrice: -100,
  })

  assert.equal(item.title, 'Ведущий')
  assert.equal(item.quantity, 1)
  assert.equal(item.unit, 'услуга')
  assert.equal(item.total, 0)
})

test('proposal payload keeps an immutable normalized snapshot shape', () => {
  const result = normalizePartyProposalPayload({
    number: ' КП-7 ',
    recipientSnapshot: { displayName: ' ООО Ромашка ' },
    eventSnapshot: { title: ' Выпускной ' },
    items: [{ title: 'Программа', quantity: 1, unitPrice: 25000 }],
  })

  assert.equal(result.number, 'КП-7')
  assert.equal(result.recipientSnapshot.displayName, 'ООО Ромашка')
  assert.equal(result.eventSnapshot.title, 'Выпускной')
  assert.equal(result.total, 25000)
})

test('proposal snapshots are built from company and client records', () => {
  const sender = buildPartyProposalSenderSnapshot({
    providerDisplayName: 'ИП Иванова И.И.',
    providerFullName: 'Иванова Ирина Ивановна',
    providerInn: '123',
  })
  const recipient = buildPartyProposalRecipientSnapshot({
    legalName: 'ООО Клиент',
    secondName: 'Петров',
    firstName: 'Петр',
  })

  assert.equal(sender.displayName, 'ИП Иванова И.И.')
  assert.equal(sender.inn, '123')
  assert.equal(recipient.displayName, 'ООО Клиент')
  assert.equal(recipient.fullName, 'Петров Петр')
})

test('proposal address supports company and client locations', () => {
  assert.equal(
    formatPartyProposalAddress(
      { placeType: 'company_location' },
      'Студия на Мира'
    ),
    'Студия на Мира'
  )
  assert.equal(
    formatPartyProposalAddress({
      placeType: 'client_address',
      clientAddress: { town: 'Красноярск', street: 'Мира', house: '10' },
    }),
    'Красноярск, Мира, д. 10'
  )
})

test('proposal document variables include amount in words and table marker', () => {
  const proposal = {
    number: '12',
    version: 2,
    total: 95000,
    items: [{ title: 'Квест', quantity: 1, unit: 'услуга', unitPrice: 95000, total: 95000 }],
  }
  const variables = getPartyProposalTemplateVariablesMap(proposal)

  assert.equal(partyProposalAmountToWords(95000), 'девяносто пять тысяч рублей')
  assert.equal(variables['НОМЕР КП'], '12')
  assert.match(variables['ТАБЛИЦА УСЛУГ'], /^\[\[PROPOSAL_ITEMS:/)
})
