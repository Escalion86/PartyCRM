import { partyTaskLocalToUtc, partyTaskZonedParts, taskFailure, taskIdOf } from './partyTasks.js'

const statuses = ['new', 'in_progress', 'done', 'canceled']
const filters = ['all', 'open', 'overdue', 'today', 'undated', ...statuses]
const scopes = ['all', 'mine', 'role', 'created']
const objectId = /^[a-f\d]{24}$/i
const isoDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/
const parseDate = (value) => {
  if (!isoDate.test(value) || !Number.isFinite(+new Date(value))) taskFailure('Некорректная дата фильтра задач')
  const [year, month, day, hour, minute, second] = value.match(/^\d{4}|\d{2}/g).slice(0, 6).map(Number)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const lastDay = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  if (!lastDay || day < 1 || day > lastDay || hour > 23 || minute > 59 || second > 59) taskFailure('Некорректная дата фильтра задач')
  return new Date(value)
}

/** Query filters never grant access; callers must intersect them with the task ACL. */
export const parsePartyTaskQuery = (params, { timeZone = 'Europe/Moscow', now = new Date() } = {}) => {
  const filter = params.get('filter') || 'all'
  const scope = params.get('scope') || 'all'
  const status = params.get('status') || ''
  if (!filters.includes(filter) || !scopes.includes(scope) || status && !statuses.includes(status)) taskFailure('Неизвестный фильтр задач')
  const search = String(params.get('search') || '').trim().toLocaleLowerCase('ru-RU')
  if (search.length > 240) taskFailure('Поисковая строка должна быть не длиннее 240 символов')
  const cursor = params.get('cursor') || ''
  const orderId = params.get('orderId') || ''
  if (cursor && !objectId.test(cursor) || orderId && !objectId.test(orderId)) taskFailure('Некорректный идентификатор задачи')
  const instant = params.get('now') ? parseDate(params.get('now')) : new Date(now)
  let dayFrom = params.get('dayFrom') ? parseDate(params.get('dayFrom')) : null
  let dayTo = params.get('dayTo') ? parseDate(params.get('dayTo')) : null
  if (Boolean(dayFrom) !== Boolean(dayTo) || dayFrom && (+dayTo - +dayFrom < 20 * 3600000 || +dayTo - +dayFrom > 28 * 3600000)) taskFailure('Укажите границы одного дня для фильтра задач')
  if (filter === 'today' && !dayFrom) {
    // Older callers may omit local-day bounds; use the company's calendar day.
    let parts
    try { parts = partyTaskZonedParts(instant, timeZone) }
    catch { timeZone = 'Europe/Moscow'; parts = partyTaskZonedParts(instant, timeZone) }
    dayFrom = partyTaskLocalToUtc({ year: parts.year, month: parts.month, day: parts.day }, timeZone)
    const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1))
    dayTo = partyTaskLocalToUtc({ year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() }, timeZone)
  }
  return { filter, scope, status, search, cursor: cursor.toLowerCase(), orderId: orderId.toLowerCase(), now: instant, dayFrom, dayTo }
}

export const buildPartyTaskQueryFilter = (query, context) => {
  const clauses = []
  if (query.orderId) clauses.push({ orderId: query.orderId })
  if (query.status) clauses.push({ status: query.status })
  if (statuses.includes(query.filter)) clauses.push({ status: query.filter })
  if (['open', 'overdue', 'today', 'undated'].includes(query.filter)) clauses.push({ status: { $in: ['new', 'in_progress'] } })
  const staffId = taskIdOf(context.staff)
  const roleId = taskIdOf(context.staff?.positionId || context.position)
  if (query.scope === 'mine') clauses.push(objectId.test(staffId) ? { assigneeStaffIds: staffId } : { _id: { $in: [] } })
  if (query.scope === 'role') clauses.push(objectId.test(roleId) ? { assigneeRoleId: roleId } : { _id: { $in: [] } })
  if (query.scope === 'created') {
    const creators = [
      ...(objectId.test(staffId) ? [{ createdByStaffId: staffId }] : []),
      ...(objectId.test(taskIdOf(context.sessionUser)) ? [{ createdByUserId: context.sessionUser._id }] : []),
    ]
    clauses.push(creators.length ? { $or: creators } : { _id: { $in: [] } })
  }
  return clauses
}

/** Run after safe projection: search and due-date filters must not reveal hidden fields. */
export const matchesPartyTaskQuery = (task, query) => {
  const open = ['new', 'in_progress'].includes(task.status)
  const due = task.dueAt && Number.isFinite(+new Date(task.dueAt)) ? new Date(task.dueAt) : null
  if (query.status && task.status !== query.status) return false
  if (statuses.includes(query.filter) && task.status !== query.filter) return false
  if (['open', 'overdue', 'today', 'undated'].includes(query.filter) && !open) return false
  if (query.filter === 'overdue' && !(due && due < query.now)) return false
  if (query.filter === 'today' && !(due && due >= query.dayFrom && due < query.dayTo)) return false
  if (query.filter === 'undated' && due) return false
  return !query.search || [task.title, task.orderTitle].filter(Boolean).join(' ').toLocaleLowerCase('ru-RU').includes(query.search)
}
