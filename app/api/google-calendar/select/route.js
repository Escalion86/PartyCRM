import { NextResponse } from 'next/server'

import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  listUserCalendars,
  normalizeCalendarSettings,
} from '@server/googleUserCalendarClient'

export const runtime = 'nodejs'

export const POST = async (req) => {
  const { user } = await getTenantContext()
  if (!user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const access = await getUserTariffAccess(user._id)
  if (!access?.allowCalendarSync) {
    return NextResponse.json(
      { success: false, error: 'Синхронизация недоступна по тарифу' },
      { status: 403 }
    )
  }

  const body = await req.json()
  const calendarId = String(body?.calendarId ?? '').trim()
  if (!calendarId) {
    return NextResponse.json(
      { success: false, error: 'Не указан календарь' },
      { status: 400 }
    )
  }

  await dbConnect()
  const dbUser = await Users.findById(user._id)
  if (!dbUser) {
    return NextResponse.json(
      { success: false, error: 'Пользователь не найден' },
      { status: 404 }
    )
  }

  const settings = normalizeCalendarSettings(dbUser)
  if (!settings.refreshToken) {
    return NextResponse.json(
      { success: false, error: 'Google Calendar не подключен' },
      { status: 400 }
    )
  }

  const calendars = await listUserCalendars(dbUser)
  const selectedCalendar = calendars.find((item) => item.id === calendarId)
  if (!selectedCalendar) {
    return NextResponse.json(
      { success: false, error: 'Календарь не найден' },
      { status: 404 }
    )
  }

  dbUser.googleCalendar = {
    ...settings,
    enabled: true,
    calendarId,
    calendarName: selectedCalendar.summary || '',
    syncToken: '',
  }
  await dbUser.save()

  return NextResponse.json(
    { success: true, data: { calendarId } },
    { status: 200 }
  )
}
