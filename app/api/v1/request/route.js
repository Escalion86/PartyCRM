import { NextResponse } from 'next/server'
import mongoose from 'mongoose'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'

const MONGODB_OID_RE = /^[0-9a-fA-F]{24}$/

const isValidId = (value) => {
  if (!value || typeof value !== 'string') return false
  return MONGODB_OID_RE.test(value.trim())
}

/**
 * GET /api/v1/request?id={request_id}
 * Resolve a request (draft event) by ID for deep link navigation.
 * Returns minimal data needed for card navigation.
 */
export const GET = async (req) => {
  const { tenantId, user } = await getTenantContext()
  if (!tenantId || !user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (!id || !isValidId(id)) {
    return NextResponse.json(
      { success: false, error: 'Некорректный ID заявки' },
      { status: 400 }
    )
  }

  await dbConnect()

  // Requests are stored as events with status=draft
  const event = await Events.findOne({
    _id: id,
    tenantId,
    status: 'draft',
  }).lean()

  if (!event) {
    return NextResponse.json(
      { success: false, error: 'Заявка не найдена' },
      { status: 404 }
    )
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        _id: String(event._id),
        status: event.status,
        eventType: event.eventType || null,
        eventDate: event.eventDate || null,
        requestCreatedAt: event.requestCreatedAt || event.createdAt || null,
        page: 'eventsUpcoming',
        isUpcoming: true,
      },
    },
    { status: 200 }
  )
}
