import { NextResponse } from 'next/server'
import Events from '@models/Events'
import Histories from '@models/Histories'
import dbConnect from '@server/dbConnect'
import { updateEventInCalendar } from '@server/CRUD'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { notifyTaskCreated } from '@server/taskPushNotifications'
import compareObjectsWithDif from '@helpers/compareObjectsWithDif'
import {
  hasDocuments,
  normalizeAdditionalEvents,
  normalizeDepositExpectedAmount,
  normalizeEventType,
  normalizeWaitDeposit,
  parseDateValue,
} from '@server/eventApiNormalization'

const getStatusValue = (payload) => {
  const status = payload?.status
  return typeof status === 'string' ? status : ''
}


const parsePositiveInt = (value, fallback) => {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.floor(n)
}

const parseBooleanParam = (value) => {
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  return null
}

const buildPastCompletionQuery = (cutoffDate) => ({
  $or: [
    { dateEnd: { $lt: cutoffDate } },
    {
      $and: [
        { $or: [{ dateEnd: null }, { dateEnd: { $exists: false } }] },
        { eventDate: { $lt: cutoffDate } },
      ],
    },
  ],
})

const buildUpcomingCompletionQuery = (nowDate) => ({
  $or: [
    { dateEnd: { $gte: nowDate } },
    {
      $and: [
        { $or: [{ dateEnd: null }, { dateEnd: { $exists: false } }] },
        { eventDate: { $gte: nowDate } },
      ],
    },
    {
      $and: [
        { $or: [{ dateEnd: null }, { dateEnd: { $exists: false } }] },
        { $or: [{ eventDate: null }, { eventDate: { $exists: false } }] },
      ],
    },
  ],
})

const getPastAdditionalEventsMatch = (segment, now) => {
  if (!segment) return null

  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const startOfTomorrow = new Date(startOfToday)
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  const startOfDayAfterTomorrow = new Date(startOfTomorrow)
  startOfDayAfterTomorrow.setDate(startOfDayAfterTomorrow.getDate() + 1)

  if (segment === 'overdue') {
    return {
      done: { $ne: true },
      date: { $lt: now },
    }
  }
  if (segment === 'today') {
    return {
      done: { $ne: true },
      date: { $gte: startOfToday, $lt: startOfTomorrow },
    }
  }
  if (segment === 'tomorrow') {
    return {
      done: { $ne: true },
      date: { $gte: startOfTomorrow, $lt: startOfDayAfterTomorrow },
    }
  }
  return null
}

export const GET = async (req) => {
  try {
    const { tenantId } = await getTenantContext()
    if (!tenantId) {
      return NextResponse.json(
        { success: false, error: 'Не авторизован' },
        { status: 401 }
      )
    }
    await dbConnect()
    const { searchParams } = new URL(req.url)
    const scope = searchParams.get('scope') || 'all'
    const before = searchParams.get('before')
    const limit = parsePositiveInt(searchParams.get('limit'), 120)
    const countOnly = searchParams.get('countOnly') === '1'
    const clientId = (searchParams.get('clientId') || '').trim()

    if (clientId) {
      const events = await Events.find({ tenantId, clientId })
        .sort({ eventDate: -1, createdAt: -1 })
        .lean()
      return NextResponse.json(
        {
          success: true,
          data: events,
          meta: {
            hasMore: false,
            nextBefore: null,
            limit: 0,
            scope: 'client',
            totalCount: events.length,
          },
        },
        { status: 200 }
      )
    }

    if (scope === 'past') {
      const now = new Date()
      let beforeCutoff = now
      if (before) {
        const beforeDate = new Date(before)
        if (
          !Number.isNaN(beforeDate.getTime()) &&
          beforeDate.getTime() < now.getTime()
        ) {
          beforeCutoff = beforeDate
        }
      }

      const baseConditions = [{ tenantId }, buildPastCompletionQuery(now)]
      const town = (searchParams.get('town') || '').trim()
      if (town) baseConditions.push({ 'address.town': town })

      const calendarChecked = parseBooleanParam(
        searchParams.get('calendarChecked')
      )
      if (calendarChecked !== null) {
        baseConditions.push({ calendarImportChecked: calendarChecked })
      }

      const statusFinished = parseBooleanParam(
        searchParams.get('statusFinished')
      )
      const statusClosed = parseBooleanParam(searchParams.get('statusClosed'))
      const statusCanceled = parseBooleanParam(searchParams.get('statusCanceled'))

      if (
        statusFinished !== null ||
        statusClosed !== null ||
        statusCanceled !== null
      ) {
        const statusConditions = []
        if (statusClosed === true) statusConditions.push({ status: 'closed' })
        if (statusCanceled === true) statusConditions.push({ status: 'canceled' })
        if (statusFinished === true) {
          statusConditions.push({
            $or: [
              { status: { $exists: false } },
              { status: null },
              { status: { $nin: ['draft', 'closed', 'canceled'] } },
            ],
          })
        }

        if (statusConditions.length === 0) {
          return NextResponse.json(
            {
              success: true,
              data: [],
              meta: {
                hasMore: false,
                nextBefore: null,
                limit,
                scope: 'past',
                totalCount: 0,
              },
            },
            { status: 200 }
          )
        }

        baseConditions.push({ $or: statusConditions })
      }

      const additionalQuick = searchParams.get('additionalQuick')
      const additionalEventsMatch = getPastAdditionalEventsMatch(
        additionalQuick,
        new Date()
      )
      if (additionalEventsMatch) {
        baseConditions.push({
          additionalEvents: { $elemMatch: additionalEventsMatch },
        })
      }

      const baseQuery = { $and: baseConditions }

      if (countOnly) {
        const totalCount = await Events.countDocuments(baseQuery)
        return NextResponse.json(
          {
            success: true,
            data: [],
            meta: {
              hasMore: false,
              nextBefore: null,
              limit: 0,
              scope: 'past',
              totalCount,
            },
          },
          { status: 200 }
        )
      }

      const query = {
        $and: [...baseConditions, buildPastCompletionQuery(beforeCutoff)],
      }

      const [totalCount, rows] = await Promise.all([
        Events.countDocuments(baseQuery),
        Events.find(query)
          .sort({ dateEnd: -1, eventDate: -1, createdAt: -1 })
          .limit(limit + 1)
          .lean(),
      ])
      const hasMore = rows.length > limit
      const items = hasMore ? rows.slice(0, limit) : rows
      const lastItem = items[items.length - 1]

      return NextResponse.json(
        {
          success: true,
          data: items,
          meta: {
            hasMore,
            nextBefore: lastItem?.dateEnd || lastItem?.eventDate
              ? new Date(lastItem.dateEnd ?? lastItem.eventDate).toISOString()
              : null,
            limit,
            scope: 'past',
            totalCount,
          },
        },
        { status: 200 }
      )
    }

    if (scope === 'upcoming') {
      const now = new Date()
      const query = {
        tenantId,
        ...buildUpcomingCompletionQuery(now),
      }
      const events = await Events.find(query)
        .sort({ eventDate: -1, createdAt: -1 })
        .lean()

      return NextResponse.json(
        {
          success: true,
          data: events,
          meta: {
            hasMore: false,
            nextBefore: null,
            limit: 0,
            scope: 'upcoming',
            totalCount: events.length,
          },
        },
        { status: 200 }
      )
    }

    const events = await Events.find({ tenantId })
      .sort({ eventDate: -1, createdAt: -1 })
      .lean()
    return NextResponse.json({ success: true, data: events }, { status: 200 })
  } catch (error) {
    console.log('Events GET error', error)
    return NextResponse.json(
      { success: false, error: 'Не удалось загрузить мероприятия' },
      { status: 500 }
    )
  }
}

