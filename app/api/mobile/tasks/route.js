import { NextResponse } from 'next/server'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import { getMobileUser } from '@server/mobile/auth'

const startOfDay = (d) => {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

const endOfDay = (d) => {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

/**
 * GET /api/mobile/tasks
 * Returns contact tasks grouped by overdue / today / tomorrow.
 * Tasks are derived from additionalEvents across all events.
 */
export const GET = async (req) => {
  try {
    const { user, error, status } = await getMobileUser(req)
    if (error) {
      return NextResponse.json({ success: false, error }, { status })
    }

    await dbConnect()

    const now = new Date()
    const todayStart = startOfDay(now)
    const todayEnd = endOfDay(now)
    const tomorrowStart = startOfDay(new Date(now.getTime() + 86400000))
    const tomorrowEnd = endOfDay(new Date(now.getTime() + 86400000))

    // Fetch all events with additionalEvents that are not done
    const events = await Events.find({
      tenantId: user.tenantId,
      additionalEvents: { $exists: true, $ne: [] },
    })
      .select('title clientName clientPhone additionalEvents eventType eventDate venue')
      .lean()

    const overdue = []
    const today = []
    const tomorrow = []

    for (const event of events) {
      for (const ae of (event.additionalEvents || [])) {
        if (ae.done) continue
        if (!ae.date) continue

        const aeDate = new Date(ae.date)
        if (isNaN(aeDate.getTime())) continue

        const task = {
          _id: ae._id ? String(ae._id) : undefined,
          eventId: String(event._id),
          eventTitle: event.title ?? '',
          clientName: event.clientName ?? '',
          clientPhone: event.clientPhone ?? '',
          title: ae.title ?? '',
          description: ae.description ?? '',
          date: ae.date,
          eventType: event.eventType ?? '',
          venue: event.venue ?? '',
        }

        if (aeDate < todayStart) {
          overdue.push(task)
        } else if (aeDate >= todayStart && aeDate <= todayEnd) {
          today.push(task)
        } else if (aeDate >= tomorrowStart && aeDate <= tomorrowEnd) {
          tomorrow.push(task)
        }
      }
    }

    // Sort each group by date
    const sortByDate = (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    overdue.sort(sortByDate)
    today.sort(sortByDate)
    tomorrow.sort(sortByDate)

    return NextResponse.json({
      success: true,
      data: {
        overdue,
        today,
        tomorrow,
        counts: {
          overdue: overdue.length,
          today: today.length,
          tomorrow: tomorrow.length,
          total: overdue.length + today.length + tomorrow.length,
        },
      },
    })
  } catch (error) {
    console.error('Mobile tasks error:', error)
    return NextResponse.json(
      { success: false, error: 'Ошибка сервера' },
      { status: 500 }
    )
  }
}
