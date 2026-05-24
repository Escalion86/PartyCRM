const hasDocuments = (payload) => {
  const invoiceLinks = Array.isArray(payload?.invoiceLinks)
    ? payload.invoiceLinks
    : []
  const receiptLinks = Array.isArray(payload?.receiptLinks)
    ? payload.receiptLinks
    : []
  const actLinks = Array.isArray(payload?.actLinks) ? payload.actLinks : []
  const contractLinks = Array.isArray(payload?.contractLinks)
    ? payload.contractLinks
    : []
  return (
    invoiceLinks.some((item) => Boolean(item)) ||
    receiptLinks.some((item) => Boolean(item)) ||
    actLinks.some((item) => Boolean(item)) ||
    contractLinks.some((item) => Boolean(item))
  )
}

const parseDateValue = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const normalizeWaitDeposit = (value) => Boolean(value)

const normalizeEventType = (value) =>
  typeof value === 'string' ? value.trim() : ''

const normalizeDepositExpectedAmount = (value) => {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return null
  return Math.floor(number)
}

const normalizeAdditionalEvents = (items) => {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const title = typeof item.title === 'string' ? item.title.trim() : ''
      const description =
        typeof item.description === 'string' ? item.description.trim() : ''
      const date = parseDateValue(item.date)
      if (!title && !description && !date) return null
      const googleCalendarEventId =
        typeof item.googleCalendarEventId === 'string'
          ? item.googleCalendarEventId.trim()
          : ''
      const done = Boolean(item.done)
      const doneAt = done ? parseDateValue(item.doneAt) : null
      return {
        title,
        description,
        date,
        done,
        doneAt,
        googleCalendarEventId,
      }
    })
    .filter(Boolean)
}

export {
  hasDocuments,
  parseDateValue,
  normalizeWaitDeposit,
  normalizeEventType,
  normalizeDepositExpectedAmount,
  normalizeAdditionalEvents,
}

