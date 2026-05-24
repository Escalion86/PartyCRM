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
 * GET /api/v1/event?id={event_id}
 * Resolve an event by ID for deep link navigation.
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
      { success: false, error: 'Некорректный ID мероприятия' },
      { status: 400 }
    )
  }

  await dbConnect()

  const event = await Events.findOne({ _id: id, tenantId }).lean()
  if (!event) {
    return NextResponse.json(
      { success: false, error: 'Мероприятие не найдено' },
      { status: 404 }
    )
  }

  // Determine which page this event belongs to
  const now = new Date()
  const completionTime = event.dateEnd || event.eventDate
  const isUpcoming = !completionTime || new Date(completionTime).getTime() >= now.getTime()

  return NextResponse.json(
    {
      success: true,
      data: {
        _id: String(event._id),
        status: event.status,
        eventType: event.eventType || null,
        eventDate: event.eventDate || null,
        dateEnd: event.dateEnd || null,
        page: isUpcoming ? 'eventsUpcoming' : 'eventsPast',
        isUpcoming,
      },
    },
    { status: 200 }
  )
}
