import test from 'node:test'
import assert from 'node:assert/strict'

import {
  findSimilarPartyClients,
  normalizePartyClientDedupeInput,
} from './partyClientDedupe.js'

const tenantA = 'tenant-a'
const tenantB = 'tenant-b'

test('normalizePartyClientDedupeInput normalizes contacts for duplicate checks', () => {
  const normalized = normalizePartyClientDedupeInput({
    _id: 'ignored',
    phone: '+7 (999) 111-22-33',
    whatsapp: '8 999 111 22 33',
    viber: '',
    email: '  USER@Example.COM ',
    telegram: ' @Party_User ',
    vk: 'https://vk.com/club123',
    instagram: ' @insta.user ',
  })

  assert.equal(normalized.phone, '79991112233')
  assert.equal(normalized.whatsapp, '89991112233')
  assert.equal(normalized.viber, '')
  assert.equal(normalized.email, 'user@example.com')
  assert.equal(normalized.telegram, 'party_user')
  assert.equal(normalized.vk, 'club123')
  assert.equal(normalized.instagram, 'insta.user')
})

test('findSimilarPartyClients scores active same-tenant contact matches and ignores archived clients', () => {
  const candidates = findSimilarPartyClients({
    tenantId: tenantA,
    input: {
      phone: '+7 (999) 111-22-33',
      email: 'user@example.com',
      telegram: '@party_user',
    },
    clients: [
      {
        _id: 'phone-match',
        tenantId: tenantA,
        firstName: 'Телефон',
        phone: '79991112233',
        status: 'active',
      },
      {
        _id: 'email-match',
        tenantId: tenantA,
        firstName: 'Email',
        email: 'USER@example.com',
        status: 'active',
      },
      {
        _id: 'archived-match',
        tenantId: tenantA,
        firstName: 'Архив',
        phone: '79991112233',
        status: 'archived',
      },
      {
        _id: 'other-tenant-match',
        tenantId: tenantB,
        firstName: 'Чужая компания',
        phone: '79991112233',
        status: 'active',
      },
    ],
  })

  assert.deepEqual(
    candidates.map((item) => item.client._id),
    ['phone-match', 'email-match']
  )
  assert.deepEqual(candidates[0].reasons, ['phone'])
  assert.equal(candidates[0].score > candidates[1].score, true)
})

test('findSimilarPartyClients excludes current client while editing', () => {
  const candidates = findSimilarPartyClients({
    tenantId: tenantA,
    excludeClientId: 'current',
    input: { phone: '79991112233' },
    clients: [
      {
        _id: 'current',
        tenantId: tenantA,
        firstName: 'Текущий',
        phone: '79991112233',
        status: 'active',
      },
      {
        _id: 'duplicate',
        tenantId: tenantA,
        firstName: 'Дубль',
        whatsapp: '79991112233',
        status: 'active',
      },
    ],
  })

  assert.deepEqual(
    candidates.map((item) => item.client._id),
    ['duplicate']
  )
  assert.deepEqual(candidates[0].reasons, ['whatsapp'])
})
