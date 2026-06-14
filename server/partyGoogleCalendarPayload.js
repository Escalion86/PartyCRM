import {
  PARTY_ORDER_PAYMENT_METHOD_LABELS,
  PARTY_ORDER_PAYOUT_STATUS_LABELS,
  PARTY_ORDER_TRANSACTION_CATEGORY_LABELS,
  getOrderPaymentState,
  normalizeOrderTransactions,
} from '../helpers/partyOrderTransactions.js'

const STATUS_PREFIXES = {
  draft: '[ЗАЯВКА] ',
  active: '',
  canceled: '[ОТМЕНЕНО] ',
  closed: '[ЗАКРЫТО] ',
}

const STAFF_ROLE_LABELS = {
  performer: 'Исполнитель',
  admin: 'Администратор',
  assistant: 'Ассистент',
}

const DEFAULT_COLORS = { draft: '8', active: '9', canceled: '11', closed: '10' }

const decodeEntities = (value) =>
  value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")

const plainText = (value) => {
  if (value === null || value === undefined) return ''
  return decodeEntities(String(value))
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(?:p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/[\t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

const titleText = (value) =>
  plainText(value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const asArray = (value) => (Array.isArray(value) ? value : [])

const validDate = (value) => {
  if (!value) return null
  const date = value instanceof Date ? new Date(value) : new Date(value)
  return Number.isFinite(date.getTime()) ? date : null
}

const number = (value) => {
  const prepared = Number(value || 0)
  return Number.isFinite(prepared) ? Math.max(prepared, 0) : 0
}

const money = (value) =>
  new Intl.NumberFormat('ru-RU').format(number(value)).replace(/\u00a0/g, ' ')

const idOf = (value) => plainText(value?._id ?? value?.id ?? value)

const getTimeZone = (company) => {
  const candidate = titleText(company?.settings?.timeZone || company?.timeZone)
  if (!candidate) return 'Europe/Moscow'
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format()
    return candidate
  } catch {
    return 'Europe/Moscow'
  }
}

const getOrderTitle = (order) =>
  titleText(order?.title || order?.serviceTitle) || 'Заказ'

const getServiceTitles = (order, services) => {
  const ids = new Set(asArray(order?.servicesIds).map(idOf).filter(Boolean))
  const source = asArray(services)
  const selected = ids.size ? source.filter((item) => ids.has(idOf(item))) : source
  const titles = selected.map((item) => titleText(item?.title || item?.name)).filter(Boolean)
  if (titles.length === 0 && order?.serviceTitle) titles.push(titleText(order.serviceTitle))
  return [...new Set(titles)]
}

const formatAddress = (address) => {
  if (typeof address === 'string') return plainText(address)
  if (!address || typeof address !== 'object') return ''
  return ['town', 'city', 'street', 'house', 'building', 'room']
    .map((key) => plainText(address[key]))
    .filter(Boolean)
    .filter((item, index, items) => items.indexOf(item) === index)
    .join(', ')
}

const getLocationText = (order, location) => {
  if (order?.placeType === 'client_address') {
    return plainText(order?.customAddress) || formatAddress(order?.clientAddress)
  }
  return (
    formatAddress(location?.address) ||
    plainText(location?.address || location?.title) ||
    plainText(order?.customAddress) ||
    formatAddress(order?.clientAddress)
  )
}

const safeOrderLink = (domain, orderId) => {
  if (!domain || !orderId) return ''
  try {
    const url = new URL(domain)
    if (!['http:', 'https:'].includes(url.protocol)) return ''
    return new URL(`/company/orders/${encodeURIComponent(orderId)}`, url.origin).toString()
  } catch {
    return ''
  }
}

const normalizeReminders = (settings, canceled = false) => {
  if (canceled) return { useDefault: false, overrides: [] }
  const source = settings?.reminders || {}
  if (source.useDefault === true) return { useDefault: true }
  const overrides = Array.isArray(source.overrides)
    ? source.overrides
        .filter(
          (item) =>
            ['popup', 'email'].includes(item?.method) &&
            Number.isFinite(Number(item?.minutes)) &&
            Number(item.minutes) > 0
        )
        .map((item) => ({ method: item.method, minutes: Number(item.minutes) }))
    : []
  return { useDefault: false, overrides }
}

const addBlock = (blocks, title, lines) => {
  const content = (Array.isArray(lines) ? lines : [lines]).filter(Boolean)
  if (content.length) blocks.push(`${title}:\n${content.join('\n')}`)
}

export const calculatePartyOrderFinanceSummary = ({ order = {}, transactions } = {}) => {
  const source = normalizeOrderTransactions(transactions ?? order.transactions)
  const payment = getOrderPaymentState({ contractAmount: order.contractAmount, transactions: source })
  const payouts = asArray(order.assignedStaff).filter(
    (item) => item?.payoutStatus !== 'canceled'
  )
  const payoutTotal = payouts.reduce((sum, item) => sum + number(item?.payoutAmount), 0)
  const paidPayoutTotal = payouts
    .filter((item) => item?.payoutStatus === 'paid')
    .reduce((sum, item) => sum + number(item?.payoutAmount), 0)
  return {
    contractAmount: payment.contractAmount,
    incomeTotal: payment.incomeTotal,
    expenseTotal: payment.expenseTotal,
    balanceDue: payment.balanceDue,
    margin: payment.margin,
    hasDeposit: payment.hasDeposit,
    isFullyPaid: payment.status === 'paid',
    payoutTotal,
    paidPayoutTotal,
    pendingPayoutTotal: Math.max(payoutTotal - paidPayoutTotal, 0),
  }
}

const buildSummary = ({ order, syncSettings, serviceTitles, finance }) => {
  const eventType = getOrderTitle(order)
  const services = serviceTitles.join(', ') || titleText(order?.serviceTitle) || eventType
  const client = titleText(order?.client?.name) || 'Клиент'
  const titles = {
    eventType_services: `${eventType} - ${services}`,
    services_eventType: `${services} - ${eventType}`,
    eventType,
    services,
    client_eventType: syncSettings.showClient
      ? `${client} - ${eventType}`
      : eventType,
  }
  const financialIcons = syncSettings.showStatusIcons
    ? `${finance.hasDeposit ? '💰 ' : ''}${finance.isFullyPaid ? '✅ ' : ''}`
    : ''
  return `${STATUS_PREFIXES[order?.status] ?? ''}${financialIcons}${titles[syncSettings.titleMode] || titles.eventType_services}`
}

export const buildPartyOrderCalendarPayload = ({
  order = {},
  settings = {},
  company = {},
  transactions,
  location,
  services,
  staff,
  domain,
} = {}) => {
  const start = validDate(order.eventDate)
  if (!start) return null
  const providedEnd = validDate(order.dateEnd)
  const end = providedEnd && providedEnd > start ? providedEnd : new Date(start.getTime() + 60 * 60 * 1000)
  const timeZone = getTimeZone(company)
  const syncSettings = settings.syncSettings || {}
  const serviceTitles = getServiceTitles(order, services)
  const finance = calculatePartyOrderFinanceSummary({ order, transactions })
  const address = getLocationText(order, location)
  const blocks = []

  if (syncSettings.showDescription) {
    addBlock(blocks, 'Описание', [plainText(order.description), plainText(order.adminComment)])
  }
  if (syncSettings.showClient) {
    addBlock(blocks, 'Клиент', [plainText(order.client?.name), plainText(order.client?.phone), plainText(order.client?.email)])
  }
  if (syncSettings.showLocation) {
    addBlock(blocks, 'Место', [plainText(location?.title), address])
  }
  if (syncSettings.showServices) addBlock(blocks, 'Услуги', serviceTitles.join(', '))
  if (syncSettings.showStaff) {
    const staffById = new Map(asArray(staff).map((item) => [idOf(item), item]))
    addBlock(
      blocks,
      'Исполнители',
      asArray(order.assignedStaff).map((assignment) => {
        const person = staffById.get(idOf(assignment?.staffId)) || assignment?.staff || assignment
        const name = plainText(person?.name || person?.title)
        return name ? `${name} (${STAFF_ROLE_LABELS[assignment?.role] || plainText(assignment?.role)})` : ''
      })
    )
  }
  if (syncSettings.showContractSum) addBlock(blocks, 'Договорная сумма', `${money(finance.contractAmount)} ₽`)
  if (syncSettings.showPayments) {
    addBlock(blocks, 'Оплаты', [`Получено: ${money(finance.incomeTotal)} ₽`, `Остаток: ${money(finance.balanceDue)} ₽`])
  }
  const sourceTransactions = normalizeOrderTransactions(
    Array.isArray(transactions)
      ? transactions
      : Array.isArray(order.transactions)
        ? order.transactions
        : []
  )
  if (syncSettings.showTransactions) {
    addBlock(
      blocks,
      'Транзакции',
      sourceTransactions.map((item) => {
        const category = PARTY_ORDER_TRANSACTION_CATEGORY_LABELS[item?.category] || plainText(item?.category)
        const method = PARTY_ORDER_PAYMENT_METHOD_LABELS[item?.paymentMethod] || plainText(item?.paymentMethod)
        const sign = item?.type === 'expense' ? '-' : '+'
        return `${category}: ${sign}${money(item?.amount)} ₽${method ? `, ${method}` : ''}`
      })
    )
  }
  if (syncSettings.showPayouts) {
    const staffById = new Map(asArray(staff).map((item) => [idOf(item), item]))
    addBlock(
      blocks,
      'Выплаты',
      asArray(order.assignedStaff)
        .filter((item) => item?.payoutStatus !== 'canceled')
        .map((item) => {
        const person = staffById.get(idOf(item?.staffId)) || item?.staff || item
        const name = plainText(person?.name || person?.title) || 'Исполнитель'
        const status = PARTY_ORDER_PAYOUT_STATUS_LABELS[item?.payoutStatus] || plainText(item?.payoutStatus)
        return `${name}: ${money(item?.payoutAmount)} ₽ (${status})`
        })
    )
  }
  if (syncSettings.showAdditionalEvents) {
    addBlock(
      blocks,
      'Дополнительные события',
      asArray(order.additionalEvents)
        .filter((item) => !item?.done)
        .map((item) => plainText(item?.title))
    )
  }
  if (syncSettings.showNavigationLinks && address) {
    addBlock(blocks, 'Навигация', `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`)
  }
  const orderLink = syncSettings.showOrderLink ? safeOrderLink(domain, idOf(order)) : ''
  if (orderLink) addBlock(blocks, 'Заказ PartyCRM', orderLink)

  const status = STATUS_PREFIXES[order.status] === undefined ? 'draft' : order.status
  return {
    summary: buildSummary({ order: { ...order, status }, syncSettings, serviceTitles, finance }),
    description: blocks.join('\n\n'),
    location: syncSettings.showLocation ? address : '',
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
    reminders: normalizeReminders(settings, status === 'canceled'),
    colorId: plainText(settings.statusColors?.[status]) || DEFAULT_COLORS[status],
    visibility: 'private',
  }
}

export const buildPartyAdditionalCalendarPayload = ({
  item = {},
  orderContext = {},
  settings = {},
  company = {},
  domain,
} = {}) => {
  const start = validDate(item.date)
  if (!start) return null
  const order = orderContext.order || {}
  const timeZone = getTimeZone(company)
  const end = new Date(start.getTime() + 30 * 60 * 1000)
  const lines = [plainText(item.description), `Заказ: ${getOrderTitle(order)}`]
  const address = getLocationText(order, orderContext.location)
  if (settings.syncSettings?.showLocation && address) lines.push(`Место: ${address}`)
  const orderLink = settings.syncSettings?.showOrderLink
    ? safeOrderLink(domain, idOf(order))
    : ''
  if (orderLink) lines.push(orderLink)
  const status = STATUS_PREFIXES[order.status] === undefined ? 'draft' : order.status
  return {
    summary: titleText(item.title) || 'Напоминание',
    description: lines.filter(Boolean).join('\n'),
    location: settings.syncSettings?.showLocation ? address : '',
    start: { dateTime: start.toISOString(), timeZone },
    end: { dateTime: end.toISOString(), timeZone },
    reminders: normalizeReminders(settings, status === 'canceled'),
    colorId: plainText(settings.statusColors?.[status]) || DEFAULT_COLORS[status],
    visibility: 'private',
  }
}
