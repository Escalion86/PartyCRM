import { NextResponse } from 'next/server'
import Events from '@models/Events'
import dbConnect from '@server/dbConnect'
import { updateEventInCalendar } from '@server/CRUD'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'

const checkAccess = async () => {
  const { tenantId, user } = await getTenantContext()
  if (!tenantId || !user?._id) {
    return { errorResponse: NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    ) }
  }

  const access = await getUserTariffAccess(user._id)
  if (!access?.allowCalendarSync) {
    return { errorResponse: NextResponse.json(
      { success: false, error: 'Синхронизация с календарем недоступна' },
      { status: 403 }
    ) }
  }
  return { tenantId, user, errorResponse: null }
}

export const GET = async () => {
  const { tenantId, errorResponse } = await checkAccess()
  if (errorResponse) return errorResponse

  await dbConnect()
  const events = await Events.find(
    {
      tenantId,
      calendarImportChecked: true,
    },
    { _id: 1, eventType: 1, status: 1, eventDate: 1 }
  )
    .sort({ eventDate: 1, createdAt: 1 })
    .lean()

  return NextResponse.json(
    {
      success: true,
      data: {
        total: events.length,
        events: events.map((event) => ({
          _id: event._id,
          title: event?.eventType || 'Мероприятие',
          status: event?.status || 'active',
        })),
      },
    },
    { status: 200 }
  )
}

export const POST = async (req) => {
  const { tenantId, user, errorResponse } = await checkAccess()
  if (errorResponse) return errorResponse

  const body = await req.json().catch(() => ({}))
  const eventId = String(body?.eventId ?? '').trim()
  if (!eventId) {
    return NextResponse.json(
      { success: false, error: 'Не указан eventId' },
      { status: 400 }
    )
  }

  await dbConnect()
  const event = await Events.findOne({
    _id: eventId,
    tenantId,
    calendarImportChecked: true,
  })
  if (!event) {
    return NextResponse.json(
      { success: false, error: 'Мероприятие не найдено или не проверено' },
      { status: 404 }
    )
  }

  try {
    await updateEventInCalendar(event, req, user)
    await Events.findByIdAndUpdate(event._id, {
      calendarSyncError: '',
    })
    return NextResponse.json(
      { success: true, data: { eventId: event._id } },
      { status: 200 }
    )
  } catch (error) {
    await Events.findByIdAndUpdate(event._id, {
      calendarSyncError: 'calendar_sync_failed',
    })
    console.log('Google Calendar checked sync error', {
      eventId: event?._id,
      error,
    })
    return NextResponse.json(
      { success: false, error: 'Ошибка синхронизации мероприятия' },
      { status: 500 }
    )
  }
}
