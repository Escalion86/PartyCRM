import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildPartyAvitoWebhookUrl,
  buildPartyNovofonWebhookUrl,
  buildPartyVkWebhookUrl,
  isPartyVkWebhookSecretValid,
  normalizePartyAvitoWebhookLead,
  normalizePartyVkWebhookLead,
} from './partyIntegrationWebhooks.js'

test('buildParty webhook urls use PartyCRM integration routes', () => {
  assert.equal(
    buildPartyAvitoWebhookUrl({
      origin: 'https://partycrm.ru/',
      token: 'avito_token',
    }),
    'https://partycrm.ru/api/party/integrations/avito/webhook/avito_token'
  )
  assert.equal(
    buildPartyVkWebhookUrl({ origin: 'https://partycrm.ru', token: 'vk_token' }),
    'https://partycrm.ru/api/party/integrations/vk/webhook/vk_token'
  )
  assert.equal(
    buildPartyNovofonWebhookUrl({
      origin: 'https://partycrm.ru',
      token: 'novofon_token',
    }),
    'https://partycrm.ru/api/party/integrations/novofon/webhook/novofon_token'
  )
})

test('normalizePartyAvitoWebhookLead maps nested messenger payload', () => {
  const normalized = normalizePartyAvitoWebhookLead({
    payload: {
      value: {
        chat: { id: 'chat-1' },
        message: { text: 'Здравствуйте, нужен праздник' },
        author: { name: 'Анна' },
        item: { title: 'Аниматор' },
      },
    },
    phone: '+7 (999) 123-45-67',
  })

  assert.equal(normalized.clientName, 'Анна')
  assert.equal(normalized.phone, '79991234567')
  assert.equal(normalized.source, 'Avito')
  assert.equal(normalized.serviceTitle, 'Аниматор')
  assert.equal(normalized.leadExternalId, 'chat-1')
})

test('normalizePartyVkWebhookLead maps message_new payload safely', () => {
  const normalized = normalizePartyVkWebhookLead({
    type: 'message_new',
    object: {
      message: {
        from_id: 123,
        peer_id: 123,
        text: 'Можно забронировать зал?',
      },
    },
  })

  assert.equal(normalized.clientName, 'Клиент VK 123')
  assert.equal(normalized.comment, 'Можно забронировать зал?')
  assert.equal(normalized.source, 'VK')
  assert.equal(normalized.leadExternalId, '123')
})

test('isPartyVkWebhookSecretValid accepts empty configured secret and validates non-empty one', () => {
  assert.equal(isPartyVkWebhookSecretValid({ expectedSecret: '', body: {} }), true)
  assert.equal(
    isPartyVkWebhookSecretValid({
      expectedSecret: 'secret',
      body: { secret: 'secret' },
    }),
    true
  )
  assert.equal(
    isPartyVkWebhookSecretValid({
      expectedSecret: 'secret',
      body: { secret: 'wrong' },
    }),
    false
  )
})
