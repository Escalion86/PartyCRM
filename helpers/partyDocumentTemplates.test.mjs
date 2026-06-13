import test from 'node:test'
import assert from 'node:assert/strict'

import partyGenerateActTemplate, {
  getPartyActTemplateVariablesMap,
} from './partyGenerateActTemplate.js'
import partyGenerateContractTemplate, {
  getPartyContractTemplateVariablesMap,
} from './partyGenerateContractTemplate.js'

const order = {
  _id: '665544332211',
  eventDate: '2026-06-20T15:30:00.000Z',
  contractAmount: 45000,
  placeType: 'client_address',
  clientAddress: {
    town: 'Красноярск',
    street: 'Ленина',
    house: '10',
  },
  assignedStaff: [{ name: 'Петров Петр' }],
}

const client = {
  firstName: 'Анна',
  secondName: 'Смирнова',
  legalName: 'ООО "Праздник"',
  phone: '79990001122',
  inn: '2460000000',
}

const companyRequisites = {
  providerStatus: 'individual_entrepreneur',
  providerFullName: 'Иванов Иван Иванович',
  providerDisplayName: 'ИП Иванов И.И.',
  providerInn: '246100000000',
  providerOgrnip: '326246800000000',
  defaultTown: 'Красноярск',
}

test('party contract fills company, client, order and service variables', () => {
  const variables = getPartyContractTemplateVariablesMap({
    order,
    client,
    serviceTitles: ['Аниматор', 'Шоу мыльных пузырей'],
    companyRequisites,
    docMeta: {
      documentNumber: '42',
      contractDate: '2026-06-13',
    },
  })

  assert.equal(variables['НОМЕР ДОКУМЕНТА'], '42')
  assert.equal(variables['ДАТА ДОГОВОРА'], '13.06.2026')
  assert.equal(variables['НАИМЕНОВАНИЕ КОМПАНИИ'], 'ИП Иванов И.И.')
  assert.equal(variables['НАИМЕНОВАНИЕ КЛИЕНТА'], 'ООО "Праздник"')
  assert.equal(variables['СПИСОК УСЛУГ'], 'Аниматор, Шоу мыльных пузырей')
  assert.match(variables['АДРЕС СОБЫТИЯ'], /Красноярск/)
  assert.match(variables['ДОГОВОРНАЯ СУММА'], /45/)
  assert.equal(variables.ИСПОЛНИТЕЛИ, 'Петров Петр')
})

test('party contract keeps unknown custom template variables unchanged', () => {
  const result = partyGenerateContractTemplate({
    order,
    client,
    serviceTitles: ['Аниматор'],
    companyRequisites,
    template: '{НАИМЕНОВАНИЕ_КОМПАНИИ} / {НЕИЗВЕСТНОЕ_ПОЛЕ}',
  })

  assert.equal(result, 'ИП Иванов И.И. / {НЕИЗВЕСТНОЕ_ПОЛЕ}')
})

test('party act fills order and document variables', () => {
  const variables = getPartyActTemplateVariablesMap({
    order,
    client,
    serviceTitles: ['Аниматор'],
    companyRequisites,
    docMeta: {
      documentNumber: '7',
      actDate: '2026-06-21',
      contractDate: '2026-06-13',
    },
  })

  assert.equal(variables['НОМЕР ДОКУМЕНТА'], '7')
  assert.equal(variables['ДАТА АКТА'], '21.06.2026')
  assert.equal(variables['ДАТА ДОГОВОРА'], '13.06.2026')
  assert.equal(variables['ИСПОЛНИТЕЛЬ ПОДПИСАНТ'], 'ИП Иванов И.И.')
  assert.equal(variables['СПИСОК УСЛУГ'], 'Аниматор')
  assert.match(variables['АДРЕС СОБЫТИЯ'], /Ленина/)
})

test('party act renders the built-in PartyCRM template without unresolved known tags', () => {
  const result = partyGenerateActTemplate({
    order,
    client,
    serviceTitles: ['Аниматор'],
    companyRequisites,
    docMeta: {
      documentNumber: '7',
      actDate: '2026-06-21',
      contractDate: '2026-06-13',
    },
  })

  assert.doesNotMatch(result, /\{[^{}]+\}/)
  assert.match(result, /ИП Иванов И\.И\./)
  assert.match(result, /ООО "Праздник"/)
})
