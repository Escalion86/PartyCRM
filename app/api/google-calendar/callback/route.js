import { NextResponse } from 'next/server'

import Users from '@models/Users'
import dbConnect from '@server/dbConnect'
import getTenantContext from '@server/getTenantContext'
import {
  getOAuthClient,
  normalizeCalendarReminders,
  normalizeCalendarStatusColors,
} from '@server/googleUserCalendarClient'

export const runtime = 'nodejs'

const decodeState = (value) => {
  if (!value) return null
  try {
    const raw = Buffer.from(value, 'base64url').toString('utf8')
    return JSON.parse(raw)
  } catch (error) {
    return null
  }
}

const normalizeBaseUrl = (value) => {
  if (!value) return null
  const trimmed = String(value).trim().replace(/\/+$/, '')
  if (!trimmed) return null
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed
  }
  return `https://${trimmed}`
}

export const GET = async (req) => {
  const { user } = await getTenantContext()
  if (!user?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const oauth = getOAuthClient()
  if (!oauth) {
    return NextResponse.json(
      { success: false, error: 'Google OAuth не настроен' },
      { status: 500 }
    )
  }

  const { searchParams } = req.nextUrl
  const code = searchParams.get('code')
  const state = searchParams.get('state')
  const cookieState = req.cookies.get('gc_oauth_state')?.value

  if (!code) {
    return NextResponse.json(
      { success: false, error: 'Отсутствует код авторизации' },
      { status: 400 }
    )
  }

  const decodedState = decodeState(state)
  const redirect = decodedState?.redirect || '/cabinet/profile'
  const baseUrl = normalizeBaseUrl(process.env.DOMAIN) || req.nextUrl.origin
  if (!decodedState?.nonce || decodedState.nonce !== cookieState) {
    const response = NextResponse.redirect(
      new URL(`${redirect}?gc_error=state`, baseUrl)
    )
    response.cookies.delete('gc_oauth_state')
    return response
  }

  const { tokens } = await oauth.getToken(code)
  await dbConnect()
  const existing = await Users.findById(user._id)
  if (!existing) {
    return NextResponse.json(
      { success: false, error: 'Пользователь не найден' },
      { status: 404 }
    )
  }

  const prev = existing.googleCalendar ?? {}
  const refreshToken = tokens.refresh_token || prev.refreshToken || ''
  const accessToken = tokens.access_token || prev.accessToken || ''
  const tokenExpiry =
    tokens.expiry_date ? new Date(tokens.expiry_date) : prev.tokenExpiry || null
  const reminders = normalizeCalendarReminders(prev.reminders)
  const statusColors = normalizeCalendarStatusColors(prev.statusColors)
  const deleteCanceledFromCalendar = prev?.deleteCanceledFromCalendar === true

  existing.googleCalendar = {
    enabled: true,
    calendarId: prev.calendarId || 'primary',
    refreshToken,
    accessToken,
    tokenExpiry,
    scope: tokens.scope || prev.scope || '',
    syncToken: '',
    connectedAt: new Date(),
    email: prev.email || '',
    reminders,
    statusColors,
    deleteCanceledFromCalendar,
  }

  await existing.save()

  const redirectUrl = new URL(redirect, baseUrl)
  redirectUrl.searchParams.set('gc_connected', '1')
  const response = NextResponse.redirect(redirectUrl)
  response.cookies.delete('gc_oauth_state')
  return response
}
