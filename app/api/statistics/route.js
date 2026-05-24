import { NextResponse } from 'next/server'
import Clients from '@models/Clients'
import Events from '@models/Events'
import Services from '@models/Services'
import Transactions from '@models/Transactions'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'

const EVENT_STATUSES = new Set([
  'all',
  'draft',
  'active',
  'finished',
  'closed',
  'canceled',
])

const parseYear = (value) => {
  const year = Number(value)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return null
  return year
}

const isValidDate = (value) => {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

const getEventComputedStatus = (event) => {
  if (!event) return 'active'
  if (event.status === 'draft') return 'draft'
  if (event.status === 'canceled') return 'canceled'
  if (event.status === 'closed') return 'closed'

  const dateRaw = event.dateEnd ?? event.eventDate
  if (!isValidDate(dateRaw)) return event.status || 'active'

  return new Date(dateRaw).getTime() < Date.now() ? 'finished' : 'active'
}

const buildEventQuery = ({ tenantId, year, town }) => {
  const conditions = [{ tenantId }]
  if (year) {
    conditions.push({
      eventDate: {
        $gte: new Date(year, 0, 1),
        $lt: new Date(year + 1, 0, 1),
      },
    })
  }
  if (town) conditions.push({ 'address.town': town })
  return conditions.length === 1 ? conditions[0] : { $and: conditions }
}

export const GET = async (req) => {
  try {
    const { tenantId, user } = await getTenantContext()
    if (!tenantId || !user?._id) {
      return NextResponse.json(
        { success: false, error: 'Не авторизован' },
        { status: 401 }
      )
    }

    const access = await getUserTariffAccess(user._id)
    if (!access?.allowStatistics) {
      return NextResponse.json(
        { success: false, error: 'Статистика недоступна на текущем тарифе' },
        { status: 403 }
      )
    }

    await dbConnect()

    const { searchParams } = new URL(req.url)
    const year = parseYear(searchParams.get('year'))
    const town = (searchParams.get('town') || '').trim()
    const statusRaw = searchParams.get('status') || 'all'
    const status = EVENT_STATUSES.has(statusRaw) ? statusRaw : 'all'

    const [eventsSource, clients, services] = await Promise.all([
      Events.find(buildEventQuery({ tenantId, year, town }))
        .sort({ eventDate: -1, createdAt: -1 })
        .lean(),
      Clients.find({ tenantId }).sort({ firstName: 1 }).lean(),
      Services.find({ tenantId }).sort({ title: 1 }).lean(),
    ])

    const events =
      status === 'all'
        ? eventsSource
        : eventsSource.filter((event) => getEventComputedStatus(event) === status)

    const eventIds = events.map((event) => String(event._id)).filter(Boolean)
    const transactions =
      eventIds.length > 0
        ? await Transactions.find({ tenantId, eventId: { $in: eventIds } })
            .sort({ date: -1, createdAt: -1 })
            .lean()
        : []

    return NextResponse.json(
      {
        success: true,
        data: {
          events,
          clients,
          services,
          transactions,
          filters: { year, town, status },
        },
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'private, max-age=30, stale-while-revalidate=120',
        },
      }
    )
  } catch (error) {
    console.log('Statistics GET error', error)
    return NextResponse.json(
      { success: false, error: 'Не удалось загрузить статистику' },
      { status: 500 }
    )
  }
}
