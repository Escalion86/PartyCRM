const DEFAULT_REMINDER_TIME = '10:00'
const DEFAULT_TIME_ZONE = 'Europe/Moscow'

const idOf = (value) => String(value?._id ?? value?.id ?? value ?? '')

const cleanText = (value, maxLength = 500) =>
  String(value ?? '').trim().slice(0, maxLength)

const validTimeZone = (value) => {
  const candidate = cleanText(value, 80) || DEFAULT_TIME_ZONE
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format()
    return candidate
  } catch {
    return DEFAULT_TIME_ZONE
  }
}

const zonedParts = (value, timeZoneValue) => {
  const date = value instanceof Date ? value : new Date(value || Date.now())
  const timeZone = validTimeZone(timeZoneValue)
  return Object.fromEntries(
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
      .formatToParts(date)
      .filter((item) => item.type !== 'literal')
      .map((item) => [item.type, Number(item.value)])
  )
}

const localDateKey = (value, timeZoneValue) => {
  const parts = zonedParts(value, timeZoneValue)
  return [
    String(parts.year).padStart(4, '0'),
    String(parts.month).padStart(2, '0'),
    String(parts.day).padStart(2, '0'),
  ].join('-')
}

const startOfNextDayInTimeZone = (value, timeZoneValue) => {
  const timeZone = validTimeZone(timeZoneValue)
  const parts = zonedParts(value, timeZone)
  const utcMidnight = Date.UTC(parts.year, parts.month - 1, parts.day + 1)
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

const parseTimeToMinutes = (value) => {
  const match = cleanText(value, 8).match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return 10 * 60
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return 10 * 60
  return hours * 60 + minutes
}

const getCompanyReminderWindow = ({ company, now }) => {
  const timeZone = validTimeZone(company?.settings?.timeZone || company?.timeZone)
  const parts = zonedParts(now, timeZone)
  const reminderMinutes = parseTimeToMinutes(
    company?.settings?.notifications?.additionalEventsPushTime ||
      company?.notifications?.additionalEventsPushTime ||
      DEFAULT_REMINDER_TIME
  )
  const currentMinutes = Number(parts.hour || 0) * 60 + Number(parts.minute || 0)

  return {
    timeZone,
    dateKey: localDateKey(now, timeZone),
    dateToExclusive: startOfNextDayInTimeZone(now, timeZone),
    canSend: currentMinutes >= reminderMinutes,
  }
}

const toDate = (value) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const getReminderType = ({ taskDate, dateKey, timeZone }) => {
  const taskDateKey = localDateKey(taskDate, timeZone)
  if (taskDateKey < dateKey) return 'overdue'
  if (taskDateKey === dateKey) return 'today'
  return null
}

const collectDueAdditionalEventReminders = ({ company, orders, now }) => {
  const window = getCompanyReminderWindow({ company, now })
  const reminders = []

  for (const order of Array.isArray(orders) ? orders : []) {
    if (['canceled', 'closed'].includes(String(order?.status || ''))) continue
    const orderId = idOf(order)
    if (!orderId) continue

    ;(Array.isArray(order?.additionalEvents) ? order.additionalEvents : []).forEach(
      (item, index) => {
        if (!item || item.done) return
        const taskDate = toDate(item.date)
        if (!taskDate || taskDate.getTime() >= window.dateToExclusive.getTime()) return
        const reminderType = getReminderType({
          taskDate,
          dateKey: window.dateKey,
          timeZone: window.timeZone,
        })
        if (!reminderType) return

        reminders.push({
          tenantId: idOf(company),
          orderId,
          orderTitle: cleanText(order?.title || order?.serviceTitle, 180),
          additionalEventId: idOf(item) || String(index),
          additionalEventIndex: index,
          title: cleanText(item.title, 180) || 'Задача по заказу',
          reminderType,
          dateKey: window.dateKey,
          date: taskDate,
        })
      }
    )
  }

  return reminders
}

const pluralTasks = (count) => {
  const normalized = Math.abs(Number(count) || 0)
  const mod10 = normalized % 10
  const mod100 = normalized % 100
  if (mod10 === 1 && mod100 !== 11) return 'задача'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'задачи'
  return 'задач'
}

const pluralOverdue = (count) => {
  const normalized = Math.abs(Number(count) || 0)
  const mod10 = normalized % 10
  const mod100 = normalized % 100
  if (mod10 === 1 && mod100 !== 11) return 'просрочена'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'просрочены'
  }
  return 'просрочено'
}

