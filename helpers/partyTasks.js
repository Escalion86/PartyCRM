export const PARTY_TASK_STATUSES = Object.freeze({
  new: 'Новая',
  in_progress: 'В работе',
  done: 'Выполнена',
  canceled: 'Отменена',
})

export const isPartyTaskOpen = (task) => ['new', 'in_progress'].includes(task?.status)
export const taskIdOf = (value) => String(value?._id ?? value ?? '')
export const isPartyTaskAssignee = (task, staff) => Boolean(staff && (
  (task.assigneeStaffIds || []).some((id) => taskIdOf(id) === taskIdOf(staff)) ||
  (task.assigneeRoleId && taskIdOf(task.assigneeRoleId) === taskIdOf(staff.positionId))
))

export const taskFailure = (message, status = 400, code = 'partycrm_invalid_task') => {
  const error = new Error(message)
  Object.assign(error, { status, code })
  throw error
}

const validDate = (value) => value && Number.isFinite(new Date(value).getTime())
const objectId = /^[a-f\d]{24}$/i
const readId = (value) => {
  if (!value) return null
  const id = taskIdOf(value)
  if (!objectId.test(id)) taskFailure('Некорректная ссылка в задаче')
  return id
}

export const normalizePartyTaskRecurrence = (input = {}) => {
  const frequency = input?.frequency || 'none'
  if (!['none', 'daily', 'weekly', 'monthly'].includes(frequency)) taskFailure('Неизвестный период повторения')
  if (frequency === 'none') return { frequency: 'none', interval: 1, until: null }
  const interval = Number(input.interval ?? 1)
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) taskFailure('Интервал повторения должен быть от 1 до 365')
  if (input.until && !validDate(input.until)) taskFailure('Некорректная дата окончания повторений')
  return { frequency, interval, until: input.until ? new Date(input.until).toISOString() : null }
}

export const normalizePartyTaskInput = (input = {}, previous = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) taskFailure('Некорректная задача')
  const title = String(input.title ?? previous.title ?? '').trim()
  if (!title || title.length > 240) taskFailure('Название задачи должно содержать от 1 до 240 символов')
  const dueAt = input.dueAt === undefined ? previous.dueAt : input.dueAt
  if (dueAt && !validDate(dueAt)) taskFailure('Укажите корректный срок задачи')
  const staffIds = input.assigneeStaffIds ?? previous.assigneeStaffIds ?? []
  if (!Array.isArray(staffIds) || staffIds.length > 100) taskFailure('Укажите не более 100 сотрудников')
  const assigneeStaffIds = [...new Set(staffIds.map(readId).filter(Boolean))]
  const assigneeRoleId = readId(input.assigneeRoleId === undefined ? previous.assigneeRoleId : input.assigneeRoleId)
  if (!assigneeStaffIds.length && !assigneeRoleId) taskFailure('Назначьте задачу сотруднику или должности')
  const recurrence = normalizePartyTaskRecurrence(input.recurrence ?? previous.recurrence)
  if (recurrence.frequency !== 'none' && !dueAt) taskFailure('Для повторяющейся задачи нужен срок первого выполнения')
  if (recurrence.until && new Date(recurrence.until) < new Date(dueAt)) taskFailure('Окончание повторений не может быть раньше первого срока')
  const descriptionHtml = input.descriptionHtml ?? previous.descriptionHtml ?? ''
  if (typeof descriptionHtml !== 'string' || descriptionHtml.length > 100000) taskFailure('Описание задачи слишком длинное')
  return {
    title, descriptionHtml, dueAt: dueAt ? new Date(dueAt).toISOString() : null,
    orderId: readId(input.orderId === undefined ? previous.orderId : input.orderId),
    locationId: readId(input.locationId === undefined ? previous.locationId : input.locationId),
    assigneeStaffIds, assigneeRoleId, recurrence,
  }
}

export const transitionPartyTask = ({ task, status, staffId, canManage = false, canComplete = false, now = new Date() }) => {
  if (!Object.hasOwn(PARTY_TASK_STATUSES, status)) taskFailure('Неизвестный статус задачи')
  if (task.status === status) return null
  if (!canManage && !canComplete) taskFailure('Нет права выполнить эту задачу', 403)
  if (status === 'canceled' && !canManage) taskFailure('Нет права отменять задачи', 403)
  if (['done', 'canceled'].includes(task.status) && !canManage) taskFailure('Задача уже завершена; обновите список', 409)
  return {
    status,
    completedByStaffId: status === 'done' ? staffId : null,
    completedAt: status === 'done' ? now : null,
  }
}

export const partyTaskZonedParts = (value, timeZone = 'Europe/Moscow') => Object.fromEntries(
  new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value)).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)])
)

export const partyTaskLocalToUtc = (parts, timeZone) => {
  const target = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0)
  let result = target
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = partyTaskZonedParts(result, timeZone)
    const offset = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second) - result
    const next = target - offset
    if (next === result) break
    result = next
  }
  return new Date(result)
}

export const nextPartyTaskOccurrence = ({ after, recurrence, timeZone = 'Europe/Moscow', anchorDay }) => {
  const rule = normalizePartyTaskRecurrence(recurrence)
  if (rule.frequency === 'none' || !validDate(after)) return null
  const parts = partyTaskZonedParts(after, timeZone)
  if (rule.frequency === 'monthly') {
    const month = new Date(Date.UTC(parts.year, parts.month - 1 + rule.interval, 1))
    const lastDay = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0)).getUTCDate()
    Object.assign(parts, { year: month.getUTCFullYear(), month: month.getUTCMonth() + 1, day: Math.min(anchorDay || parts.day, lastDay) })
  } else {
    const day = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + rule.interval * (rule.frequency === 'weekly' ? 7 : 1)))
    Object.assign(parts, { year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate() })
  }
  const next = partyTaskLocalToUtc(parts, timeZone)
  if (rule.until && next > new Date(rule.until)) return null
  return next.toISOString()
}

export const getPartyTaskDeadlineWarning = (task, order) =>
  task?.dueAt && order?.eventDate && new Date(task.dueAt) > new Date(order.dateEnd || order.eventDate)
    ? 'Срок задачи позже мероприятия. Проверьте, что это запланировано.' : ''

export const partyTaskDateInput = (value) => {
  if (!validDate(value)) return ''
  const date = new Date(value)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}
