import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Clients from '@models/Clients'
import SiteSettings from '@models/SiteSettings'
import VkConversations from '@models/VkConversations'
import VkMessages from '@models/VkMessages'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import {
  getVkUserProfile,
  normalizeStoredVkContact,
  normalizeVkSettings,
} from '@server/vkGroup'
import getPersonFullName from '@helpers/getPersonFullName'

const isObjectId = (value) =>
  Boolean(value && mongoose.Types.ObjectId.isValid(String(value)))

const jsonError = (message, status = 400, code = 'vk_link_error') =>
  NextResponse.json(
    { success: false, error: { code, type: 'messenger', message } },
    { status }
  )

const normalizeVkInput = (value) => {
  const contact = normalizeStoredVkContact(value)
    .replace(/^club/i, '')
    .replace(/^public/i, '')
    .trim()
  if (!contact) return { contact: '', lookup: '', vkUserId: '' }

  const lookup = contact.replace(/^id/i, '').trim()
  const vkUserId = /^\d+$/.test(lookup) ? lookup : ''
  return { contact, lookup, vkUserId }
}

const normalizeClientConversation = (conversation) => ({
  _id: String(conversation._id),
  provider: 'vk',
  providerLabel: 'VK',
  clientId: conversation.clientId ? String(conversation.clientId) : '',
  linkedToCurrentClient: Boolean(conversation.clientId),
  title: conversation.clientName || 'Чат VK',
  subtitle: conversation.lastMessageText || conversation.vkPeerId || '',
  externalId: conversation.vkPeerId || '',
  lastMessageText: conversation.lastMessageText || '',
  lastMessageAt: conversation.lastMessageAt || null,
  unreadCount: conversation.unreadCount || 0,
})

export const POST = async (req, { params }) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  const routeParams = await params
  const clientId = String(routeParams?.id || '').trim()
  if (!isObjectId(clientId)) {
    return jsonError('Некорректный ID клиента', 400, 'bad_client_id')
  }

  const body = await req.json().catch(() => ({}))
  const value = String(body?.vk || body?.vkUserId || '').trim()
  const normalized = normalizeVkInput(value)
  if (!normalized.lookup) {
    return jsonError('Укажите VK ID, короткое имя или ссылку', 400, 'empty_vk')
  }

  await dbConnect()

  const [client, siteSettings] = await Promise.all([
    Clients.findOne({ _id: clientId, tenantId }),
    SiteSettings.findOne({ tenantId }).lean(),
  ])
  if (!client) return jsonError('Клиент не найден', 404, 'client_not_found')

  const vkGroup = normalizeVkSettings(siteSettings?.custom)
  if (!vkGroup.enabled || !vkGroup.accessToken) {
    return jsonError('VK-группа не подключена', 403, 'not_connected')
  }

  let vkUserId = normalized.vkUserId
  let profile = null
  if (!vkUserId) {
    profile = await getVkUserProfile({
      accessToken: vkGroup.accessToken,
      userId: normalized.lookup,
    })
    vkUserId = profile?.id || ''
  }
  if (!vkUserId) {
    return jsonError('Не удалось определить VK ID пользователя', 400, 'bad_vk')
  }

  if (!profile) {
    profile = await getVkUserProfile({
      accessToken: vkGroup.accessToken,
      userId: vkUserId,
    })
  }

  const vkContact = `id${vkUserId}`
  const clientName =
    getPersonFullName(client, { fallback: '' }) ||
    profile?.name ||
    `Клиент VK ${vkUserId}`

  const existing = await VkConversations.findOne({
    tenantId,
    $or: [{ vkUserId }, { vkPeerId: vkUserId }],
  }).sort({ lastMessageAt: -1, updatedAt: -1 })

  const existingClientId = existing?.clientId ? String(existing.clientId) : ''
  if (existingClientId && existingClientId !== clientId) {
    return jsonError(
      'VK-диалог уже привязан к другому клиенту',
      409,
      'linked_to_other_client'
    )
  }

  const conversation = await VkConversations.findOneAndUpdate(
    { tenantId, vkPeerId: existing?.vkPeerId || vkUserId },
    {
      $set: {
        tenantId,
        clientId,
        vkPeerId: existing?.vkPeerId || vkUserId,
        vkUserId,
        vkGroupId: vkGroup.groupId || existing?.vkGroupId || '',
        clientName,
        status: existing?.status || 'open',
      },
      $setOnInsert: {
        eventId: null,
        lastMessageText: '',
        lastMessageAt: null,
        unreadCount: 0,
        raw: null,
      },
    },
    { upsert: true, returnDocument: 'after' }
  )

  await Promise.all([
    VkMessages.updateMany(
      { tenantId, conversationId: conversation._id },
      { $set: { clientId } }
    ),
    Clients.updateOne(
      { _id: clientId, tenantId },
      {
        $set: {
          vk: vkContact,
          ...(client.preferredContactChannel
            ? {}
            : { preferredContactChannel: 'vk' }),
        },
      }
    ),
  ])

  return NextResponse.json(
    {
      success: true,
      data: { conversation: normalizeClientConversation(conversation) },
    },
    { status: 200 }
  )
}
