const MS_PER_HOUR = 60 * 60 * 1000

const normalizeText = (value) => String(value || '').trim()

const escapeIcsText = (value) =>
  normalizeText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')

const toIcsDate = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

const getAddressText = (order) => {
  if (order.placeType === 'client_address') return normalizeText(order.customAddress)
  const address = order.location?.address
  const addressText = address
    ? [address.town, address.street, address.house, address.room]
        .filter(Boolean)
        .join(', ')
    : ''
  return [order.location?.title, addressText].filter(Boolean).join(', ')
}

const buildEventDescription = (order) =>
  [
    order.serviceTitle ? `Услуга: ${order.serviceTitle}` : '',
    order.companyTitle ? `Компания: ${order.companyTitle}` : '',
    order.client?.name ? `Клиент: ${order.client.name}` : '',
    order.assignment?.confirmationStatus
      ? `Статус участия: ${order.assignment.confirmationStatus}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')

export const buildPartyPerformerCalendarIcs = ({
  orders = [],
  now = new Date(),
} = {}) => {
  const createdAt = toIcsDate(now)
  const events = orders
    .map((order) => {
      const start = new Date(order.eventDate)
      if (Number.isNaN(start.getTime())) return null
      const end = order.dateEnd ? new Date(order.dateEnd) : new Date(start.getTime() + MS_PER_HOUR)
      const safeEnd = Number.isNaN(end.getTime())
        ? new Date(start.getTime() + MS_PER_HOUR)
        : end
      const summary = [order.companyTitle, order.title || order.serviceTitle || 'Заказ']
        .filter(Boolean)
        .join(' - ')
      const uid = [
        normalizeText(order._id) || 'order',
        normalizeText(order.staffId) || 'staff',
        'partycrm',
      ].join('-')

      return [
        'BEGIN:VEVENT',
        `UID:${escapeIcsText(uid)}`,
        `DTSTAMP:${createdAt}`,
        `DTSTART:${toIcsDate(start)}`,
        `DTEND:${toIcsDate(safeEnd)}`,
        `SUMMARY:${escapeIcsText(summary)}`,
        `LOCATION:${escapeIcsText(getAddressText(order))}`,
        `DESCRIPTION:${escapeIcsText(buildEventDescription(order))}`,
        'END:VEVENT',
      ].join('\r\n')
    })
    .filter(Boolean)

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//PartyCRM//Performer Calendar//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
    '',
  ].join('\r\n')
}
