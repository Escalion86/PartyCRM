import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import AvitoConversations from '@models/AvitoConversations'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

const isObjectId = (value) =>
  Boolean(value && mongoose.Types.ObjectId.isValid(String(value)))

export const GET = async (req) => {
  const { tenantId } = await getTenantContext()
  if (!tenantId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: 'unauthorized', type: 'auth', message: 'Не авторизован' },
      },
      { status: 401 }
    )
  }

  const { searchParams } = new URL(req.url)
  const clientId = String(searchParams.get('clientId') || '').trim()
  const eventId = String(searchParams.get('eventId') || '').trim()

  const query = { tenantId }
  if (isObjectId(clientId)) query.clientId = clientId
  if (isObjectId(eventId)) query.eventId = eventId

  await dbConnect()
  const conversations = await AvitoConversations.find(query)
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .limit(100)
    .lean()

  return NextResponse.json(
    { success: true, data: conversations },
    { status: 200 }
  )
}
