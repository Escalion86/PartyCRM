import { NextResponse } from 'next/server'
import Clients from '@models/Clients'
import Events from '@models/Events'
import Transactions from '@models/Transactions'
import SiteSettings from '@models/SiteSettings'
import Users from '@models/Users'
import { parseGoogleEvent } from '@helpers/googleCalendarParsers'
import dbConnect from '@server/dbConnect'
import { listCalendarEvents } from '@server/googleCalendarClient'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'
import {
  getUserCalendarClient,
  getUserCalendarId,
  normalizeCalendarSettings,
} from '@server/googleUserCalendarClient'

const DEFAULT_TIME_MIN = '2000-01-01T00:00:00.000Z'
const EMPTY_CLIENT_NAME = 'Клиент из Google Calendar'
const EMAIL_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/
const KNOWN_TOWNS = [
  'Красноярск',
  'Норильск',
  'Москва',
  'Дивногорск',
  'Сосновоборск',
  'Ульяновск',
  'Саранск',
  'Сочи',
  'Екатеринбург',
  'Канск',
  'Абакан',
  'Сорск',
  'Новосибирск',
]

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const normalizePhoneNumber = (phone) => {
  if (!phone) return null
  const digits = String(phone).replace(/[^\d]/g, '')
  if (!digits) return null
  const numeric = Number(digits)
  return Number.isNaN(numeric) ? null : numeric
}

const findExistingClient = async (
  tenantId,
  numericPhone,
  email,
  name
) => {
  const conditions = []
  if (numericPhone) conditions.push({ phone: numericPhone })
  if (email)
    conditions.push({
      email: new RegExp(`^${escapeRegExp(email)}$`, 'i'),
    })
  if (name)
    conditions.push({
      firstName: new RegExp(`^${escapeRegExp(name)}$`, 'i'),
    })

  if (!conditions.length) return null
  const filter = {
    tenantId,
    ...(conditions.length === 1 ? conditions[0] : { $or: conditions }),
  }
  return Clients.findOne(filter)
}

const ensureSiteSettings = async (tenantId) => {
  const current = await SiteSettings.findOne({ tenantId })
  if (current) return current
  return SiteSettings.create({ tenantId })
}

const ensureClientFromCalendar = async (
  tenantId,
  clientName,
  clientPhone,
  contactChannels,
  { allowNameOnly = false } = {}
) => {
  const numericPhone = normalizePhoneNumber(clientPhone)
  const primaryEmail = contactChannels.find((item) => EMAIL_REGEX.test(item ?? ''))
  const normalizedName = clientName?.trim() ?? ''
  const canUseName = allowNameOnly && normalizedName && normalizedName !== EMPTY_CLIENT_NAME

  const existingClient = await findExistingClient(
    tenantId,
    numericPhone,
    primaryEmail,
    canUseName ? normalizedName : null
  )
  if (existingClient) {
    const update = {}
    if (numericPhone && !existingClient.phone) update.phone = numericPhone
    if (primaryEmail && !existingClient.email) update.email = primaryEmail
    if (
      clientName &&
      existingClient.firstName === EMPTY_CLIENT_NAME &&
      clientName !== existingClient.firstName
    )
      update.firstName = clientName

    if (Object.keys(update).length) {
      existingClient.set(update)
      await existingClient.save()
    }

    return existingClient
  }

  if (!numericPhone && !primaryEmail && !canUseName) return null

  const createPayload = {
    firstName: normalizedName || EMPTY_CLIENT_NAME,
  }
  if (numericPhone) createPayload.phone = numericPhone
  if (primaryEmail) createPayload.email = primaryEmail

  return Clients.create({ ...createPayload, tenantId })
}

const formatCalendarDate = (date) => {
  if (!date) return null
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  const parsed = new Date(date)
  return Number.isNaN(parsed.getTime()) ? String(date) : parsed.toISOString()
}

const normalizeTown = (value) => {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.toLowerCase() === 'null' ? '' : trimmed
}

