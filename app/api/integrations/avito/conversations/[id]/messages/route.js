import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import AvitoConversations from '@models/AvitoConversations'
import AvitoMessages from '@models/AvitoMessages'
import SiteSettings from '@models/SiteSettings'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import {
  normalizeAvitoSettings,
  requestAvitoAccessToken,
  sendAvitoMessage,
} from '@server/avito'

const isObjectId = (value) =>
  Boolean(value && mongoose.Types.ObjectId.isValid(String(value)))

const jsonError = (message, status = 400, code = 'avito_error') =>
  NextResponse.json(
    { success: false, error: { code, type: 'avito', message } },
    { status }
  )

export const GET = async (req, { params }) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  const routeParams = await params
  const id = String(routeParams?.id || '').trim()
  if (!isObjectId(id)) return jsonError('Некорректный ID переписки', 400, 'bad_id')

  await dbConnect()
  const conversation = await AvitoConversations.findOne({
    _id: id,
    tenantId,
  }).lean()
  if (!conversation) return jsonError('Переписка не найдена', 404, 'not_found')

  const messages = await AvitoMessages.find({
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
  const conversation = await AvitoConversations.findOne({
    _id: id,
    tenantId,
  })
  if (!conversation) return jsonError('Переписка не найдена', 404, 'not_found')

  const siteSettings = await SiteSettings.findOne({ tenantId }).lean()
  const avito = normalizeAvitoSettings(siteSettings?.custom)
  if (!avito.enabled || !avito.clientId || !avito.clientSecret) {
    return jsonError('Avito не подключен', 403, 'not_connected')
  }
  if (!avito.userId) {
    return jsonError('Укажите Avito User ID в настройках интеграции', 400, 'missing_user_id')
  }

  let sendResult = null
  try {
    const tokenPayload = await requestAvitoAccessToken({
      clientId: avito.clientId,
      clientSecret: avito.clientSecret,
    })
    sendResult = await sendAvitoMessage({
      accessToken: tokenPayload.access_token,
      userId: avito.userId,
      chatId: conversation.avitoChatId,
      text,
    })
  } catch (error) {
    return jsonError('Не удалось получить доступ Avito', 400, 'auth_error')
  }

  const now = new Date()
  const message = await AvitoMessages.create({
    tenantId,
    conversationId: conversation._id,
    clientId: conversation.clientId ?? null,
    eventId: conversation.eventId ?? null,
    avitoChatId: conversation.avitoChatId,
    avitoMessageId:
      sendResult?.payload?.id || sendResult?.payload?.message_id || '',
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
          type: 'avito',
          message: sendResult?.error || 'Avito не принял сообщение',
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
