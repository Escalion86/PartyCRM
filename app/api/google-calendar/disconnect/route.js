import { NextResponse } from 'next/server'

import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import { normalizeCalendarSettings } from '@server/googleUserCalendarClient'

export const runtime = 'nodejs'

export const POST = async () => {
  const { user } = await getTenantContext()
  if (!user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
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
  dbUser.googleCalendar = {
    ...settings,
    enabled: false,
    calendarId: '',
    refreshToken: '',
    accessToken: '',
    tokenExpiry: null,
    scope: '',
    syncToken: '',
    connectedAt: null,
    email: '',
  }
  await dbUser.save()

  return NextResponse.json({ success: true }, { status: 200 })
}