const isValidTown = (value) => /[A-Za-zА-Яа-я]/.test(value ?? '')
const isKnownTown = (value) =>
  KNOWN_TOWNS.some((town) => town.toLowerCase() === value.toLowerCase())

const detectTownFromText = (text) => {
  if (!text) return ''
  const normalized = String(text).toLowerCase()
  return (
    KNOWN_TOWNS.find((town) =>
      normalized.includes(town.toLowerCase())
    ) ?? ''
  )
}

const buildDescriptionFromCalendar = (parsedEvent) =>
  parsedEvent?.description?.trim() ?? ''

const hasAddressValues = (address) =>
  address &&
  Object.values(address).some(
    (value) => typeof value === 'string' && value.trim().length > 0
  )

const buildEventUpdate = (
  parsedEvent,
  googleEventId,
  clientId,
  calendarEvent,
  tenantId,
  calendarId,
  storeCalendarResponse
) => {
  const setPayload = {
    tenantId,
    googleCalendarId: googleEventId,
    googleCalendarCalendarId: calendarId,
    description: buildDescriptionFromCalendar(parsedEvent, calendarEvent),
    status: parsedEvent.status,
    importedFromCalendar: true,
    calendarImportChecked: false,
  }
  if (storeCalendarResponse) setPayload.googleCalendarResponse = calendarEvent

  if (hasAddressValues(parsedEvent.address))
    setPayload.address = parsedEvent.address

  if (parsedEvent.dateEnd) setPayload.dateEnd = parsedEvent.dateEnd
  if (parsedEvent.eventDate) setPayload.eventDate = parsedEvent.eventDate
  if (parsedEvent.contractSum !== null && parsedEvent.contractSum !== undefined)
    setPayload.contractSum = parsedEvent.contractSum
  if (parsedEvent.clientData && Object.keys(parsedEvent.clientData).length > 0)
    setPayload.clientData = parsedEvent.clientData
  if (parsedEvent.isTransferred) setPayload.isTransferred = true
  if (clientId) setPayload.clientId = clientId

  return {
    $set: setPayload,
    $unset: {
      title: '',
    },
  }
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
  const forceFullSync = Boolean(body.forceFullSync)
  const storeCalendarResponse = Boolean(body.storeCalendarResponse)

  await dbConnect()
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
  let createdThisMonth = 0
  const accessLimit =
    Number.isFinite(access?.eventsPerMonth) && access.eventsPerMonth > 0
      ? access.eventsPerMonth
      : null
  if (accessLimit) {
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 1)
    createdThisMonth = await Events.countDocuments({
      tenantId,
      createdAt: { $gte: start, $lt: end },
    })
    if (createdThisMonth >= accessLimit) {
      return NextResponse.json(
        { success: false, error: 'Достигнут лимит мероприятий' },
        { status: 403 }
      )
    }
  }

  const siteSettings = await ensureSiteSettings(tenantId)
  const storedSyncToken = settings.syncToken || null
  const settingsTowns = Array.isArray(siteSettings?.towns) ? siteSettings.towns : []
  const townsToAdd = new Set()
  const defaultTown = normalizeTown(siteSettings?.defaultTown ?? '')
  const syncToken = forceFullSync ? null : body.syncToken ?? storedSyncToken ?? null
  const timeMin = body.timeMin ?? (syncToken ? undefined : DEFAULT_TIME_MIN)
  const timeMax = body.timeMax ?? undefined

  let googleEvents
  try {
    googleEvents = await listCalendarEvents(calendar, {
      calendarId,
      syncToken,
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

  if (googleEvents.nextSyncToken) {
    await Users.findByIdAndUpdate(user._id, {
      'googleCalendar.syncToken': googleEvents.nextSyncToken,
    })
  }

  const results = []
  const skipped = []
  const calendarItems = Array.isArray(googleEvents.items) ? googleEvents.items : []

  for (const item of calendarItems) {
    const summary = item?.summary ?? ''
    if (/встреча/i.test(summary)) {
      skipped.push({
        googleId: item?.id ?? null,
        title: summary || 'Без названия',
        reason: 'Встреча в названии',
      })
      continue
    }
    if (/репетиция|доставка|форум|сделать акт/i.test(summary)) {
      skipped.push({
        googleId: item?.id ?? null,
        title: summary || 'Без названия',
        reason: 'Служебное событие в названии',
      })
      continue
    }

    if (accessLimit) {
      const existing = await Events.findOne({
        googleCalendarId: item.id,
        tenantId,
      })
        .select('_id')
        .lean()
      if (!existing && createdThisMonth >= accessLimit) {
        skipped.push({
          googleId: item?.id ?? null,
          title: item?.summary ?? 'Без названия',
          reason: 'Лимит мероприятий',
        })
        continue
      }
    }

    const parsed = parseGoogleEvent(item)
    const parsedTown = normalizeTown(parsed?.address?.town)
    const detectedTown =
      (isValidTown(parsedTown) && isKnownTown(parsedTown) ? parsedTown : '') ||
      detectTownFromText(
        [
          item?.location,
          item?.summary,
          item?.description,
          parsed?.description,
        ]
          .filter(Boolean)
          .join('\n')
      ) ||
      defaultTown

    if (detectedTown) {
      parsed.address = {
        ...(parsed.address ?? {}),
        town: detectedTown,
      }
      if (!settingsTowns.includes(detectedTown)) townsToAdd.add(detectedTown)
    }
    const allowNameOnly = Number(parsed.clientData?.deposit?.amount) > 0
    const client = await ensureClientFromCalendar(
      tenantId,
      parsed.clientName,
      parsed.clientPhone,
      parsed.contactChannels,
      { allowNameOnly }
    )

    const update = buildEventUpdate(
      parsed,
      item.id,
      client?._id,
      item,
      tenantId,
      calendarId,
      storeCalendarResponse
    )

    const dbResult = await Events.findOneAndUpdate(
      { googleCalendarId: item.id, tenantId },
      update,
      {
        returnDocument: 'after',
        upsert: true,
        setDefaultsOnInsert: true,
        rawResult: true,
      }
    )
    if (
      accessLimit &&
      dbResult?.lastErrorObject?.updatedExisting === false
    ) {
      createdThisMonth += 1
    }

    let eventId = dbResult.value?._id ?? null
    if (!eventId) {
      const freshEvent = await Events.findOne({
        googleCalendarId: item.id,
        tenantId,
      })
        .select('_id')
        .lean()
      eventId = freshEvent?._id ?? null
    }

    const depositAmount = parsed.clientData?.deposit?.amount
    const depositDate = parsed.clientData?.deposit?.date
    let depositTransaction = null
    if (Number(depositAmount) > 0) {
      depositTransaction = await ensureDepositTransaction({
        eventId,
        clientId: client?._id,
        amount: depositAmount,
        date: depositDate,
        tenantId,
      })
    }

    const eventCompletedAt = parsed.dateEnd ?? parsed.eventDate ?? null
    const isCompleted =
      parsed.status !== 'canceled' &&
      eventCompletedAt &&
      new Date(eventCompletedAt).getTime() <= new Date().getTime()

    let finalPaymentTransaction = null
    if (isCompleted && Number(parsed.contractSum) > 0) {
      finalPaymentTransaction = await ensureFinalPaymentTransaction({
        eventId,
        clientId: client?._id,
        contractSum: parsed.contractSum,
        depositAmount,
        date: eventCompletedAt,
        tenantId,
      })
    }

    const calendarTitle = item?.summary ?? 'Без названия'
    results.push({
      googleId: item.id,
      eventId,
      action: dbResult.lastErrorObject?.updatedExisting ? 'updated' : 'created',
      title: calendarTitle,
      clientId: client?._id ?? null,
      depositAmount: Number(depositAmount) > 0 ? depositAmount : null,
      depositCreated: Boolean(depositTransaction),
      finalPaymentCreated: Boolean(finalPaymentTransaction),
      warning: client
        ? null
        : 'Клиент не создан: нет контактных данных для привязки',
    })

    if (!client) {
      console.warn(
        `[google-sync] Клиент не создан для события ${calendarTitle} (${item.id})`
      )
    }
  }

  if (skipped.length) {
    console.warn(
      `[google-sync] Пропущено событий (заявки в названии): ${skipped.length}`
    )
  }

  if (townsToAdd.size > 0) {
    siteSettings.towns = Array.from(
      new Set([...settingsTowns, ...Array.from(townsToAdd)])
    )
    await siteSettings.save()
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        imported: results.length,
        nextSyncToken: googleEvents.nextSyncToken,
        skipped: skipped.length,
        skippedItems: skipped,
        results,
      },
    },
    { status: 200 }
  )
}