export const POST = async (req) => {
  const body = await req.json()
  const { tenantId, user } = await getTenantContext()
  if (!tenantId || !user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  const access = await getUserTariffAccess(user._id)
  if (!access?.trialActive && !access?.hasTariff) {
    return NextResponse.json(
      { success: false, error: 'Не выбран тариф' },
      { status: 403 }
    )
  }
  const statusValue = getStatusValue(body)
  const eventTypeValue = normalizeEventType(body?.eventType)
  if (statusValue === 'draft' && hasDocuments(body)) {
    return NextResponse.json(
      { success: false, error: 'Документы недоступны для заявки' },
      { status: 400 }
    )
  }
  if (!eventTypeValue) {
    return NextResponse.json(
      { success: false, error: 'Поле "Что за событие" обязательно' },
      { status: 400 }
    )
  }
  if (!access?.allowDocuments && hasDocuments(body)) {
    return NextResponse.json(
      { success: false, error: 'Доступ к документам недоступен' },
      { status: 403 }
    )
  }
  const eventDate = parseDateValue(body.eventDate)
  const dateEnd = parseDateValue(body.dateEnd)
  if (eventDate && dateEnd && eventDate.getTime() > dateEnd.getTime()) {
    return NextResponse.json(
      {
        success: false,
        error: 'Дата начала не может быть позже даты завершения',
      },
      { status: 400 }
    )
  }
  await dbConnect()
  if (Number.isFinite(access?.eventsPerMonth) && access.eventsPerMonth > 0) {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    const count = await Events.countDocuments({
      tenantId,
      createdAt: { $gte: start, $lt: end },
    })
    if (count >= access.eventsPerMonth) {
      return NextResponse.json(
        { success: false, error: 'Достигнут лимит мероприятий' },
        { status: 403 }
      )
    }
  }
  const event = await Events.create({
    ...body,
    tenantId,
    requestCreatedAt: body.requestCreatedAt
      ? new Date(body.requestCreatedAt)
      : new Date(),
    additionalEvents: normalizeAdditionalEvents(body.additionalEvents),
    eventType: eventTypeValue,
    waitDeposit: normalizeWaitDeposit(body.waitDeposit),
    depositDueAt: parseDateValue(body.depositDueAt),
    depositExpectedAmount: normalizeDepositExpectedAmount(
      body.depositExpectedAmount
    ),
    calendarSyncError: access?.allowCalendarSync ? '' : 'calendar_sync_unavailable',
  })
  await Histories.create({
    schema: Events.collection.collectionName,
    action: 'add',
    data: [event.toJSON()],
    userId: String(user._id),
  })
  let responseEvent = event
  if (!event?.importedFromCalendar && access?.allowCalendarSync) {
    try {
      await updateEventInCalendar(event, req, user)
      const refreshed = await Events.findById(event._id).lean()
      if (refreshed) responseEvent = refreshed
    } catch (error) {
      console.log('Google Calendar create error', error)
      await Events.findByIdAndUpdate(event._id, {
        calendarSyncError: 'calendar_sync_failed',
      })
      responseEvent = await Events.findById(event._id).lean()
    }
  } else if (!event?.importedFromCalendar && !access?.allowCalendarSync) {
    responseEvent = await Events.findById(event._id).lean()
  }

  // Send push notifications for new tasks (additionalEvents)
  if (responseEvent?.additionalEvents && responseEvent.additionalEvents.length > 0) {
    for (const task of responseEvent.additionalEvents) {
      if (task && !task.done) {
        notifyTaskCreated({
          tenantId,
          event: responseEvent,
          task,
        }).catch((err) => console.log('Push notification error (task created)', err))
      }
    }
  }

  return NextResponse.json({ success: true, data: responseEvent }, { status: 201 })
}