export const buildPartyAdditionalEventReminderPayload = ({
  company,
  reminders,
  dateKey,
} = {}) => {
  const items = Array.isArray(reminders) ? reminders : []
  const count = items.length
  const overdueCount = items.filter((item) => item.reminderType === 'overdue').length
  const companyId = idOf(company)
  const first = items[0]
  const details = [
    `${count} ${pluralTasks(count)}`,
    overdueCount ? `${overdueCount} ${pluralOverdue(overdueCount)}` : '',
    first?.title ? `Ближайшая: ${first.title}` : '',
  ].filter(Boolean)

  return {
    title: cleanText(company?.title, 160) || 'PartyCRM',
    body: details.join('. '),
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: `party-reminders-${companyId || 'company'}-${cleanText(dateKey, 20)}`,
    data: {
      type: 'party_additional_events_reminder',
      companyId,
      url: '/company/orders',
      dateKey: cleanText(dateKey, 20),
      count,
      overdueCount,
    },
  }
}

const isDuplicateError = (error) =>
  Number(error?.code) === 11000 || String(error?.message || '').includes('E11000')

export const runPartyAdditionalEventReminderBatch = async ({
  now = new Date(),
  dependencies = {},
} = {}) => {
  const findCompanies =
    typeof dependencies.findCompanies === 'function'
      ? dependencies.findCompanies
      : async () => []
  const findOrders =
    typeof dependencies.findOrders === 'function' ? dependencies.findOrders : async () => []
  const createReminderLog =
    typeof dependencies.createReminderLog === 'function'
      ? dependencies.createReminderLog
      : async () => ({})
  const sendPush =
    typeof dependencies.sendPush === 'function'
      ? dependencies.sendPush
      : async () => ({ ok: false })

  const companies = await findCompanies({ now })
  const result = {
    companiesProcessed: 0,
    companiesSkipped: 0,
    companiesBeforeReminderTime: 0,
    remindersDue: 0,
    remindersDeduped: 0,
    remindersSent: 0,
    pushesSent: 0,
    failed: 0,
  }

  for (const company of Array.isArray(companies) ? companies : []) {
    result.companiesProcessed += 1
    if (company?.settings?.notifications?.pushEnabled !== true) {
      result.companiesSkipped += 1
      continue
    }

    const window = getCompanyReminderWindow({ company, now })
    if (!window.canSend) {
      result.companiesBeforeReminderTime += 1
      continue
    }

    const companyId = idOf(company)
    const orders = await findOrders({
      companyId,
      dateToExclusive: window.dateToExclusive,
      dateKey: window.dateKey,
      timeZone: window.timeZone,
    })
    const reminders = collectDueAdditionalEventReminders({ company, orders, now })
    result.remindersDue += reminders.length

    const freshReminders = []
    for (const reminder of reminders) {
      try {
        await createReminderLog({
          tenantId: companyId,
          orderId: reminder.orderId,
          additionalEventId: reminder.additionalEventId,
          additionalEventIndex: reminder.additionalEventIndex,
          reminderType: reminder.reminderType,
          dateKey: reminder.dateKey,
        })
        freshReminders.push(reminder)
      } catch (error) {
        if (isDuplicateError(error)) {
          result.remindersDeduped += 1
        } else {
          result.failed += 1
        }
      }
    }

    if (freshReminders.length === 0) continue
    const payload = buildPartyAdditionalEventReminderPayload({
      company,
      reminders: freshReminders,
      dateKey: window.dateKey,
    })
    await sendPush({
      tenantId: companyId,
      companyId,
      payload,
      reminders: freshReminders,
    })
    result.pushesSent += 1
    result.remindersSent += freshReminders.length
  }

  return result
}

export { collectDueAdditionalEventReminders, getCompanyReminderWindow }