const DEPOSIT_TRANSACTION_COMMENT = 'Импорт из календаря: задаток'
const FINAL_PAYMENT_TRANSACTION_COMMENT = 'Импорт из календаря: оплата остатка'

const ensureDepositTransaction = async ({
  eventId,
  clientId,
  amount,
  date,
  tenantId,
}) => {
  if (!eventId || !clientId || !amount) return null

  const existing = await Transactions.findOne({
    eventId,
    tenantId,
    type: 'income',
    category: { $in: ['deposit', 'advance'] },
  }).lean()

  const normalizedDate = date ? new Date(date) : new Date()

  if (existing) {
    if (existing.comment !== DEPOSIT_TRANSACTION_COMMENT) return existing
    const shouldUpdate =
      Number(existing.amount ?? 0) !== Number(amount) ||
      existing.category !== 'deposit' ||
      (existing.date && normalizedDate
        ? new Date(existing.date).getTime() !== normalizedDate.getTime()
        : Boolean(existing.date) !== Boolean(normalizedDate))

    if (shouldUpdate) {
      return Transactions.findByIdAndUpdate(
        existing._id,
        { amount, date: normalizedDate, category: 'deposit' },
        { returnDocument: 'after' }
      )
    }

    return existing
  }

  return Transactions.create({
    tenantId,
    eventId,
    clientId,
    amount,
    type: 'income',
    category: 'deposit',
    date: normalizedDate,
    comment: DEPOSIT_TRANSACTION_COMMENT,
  })
}

