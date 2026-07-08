import test from 'node:test'
import assert from 'node:assert/strict'

import {
  filterCompanySettingsPatchByTariffAccess,
  mergeCompanySettingsPatch,
  normalizeCompanyProfile,
  normalizeCompanySettings,
} from './companySettings.js'

test('normalizeCompanySettings deduplicates towns', () => {
  const settings = normalizeCompanySettings({ towns: ['Москва', ' Москва ', ''] })
  assert.deepEqual(settings.towns, ['Москва'])
})

test('normalizeCompanySettings deduplicates event types', () => {
  const settings = normalizeCompanySettings({
    eventTypes: ['День рождения', ' День рождения ', 'Свадьба'],
  })

  assert.deepEqual(settings.eventTypes, ['День рождения', 'Свадьба'])
})

test('normalizeCompanySettings deduplicates operational dictionaries', () => {
  const settings = normalizeCompanySettings({
    orderTypes: ['День рождения', ' день рождения ', 'Выпускной'],
    serviceTypes: ['Аниматоры', ' Аниматоры ', 'Шоу'],
    preparationStatuses: ['Купить реквизит', 'Купить реквизит', 'Позвонить'],
    leadSources: ['Tilda', ' tilda ', 'VK'],
    paymentMethods: ['Наличные', 'СБП', 'СБП'],
    expenseCategories: ['Дорога', 'Материалы', 'Дорога'],
  })

  assert.deepEqual(settings.orderTypes, ['Выпускной', 'День рождения'])
  assert.deepEqual(settings.serviceTypes, ['Аниматоры', 'Шоу'])
  assert.deepEqual(settings.preparationStatuses, ['Купить реквизит', 'Позвонить'])
  assert.deepEqual(settings.leadSources, ['Tilda', 'VK'])
  assert.deepEqual(settings.paymentMethods, ['Наличные', 'СБП'])
  assert.deepEqual(settings.expenseCategories, ['Дорога', 'Материалы'])
})

test('mergeCompanySettingsPatch keeps previous notifications object', () => {
  const next = mergeCompanySettingsPatch(
    { notifications: { pushEnabled: true } },
    { timeZone: 'Europe/Moscow' }
  )

  assert.equal(next.timeZone, 'Europe/Moscow')
  assert.equal(next.notifications.pushEnabled, true)
})

test('normalizeCompanySettings clamps additional event reminder days before', () => {
  assert.equal(
    normalizeCompanySettings({
      notifications: { additionalEventsReminderDaysBefore: '7' },
    }).notifications.additionalEventsReminderDaysBefore,
    7
  )
  assert.equal(
    normalizeCompanySettings({
      notifications: { additionalEventsReminderDaysBefore: '-2' },
    }).notifications.additionalEventsReminderDaysBefore,
    0
  )
  assert.equal(
    normalizeCompanySettings({
      notifications: { additionalEventsReminderDaysBefore: '45' },
    }).notifications.additionalEventsReminderDaysBefore,
    30
  )
})

test('filterCompanySettingsPatchByTariffAccess removes gated settings', () => {
  assert.deepEqual(
    filterCompanySettingsPatchByTariffAccess(
      {
        documents: { requisites: { artistInn: '123' } },
        integrations: {
          novofonEnabled: true,
          aitunnelKey: 'secret',
          avitoEnabled: true,
        },
      },
      {
        allowDocuments: false,
        allowTelephony: false,
        allowAi: false,
      }
    ),
    {
      integrations: {
        avitoEnabled: true,
      },
    }
  )
})

test('normalizeCompanySettings keeps order number format trimmed', () => {
  const settings = normalizeCompanySettings({
    orderNumberFormat: '  PARTY-{YYYY}-{SEQ}  ',
  })

  assert.equal(settings.orderNumberFormat, 'PARTY-{YYYY}-{SEQ}')
})

test('normalizeCompanyProfile trims public company fields', () => {
  const profile = normalizeCompanyProfile({
    title: '  Праздник 24  ',
    legalTitle: '  ИП Иванов  ',
    phone: ' +7 999 111-22-33 ',
    email: ' INFO@PARTY.TEST ',
  })

  assert.deepEqual(profile, {
    title: 'Праздник 24',
    legalTitle: 'ИП Иванов',
    phone: '+7 999 111-22-33',
    email: 'info@party.test',
  })
})

test('normalizeCompanySettings maps legacy artist requisites to provider fields', () => {
  const settings = normalizeCompanySettings({
    documents: {
      requisites: {
        artistStatus: 'self_employed',
        artistFullName: ' Иванов Иван Иванович ',
        artistName: ' Иванов И.И. ',
        artistInn: ' 123456789012 ',
        providerInn: ' 987654321098 ',
      },
    },
  })

  assert.equal(settings.documents.requisites.providerStatus, 'self_employed')
  assert.equal(
    settings.documents.requisites.providerFullName,
    'Иванов Иван Иванович'
  )
  assert.equal(settings.documents.requisites.providerDisplayName, 'Иванов И.И.')
  assert.equal(settings.documents.requisites.providerInn, '987654321098')
})

test('normalizeCompanySettings normalizes public lead api keys', () => {
  const settings = normalizeCompanySettings({
    publicLeadEnabled: true,
    publicLeadApiKeys: [
      { id: ' one ', name: ' Site ', key: ' secret ', enabled: true },
      { id: 'empty', name: 'Empty', key: '' },
    ],
  })

  assert.equal(settings.publicLeadEnabled, true)
  assert.deepEqual(settings.publicLeadApiKeys, [
    { id: 'one', name: 'Site', key: 'secret', enabled: true },
  ])
})

test('normalizeCompanySettings normalizes public lead routing rules', () => {
  const settings = normalizeCompanySettings({
    publicLeadRoutingRules: [
      {
        id: ' tilda-center ',
        source: ' Tilda ',
        matchLocationTitle: ' Центр ',
        matchServiceTitle: ' День рождения ',
        locationId: ' location-1 ',
        serviceId: ' service-1 ',
        enabled: true,
      },
      {
        id: 'disabled',
        source: 'Site',
        locationId: 'location-2',
        enabled: false,
      },
      {
        id: 'empty',
        source: '',
        locationId: '',
        serviceId: '',
      },
    ],
  })

  assert.deepEqual(settings.publicLeadRoutingRules, [
    {
      id: 'tilda-center',
      source: 'Tilda',
      matchLocationTitle: 'Центр',
      matchServiceTitle: 'День рождения',
      locationId: 'location-1',
      serviceId: 'service-1',
      enabled: true,
    },
    {
      id: 'disabled',
      source: 'Site',
      matchLocationTitle: '',
      matchServiceTitle: '',
      locationId: 'location-2',
      serviceId: '',
      enabled: false,
    },
  ])
})
