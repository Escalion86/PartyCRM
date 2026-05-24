import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import VkConversations from '@models/VkConversations'
import VkMessages from '@models/VkMessages'
import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import { normalizeVkSettings, sendVkMessage } from '@server/vkGroup'

const isObjectId = (value) =>
  Boolean(value && mongoose.Types.ObjectId.isValid(String(value)))

const jsonError = (message, status = 400, code = 'vk_error') =>
  NextResponse.json(
    { success: false, error: { code, type: 'vk_group', message } },
    { status }
  )

export const GET = async (req, { params }) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  const routeParams = await params
  const id = String(routeParams?.id || '').trim()
  if (!isObjectId(id)) return jsonError('Некорректный ID переписки', 400, 'bad_id')

  await dbConnect()
  const conversation = await VkConversations.findOne({
    _id: id,
    tenantId,
  }).lean()
  if (!conversation) return jsonError('Переписка не найдена', 404, 'not_found')

  const messages = await VkMessages.find({
    tenantId,
    conversationId: id,
  })
    .sort({ sentAt: 1, createdAt: 1 })
    .limit(300)
    .lean()

  return NextResponse.json(
    { success: true, data: { conversation, messages } },
    { status: 200 }
  )
}

export const POST = async (req, { params }) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  const routeParams = await params
  const id = String(routeParams?.id || '').trim()
  if (!isObjectId(id)) return jsonError('Некорректный ID переписки', 400, 'bad_id')

  const body = await req.json().catch(() => ({}))
  const text = String(body?.text || '').trim().slice(0, 4000)
  if (!text) return jsonError('Введите текст сообщения', 400, 'empty_text')

  await dbConnect()
  const conversation = await VkConversations.findOne({
    _id: id,
    tenantId,
  })
  if (!conversation) return jsonError('Переписка не найдена', 404, 'not_found')

  const siteSettings = await SiteSettings.findOne({ tenantId }).lean()
  const vkGroup = normalizeVkSettings(siteSettings?.custom)
  if (!vkGroup.enabled || !vkGroup.accessToken) {
    return jsonError('VK-группа не подключена', 403, 'not_connected')
  }

  const sendResult = await sendVkMessage({
    accessToken: vkGroup.accessToken,
    peerId: conversation.vkPeerId,
    text,
  })

  const now = new Date()
  const message = await VkMessages.create({
    tenantId,
    conversationId: conversation._id,
    clientId: conversation.clientId ?? null,
    eventId: conversation.eventId ?? null,
    vkPeerId: conversation.vkPeerId,
    vkMessageId: sendResult?.payload ? String(sendResult.payload) : '',
    vkUserId: conversation.vkUserId || '',
    direction: 'outgoing',
    text,
    sentAt: now,
    status: sendResult?.ok ? 'sent' : 'failed',
    raw: sendResult?.payload ?? null,
  })

  conversation.lastMessageText = text
  conversation.lastMessageAt = now
  await conversation.save()

  if (!sendResult?.ok) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'send_failed',
          type: 'vk_group',
          message: sendResult?.error || 'VK не принял сообщение',
        },
        data: { message },
      },
      { status: 400 }
    )
  }

  return NextResponse.json(
    { success: true, data: { message } },
    { status: 201 }
  )
}
