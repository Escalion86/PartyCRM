import { NextResponse } from 'next/server'

import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import { listUserCalendars, normalizeCalendarSettings } from '@server/googleUserCalendarClient'

export const runtime = 'nodejs'

export const GET = async () => {
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

  const settings = normalizeCalendarSettings(user)
  if (!settings.refreshToken) {
    return NextResponse.json(
      { success: false, error: 'Google Calendar не подключен' },
      { status: 400 }
    )
  }

  const calendars = await listUserCalendars(user)

  return NextResponse.json(
    {
      success: true,
      data: {
        calendars,
        selectedId: settings.calendarId || 'primary',
      },
    },
    { status: 200 }
  )
}
