import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import AvitoConversations from '@models/AvitoConversations'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

const isObjectId = (value) =>
  Boolean(value && mongoose.Types.ObjectId.isValid(String(value)))

const jsonError = (message, status = 400, code = 'avito_error') =>
  NextResponse.json(
    { success: false, error: { code, type: 'avito', message } },
    { status }
  )

export const PATCH = async (req, { params }) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) return jsonError('Не авторизован', 401, 'unauthorized')

  const routeParams = await params
  const id = String(routeParams?.id || '').trim()
  if (!isObjectId(id)) return jsonError('Некорректный ID переписки', 400, 'bad_id')

  const body = await req.json().catch(() => ({}))
  const update = {}
  if (body.clientId !== undefined) {
    update.clientId = isObjectId(body.clientId) ? body.clientId : null
  }
  if (body.eventId !== undefined) {
    update.eventId = isObjectId(body.eventId) ? body.eventId : null
  }
  if (body.status !== undefined) {
    const status = String(body.status || '').trim()
    if (['open', 'closed', 'ignored'].includes(status)) update.status = status
  }
  if (body.markRead === true) update.unreadCount = 0

  await dbConnect()
  const conversation = await AvitoConversations.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: update },
    { returnDocument: 'after' }
  ).lean()

  if (!conversation) return jsonError('Переписка не найдена', 404, 'not_found')

  return NextResponse.json(
    { success: true, data: conversation },
    { status: 200 }
  )
}