const ensureFinalPaymentTransaction = async ({
  eventId,
  clientId,
  contractSum,
  depositAmount,
  date,
  tenantId,
}) => {
  if (!eventId || !clientId || !contractSum) return null

  const remaining = Math.max(
    Number(contractSum) - Number(depositAmount ?? 0),
    0
  )
  if (!remaining) return null

  const normalizedDate = date ? new Date(date) : new Date()

  const existing = await Transactions.findOne({
    eventId,
    tenantId,
    type: 'income',
    category: { $in: ['final_payment', 'client_payment'] },
  }).lean()

  if (existing) {
    if (existing.comment !== FINAL_PAYMENT_TRANSACTION_COMMENT) return existing
    const shouldUpdate =
      Number(existing.amount ?? 0) !== Number(remaining) ||
      existing.category !== 'final_payment' ||
      (existing.date && normalizedDate
        ? new Date(existing.date).getTime() !== normalizedDate.getTime()
        : Boolean(existing.date) !== Boolean(normalizedDate))

    if (shouldUpdate) {
      return Transactions.findByIdAndUpdate(
        existing._id,
        { amount: remaining, date: normalizedDate, category: 'final_payment' },
        { returnDocument: 'after' }
      )
    }

    return existing
  }

  return Transactions.create({
    tenantId,
    eventId,
    clientId,
    amount: remaining,
    type: 'income',
    category: 'final_payment',
    date: normalizedDate,
    comment: FINAL_PAYMENT_TRANSACTION_COMMENT,
  })
}
