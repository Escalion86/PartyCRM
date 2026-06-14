const MAX_BATCH_SIZE = 20

const idOf = (value) => String(value?._id ?? value?.id ?? '')

const validTimeZone = (value) => {
  const candidate = String(value || '').trim() || 'Europe/Moscow'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format()
    return candidate
  } catch {
    return 'Europe/Moscow'
  }
}

const zonedParts = (value, timeZone) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(value)
      .filter((item) => item.type !== 'literal')
      .map((item) => [item.type, Number(item.value)])
  )

const startOfDayInTimeZone = (value, timeZoneValue) => {
  const date = value instanceof Date ? new Date(value) : new Date(value || Date.now())
  const timeZone = validTimeZone(timeZoneValue)
  const current = zonedParts(date, timeZone)
  const utcMidnight = Date.UTC(current.year, current.month - 1, current.day)
  const candidate = new Date(utcMidnight)
  const candidateParts = zonedParts(candidate, timeZone)
  const offset =
    Date.UTC(
      candidateParts.year,
      candidateParts.month - 1,
      candidateParts.day,
      candidateParts.hour,
      candidateParts.minute,
      candidateParts.second
    ) - candidate.getTime()
  return new Date(utcMidnight - offset)
}

const batchError = (code, message) => Object.assign(new Error(message), { code })

export const syncFuturePartyOrdersBatch = async ({
  company,
  access,
  cursor = '',
  limit = MAX_BATCH_SIZE,
  dependencies = {},
} = {}) => {
  if (!idOf(company)) throw batchError('party_company_not_found', 'Компания не найдена')
  if (access?.allowCalendarSync !== true) {
    throw batchError(
      'party_calendar_tariff_required',
      'Интеграция недоступна на текущем тарифе'
    )
  }
  if (typeof dependencies.findOrders !== 'function') {
    throw batchError('party_calendar_batch_unavailable', 'Пакетная синхронизация недоступна')
  }

  const batchSize = Math.min(Math.max(Number.parseInt(limit, 10) || MAX_BATCH_SIZE, 1), MAX_BATCH_SIZE)
  const now = typeof dependencies.now === 'function' ? dependencies.now() : new Date()
  const source = await dependencies.findOrders({
    companyId: idOf(company),
    eventDateFrom: startOfDayInTimeZone(
      now,
      company?.settings?.timeZone || company?.timeZone
    ),
    cursor: String(cursor || '').trim(),
    limit: batchSize + 1,
  })
  const candidates = Array.isArray(source) ? source : []
  const page = candidates.slice(0, batchSize)
  const result = {
    processed: page.length,
    synced: 0,
    success: 0,
    failed: 0,
    skipped: 0,
    nextCursor: candidates.length > batchSize && page.length ? idOf(page.at(-1)) : null,
    done: candidates.length <= batchSize,
    errors: [],
  }

  for (const order of page) {
    try {
      const syncResult = await dependencies.syncOrder({ company, order, access })
      if (syncResult?.ok) {
        result.synced += 1
        result.success += 1
      } else if (syncResult?.status === 'unavailable' || syncResult?.status === 'skipped') {
        result.skipped += 1
      } else {
        result.failed += 1
        result.errors.push({ orderId: idOf(order), code: 'calendar_sync_failed' })
      }
    } catch {
      result.failed += 1
      result.errors.push({ orderId: idOf(order), code: 'calendar_sync_failed' })
    }
  }

  return result
}

export { MAX_BATCH_SIZE }
