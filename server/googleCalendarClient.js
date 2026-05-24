import fs from 'fs'
import path from 'path'
import { google } from 'googleapis'

const READONLY_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly'
const DEFAULT_SCOPES = [READONLY_SCOPE]
const DEFAULT_CREDENTIALS_PATH =
  process.env.GOOGLE_CALENDAR_CREDENTIALS_PATH ??
  path.join(process.cwd(), 'google_calendar_token.json')
const DEFAULT_FETCH_START = '2000-01-01T00:00:00.000Z'

const toIsoString = (value) => {
  if (!value) return undefined
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString()
}

export const getCalendarClient = async (scopes = DEFAULT_SCOPES) => {
  const keyFile = scopes && scopes.length > 0 ? DEFAULT_CREDENTIALS_PATH : undefined
  if (!keyFile || !fs.existsSync(keyFile)) return null

  const auth = new google.auth.GoogleAuth({
    keyFile,
    scopes,
  })

  const authClient = await auth.getClient()

  return google.calendar({
    version: 'v3',
    auth: authClient,
  })
}

export const listCalendarEvents = async (
  calendar,
  {
    calendarId,
    timeMin,
    timeMax,
    syncToken,
    pageSize = 2500,
  }
) => {
  if (!calendarId) throw new Error('Не указан идентификатор календаря')

  const items = []
  let pageToken
  let nextSyncToken = null
  let effectiveSyncToken = syncToken
  let fallbackTimeMin = syncToken ? undefined : timeMin ?? DEFAULT_FETCH_START

  while (true) {
    try {
      const useSyncToken = Boolean(effectiveSyncToken)
      const resolvedTimeMin = useSyncToken
        ? undefined
        : toIsoString(fallbackTimeMin ?? timeMin ?? DEFAULT_FETCH_START)
      const resolvedTimeMax = useSyncToken ? undefined : toIsoString(timeMax)
      const response = await calendar.events.list({
        calendarId,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: pageSize,
        pageToken,
        syncToken: useSyncToken ? effectiveSyncToken : undefined,
        timeMin: resolvedTimeMin,
        timeMax: resolvedTimeMax,
      })

      if (Array.isArray(response.data.items)) items.push(...response.data.items)
      nextSyncToken = response.data.nextSyncToken ?? nextSyncToken
      pageToken = response.data.nextPageToken

      if (!pageToken) break
    } catch (error) {
      if (error?.code === 410 && effectiveSyncToken) {
        effectiveSyncToken = undefined
        fallbackTimeMin = fallbackTimeMin ?? timeMin ?? DEFAULT_FETCH_START
        pageToken = undefined
        continue
      }
      throw error
    }
  }

  return { items, nextSyncToken, usedSyncToken: Boolean(effectiveSyncToken) }
}
