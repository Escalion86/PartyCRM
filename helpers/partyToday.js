import {
  canPartyAccess,
  isPartyRestrictedManagementContext,
} from './partyRolePermissions.js'
import { partyTaskLocalToUtc, partyTaskZonedParts } from './partyTasks.js'

export const PARTY_TODAY_CARD_LIMIT = 6
export const PARTY_TODAY_SCAN_LIMIT = 400

export const getPartyTodayAccess = (context) => {
  const can = (resource) => canPartyAccess(context, { resource })
  const orders = can('orders')
  const upcoming = orders && can('orders.eventDate')
  return {
    tasks: can('tasks'),
    inbox:
      ['owner', 'admin'].includes(context?.role) &&
      !isPartyRestrictedManagementContext(context) &&
      can('inbox'),
    orders_new: orders && can('orders.workflowStageId'),
    orders_team: upcoming && can('orders.assignedStaff'),
    orders_preparation: upcoming && can('orders.preparation'),
    payments: orders && can('finance.clientAmount') && can('finance.payments'),
    orders_upcoming: upcoming,
  }
}

export const canPartyTodayAccess = (context) =>
  Object.values(getPartyTodayAccess(context)).some(Boolean)

export const getPartyTodayPeriod = ({
  now = new Date(),
  timeZone = 'Europe/Moscow',
} = {}) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone }).format(now)
  } catch {
    timeZone = 'Europe/Moscow'
  }
  const parts = partyTaskZonedParts(now, timeZone)
  const local = (days) => {
    const date = new Date(
      Date.UTC(parts.year, parts.month - 1, parts.day + days)
    )
    return partyTaskLocalToUtc(
      {
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
      },
      timeZone
    )
  }
  return {
    now: new Date(now),
    timeZone,
    dayFrom: local(0),
    dayTo: local(1),
    upcomingTo: local(7),
  }
}

export const partyTodayHref = (context, page, focus = {}) => {
  const query = new URLSearchParams({ companyId: String(context.tenantId) })
  for (const [key, value] of Object.entries(focus)) {
    if (value) query.set(key, String(value))
  }
  return `${page}?${query}`
}

export const partyTodayPhone = (value) => {
  let digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 10) digits = `7${digits}`
  if (digits.length === 11 && digits.startsWith('8'))
    digits = `7${digits.slice(1)}`
  return /^7\d{10}$/.test(digits) ? digits : ''
}

export const projectPartyTodayOrder = (context, order, reason) => {
  if (!canPartyAccess(context, { resource: 'orders', order })) return null
  const can = (resource) => canPartyAccess(context, { resource, order })
  return {
    id: String(order._id),
    kind: 'order',
    title:
      (can('orders.title') && order.title) ||
      (can('orders.serviceTitle') && order.serviceTitle) ||
      'Заказ',
    reason,
    overdue: false,
    href: partyTodayHref(context, '/performer/work', { orderId: order._id }),
    ...(can('orders.eventDate') && order.eventDate
      ? { eventDate: new Date(order.eventDate).toISOString() }
      : {}),
    ...(can('orders.client.name') && order.client?.name
      ? { clientName: order.client.name }
      : {}),
    ...(can('orders.client.phone') && partyTodayPhone(order.client?.phone)
      ? { phone: partyTodayPhone(order.client.phone) }
      : {}),
  }
}
