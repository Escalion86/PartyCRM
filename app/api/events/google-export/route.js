import { NextResponse } from 'next/server'
import { listCalendarEvents } from '@server/googleCalendarClient'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  getUserCalendarClient,
  getUserCalendarId,
  normalizeCalendarSettings,
} from '@server/googleUserCalendarClient'

const DEFAULT_TIME_MIN = '2000-01-01T00:00:00.000Z'

const buildExportBlock = (calendarEvent) => {
  const lines = [
    calendarEvent?.summary ?? '',
    calendarEvent?.description ?? '',
    calendarEvent?.location ?? '',
  ]

  if (!calendarEvent?.description) return ''

  if (lines.every((value) => !value)) return ''

  return lines.join('\n')
}

export const POST = async (req) => {
  const body = await req.json().catch(() => ({}))
  const { tenantId, user } = await getTenantContext()
  if (!tenantId || !user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }
  const access = await getUserTariffAccess(user._id)
  if (!access?.allowCalendarSync) {
    return NextResponse.json(
      { success: false, error: 'Синхронизация с календарем недоступна' },
      { status: 403 }
    )
  }
  const settings = normalizeCalendarSettings(user)
  if (!settings.enabled || !settings.refreshToken) {
    return NextResponse.json(
      { success: false, error: 'Google Calendar не подключен' },
      { status: 400 }
    )
  }
  const calendar = getUserCalendarClient(user)
  if (!calendar) {
    return NextResponse.json(
      { success: false, error: 'Не удалось подключиться к Google Calendar' },
      { status: 500 }
    )
  }
  const calendarId = getUserCalendarId(user)

  const timeMin = body.timeMin ?? DEFAULT_TIME_MIN
  const timeMax = body.timeMax ?? undefined

  let googleEvents
  try {
    googleEvents = await listCalendarEvents(calendar, {
      calendarId,
      timeMin,
      timeMax,
    })
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: `Не удалось загрузить события Google Calendar: ${error?.message ?? error}`,
      },
      { status: 502 }
    )
  }

  const items = Array.isArray(googleEvents.items) ? googleEvents.items : []
  const blocks = []
  let skipped = 0

  for (const item of items) {
    const summary = item?.summary ?? ''
    const block = buildExportBlock(item)
    if (block) blocks.push(block)
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        count: blocks.length,
        skipped,
        text: blocks.join('\n---\n'),
      },
    },
    { status: 200 }
  )
}
