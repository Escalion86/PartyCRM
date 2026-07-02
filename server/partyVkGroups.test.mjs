import assert from 'node:assert/strict'
import test from 'node:test'

import {
  findVkGroupByWebhookToken,
  getVkGroupReplyCredentials,
  normalizePartyVkGroups,
  updateVkGroupInIntegrations,
} from './partyVkGroups.js'

test('normalizePartyVkGroups migrates legacy VK settings into named group', () => {
  const groups = normalizePartyVkGroups({
    vkGroupEnabled: true,
    vkGroupName: 'Основная группа',
    vkGroupId: '123',
    vkGroupAccessToken: 'token-1',
    vkGroupConfirmationCode: 'confirm-1',
    vkGroupWebhookToken: 'webhook-1',
    vkGroupWebhookSecret: 'secret-1',
    vkGroupWebhookUrl: 'https://partycrm.ru/api/party/integrations/vk/webhook/webhook-1',
    vkGroupStatus: 'connected',
    vkGroupLastError: '',
    vkGroupConnectedAt: '2026-07-01T10:00:00.000Z',
    vkGroupLastCheckedAt: '2026-07-01T10:10:00.000Z',
    vkGroupLastWebhookAt: '2026-07-01T10:20:00.000Z',
    vkGroupLastPeerId: '321',
  })

  assert.deepEqual(groups, [
    {
      id: 'webhook-1',
      name: 'Основная группа',
      enabled: true,
      groupId: '123',
      accessToken: 'token-1',
      confirmationCode: 'confirm-1',
      webhookToken: 'webhook-1',
      webhookSecret: 'secret-1',
      webhookUrl:
        'https://partycrm.ru/api/party/integrations/vk/webhook/webhook-1',
      status: 'connected',
      lastError: '',
      connectedAt: '2026-07-01T10:00:00.000Z',
      lastCheckedAt: '2026-07-01T10:10:00.000Z',
      lastWebhookAt: '2026-07-01T10:20:00.000Z',
      lastPeerId: '321',
    },
  ])
})

test('findVkGroupByWebhookToken returns matching configured group', () => {
  const group = findVkGroupByWebhookToken(
    {
      vkGroups: [
        { name: 'Первый VK', webhookToken: 'one', groupId: '1' },
        { name: 'Второй VK', webhookToken: 'two', groupId: '2' },
      ],
    },
    'two'
  )

  assert.equal(group.name, 'Второй VK')
  assert.equal(group.groupId, '2')
})

test('updateVkGroupInIntegrations writes vkGroups and removes legacy VK keys', () => {
  const next = updateVkGroupInIntegrations(
    {
      avitoEnabled: true,
      vkGroupEnabled: true,
      vkGroupId: 'legacy',
      vkGroupAccessToken: 'legacy-token',
      vkGroups: [{ webhookToken: 'one', groupId: '1', name: 'VK 1' }],
    },
    'one',
    { status: 'connected', lastPeerId: '500' }
  )

  assert.equal(next.avitoEnabled, true)
  assert.equal(next.vkGroupId, undefined)
  assert.equal(next.vkGroupAccessToken, undefined)
  assert.deepEqual(next.vkGroups, [
    {
      id: 'one',
      name: 'VK 1',
      enabled: false,
      groupId: '1',
      accessToken: '',
      confirmationCode: '',
      webhookToken: 'one',
      webhookSecret: '',
      webhookUrl: '',
      status: 'connected',
      lastError: '',
      connectedAt: '',
      lastCheckedAt: '',
      lastWebhookAt: '',
      lastPeerId: '500',
    },
  ])
})

test('getVkGroupReplyCredentials selects token by conversation group id', () => {
  const credentials = getVkGroupReplyCredentials({
    integrations: {
      vkGroups: [
        {
          enabled: true,
          groupId: '111',
          accessToken: 'token-111',
          status: 'connected',
        },
        {
          enabled: true,
          groupId: '222',
          accessToken: 'token-222',
          status: 'connected',
        },
      ],
    },
    conversation: { vkGroupId: '222' },
  })

  assert.deepEqual(credentials, {
    ok: true,
    accessToken: 'token-222',
    group: {
      id: '',
      name: 'VK 222',
      enabled: true,
      groupId: '222',
      accessToken: 'token-222',
      confirmationCode: '',
      webhookToken: '',
      webhookSecret: '',
      webhookUrl: '',
      status: 'connected',
      lastError: '',
      connectedAt: '',
      lastCheckedAt: '',
      lastWebhookAt: '',
      lastPeerId: '',
    },
  })
})
