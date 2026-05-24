import { NextResponse } from 'next/server'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import { getMobileUser } from '@server/mobile/auth'

/**
 * GET /api/mobile/events
 * Returns events for the authenticated mobile user.
 * Supports query params: scope (upcoming|all), status, from, to, limit, page
 */
export const GET = async (req) => {
  try {
    const { user, error, status } = await getMobileUser(req)
    if (error) {
      return NextResponse.json({ success: false, error }, { status })
    }

    const url = new URL(req.url)
    const scope = url.searchParams.get('scope')
    const statusFilter = url.searchParams.get('status')
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 200)
    const page = Math.max(parseInt(url.searchParams.get('page') || '1', 10), 1)

    await dbConnect()

    const query = { tenantId: user.tenantId }

    if (statusFilter) {
      query.status = statusFilter
    }

    // For upcoming scope, only return active events with future dates
    if (scope === 'upcoming') {
      query.status = 'active'
      query.eventDate = { $gte: new Date() }
    } else if (from || to) {
      query.eventDate = {}
      if (from) query.eventDate.$gte = new Date(from)
      if (to) query.eventDate.$lte = new Date(to)
    }

    const skip = (page - 1) * limit

    const [events, total] = await Promise.all([
      Events.find(query)
        .sort({ eventDate: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Events.countDocuments(query),
    ])

    return NextResponse.json({
      success: true,
      data: events.map((event) => ({
        _id: String(event._id),
        tenantId: String(event.tenantId),
        clientId: event.clientId ? String(event.clientId) : null,
        description: event.description ?? '',
        eventType: event.eventType ?? '',
        eventDate: event.eventDate ?? null,
        dateEnd: event.dateEnd ?? null,
        status: event.status ?? 'draft',
        additionalEvents: (event.additionalEvents || []).map((ae) => ({
          _id: ae._id ? String(ae._id) : undefined,
          title: ae.title ?? '',
          description: ae.description ?? '',
          date: ae.date ?? null,
          done: ae.done ?? false,
          doneAt: ae.doneAt ?? null,
          googleCalendarEventId: ae.googleCalendarEventId ?? '',
        })),
        address: event.address ?? undefined,
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    })
  } catch (error) {
    console.error('Mobile events error:', error)
    return NextResponse.json(
      { success: false, error: 'Ошибка сервера' },
      { status: 500 }
    )
  }
}
