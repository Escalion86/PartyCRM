import sanitizeHtml from 'sanitize-html'
import { createHash, randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { getPartyRequestContext, isValidObjectId, partyError } from './partyApi'
import { getPartyTaskModel, getPartyTaskMediaModel, getPartyTaskDraftModel, withPartyTaskSeriesMutation } from './partyTaskModels'
import { getPartyOrderModel, getPartyStaffModel, getPartyLocationModel, getPartyRoleModel } from './partyModels'
import { canPartyAccess, buildPartyOrderAccessFilter } from '../helpers/partyRolePermissions'
import { isPartyTaskAssignee, taskFailure, taskIdOf, getPartyTaskDeadlineWarning, normalizePartyTaskInput, nextPartyTaskOccurrence, partyTaskZonedParts, transitionPartyTask } from '../helpers/partyTasks'

const inSession = (query, session) => session ? query.session(session) : query
const validDraftKey = (value) => /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(String(value || ''))
const taskHistory = (context, action, fromStatus = '', toStatus = '') => ({ action, staffId: taskActorId(context), userId: context.sessionUser?._id || null, at: new Date(), fromStatus, toStatus })

export const taskJson = (data, status = 200) => NextResponse.json({ success: true, data }, { status })
export const taskId = (value) => {
  if (!isValidObjectId(value)) taskFailure('Некорректный идентификатор задачи')
  return String(value)
}
export const withTaskContext = (handler) => async (req, route) => {
  try {
    const { context, error } = await getPartyRequestContext({ req, allowLocationOwner: true })
    if (error) return error
    if (!canPartyAccess(context, { resource: 'tasks', action: 'read' })) taskFailure('Нет доступа к задачам', 403)
    return await handler(req, context, route)
  } catch (error) {
    return partyError(error.status || 500, error.code || 'partycrm_tasks_failed', error.status ? error.message : 'Не удалось обработать задачу')
  }
}

export const taskStaff = (context) => ({ ...context.staff, positionId: context.staff?.positionId || context.position?._id })
export const taskActorId = (context) => isValidObjectId(context.staff?._id) ? context.staff._id : null
export const canManageTask = (context) => canPartyAccess(context, { resource: 'tasks', action: 'edit' })
export const taskAssignmentFilter = (context) => {
  const staff = taskStaff(context)
  return { $or: [
    ...(isValidObjectId(staff._id) ? [{ assigneeStaffIds: staff._id }, { createdByStaffId: staff._id }] : []),
    ...(staff.positionId ? [{ assigneeRoleId: staff.positionId }] : []),
    ...(context.sessionUser?._id ? [{ createdByUserId: context.sessionUser._id }] : []),
  ] }
}
export const taskAssigned = (context, task) => isPartyTaskAssignee(task, taskStaff(context))
export const canReadTask = (context, task, order = null) => canPartyAccess(context, { resource: 'tasks' }) && taskIdOf(task.tenantId) === String(context.tenantId) && (!task.orderId || Boolean(order)) && canAccessTaskLocation(context, task, order) && (
  canManageTask(context) || taskAssigned(context, task) || taskIdOf(task.createdByStaffId) === taskIdOf(context.staff) || (task.createdByUserId && taskIdOf(task.createdByUserId) === taskIdOf(context.sessionUser))
)

export const canAccessTaskLocation = (context, task, order = null) => {
  if (context.role === 'owner' || context.role === 'admin' && !context.position) return true
  const scope = context.position?.orderScope || {}
  const locationId = taskIdOf(task.locationId || order?.locationId)
  if (context.role === 'location_owner' && !(context.staff?.locationIds || []).map(String).includes(locationId)) return false
  if (locationId && scope.locationIds?.length && !scope.locationIds.map(String).includes(locationId)) return false
  if (!locationId && !task.orderId && scope.includeUnlocated === false) return false
  return true
}

export const buildPartyTaskListAccessFilter = async (context) => {
  const tenantId = context.tenantId
  if (context.role === 'owner' || context.role === 'admin' && !context.position) return { tenantId, ...(!canManageTask(context) ? taskAssignmentFilter(context) : {}) }
  const scope = context.position?.orderScope || {}
  const locationIds = context.role === 'location_owner'
    ? (context.staff.locationIds || []).filter((id) => !scope.locationIds?.length || scope.locationIds.map(String).includes(String(id)))
    : scope.locationIds || []
  let locationFilter = {}
  if (locationIds.length) locationFilter = scope.includeUnlocated !== false && context.role !== 'location_owner' ? { $or: [{ locationId: { $in: locationIds } }, { locationId: null }] } : { locationId: { $in: locationIds } }
  else if (context.role === 'location_owner') locationFilter = { _id: { $in: [] } }
  else if (scope.includeUnlocated === false) locationFilter = { locationId: { $ne: null } }
  const Orders = await getPartyOrderModel()
  const [allowedOrders, locationOrders] = await Promise.all([
    Orders.find(buildPartyOrderAccessFilter(context)).select('_id').lean(),
    Orders.find({ tenantId, ...locationFilter }).select('_id').lean(),
  ])
  return { tenantId, $and: [
    ...(!canManageTask(context) ? [taskAssignmentFilter(context)] : []),
    { $or: [
      { $and: [{ orderId: null }, locationFilter] },
      { orderId: { $in: allowedOrders.map((order) => order._id) } },
      { $and: [{ orderId: { $in: locationOrders.map((order) => order._id) } }, taskAssignmentFilter(context)] },
    ] },
  ] }
}

export const loadTaskOrder = async (context, task, session = null) => {
  if (!task.orderId) return null
  const Orders = await getPartyOrderModel()
  return inSession(Orders.findOne({ _id: task.orderId, tenantId: context.tenantId }), session).lean()
}
export const canAccessTaskOrder = (context, order) => !order || canPartyAccess(context, { resource: 'orders', action: 'read', order })
export const loadVisibleTask = async (context, id) => {
  const Tasks = await getPartyTaskModel()
  const task = await Tasks.findOne({ _id: taskId(id), tenantId: context.tenantId }).lean()
  const order = task?.orderId ? await loadTaskOrder(context, task) : null
  if (!task || !canReadTask(context, task, order)) taskFailure('Задача не найдена', 404)
  return task
}

export const sanitizeTaskHtml = (html) => sanitizeHtml(html, {
  allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 's', 'u', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'a', 'img', 'code', 'pre'],
  allowedAttributes: { a: ['href', 'target', 'rel'], img: ['src', 'alt', 'title'] },
  allowedSchemes: ['https', 'http', 'mailto', 'tel'], allowProtocolRelative: false,
  transformTags: { a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }) },
  exclusiveFilter: (frame) => frame.tag === 'img' && !/^\/api\/party\/task-media\/[a-f\d]{24}$/i.test(frame.attribs.src || ''),
})
export const taskMediaIds = (html) => [...String(html || '').matchAll(/src="\/api\/party\/task-media\/([a-f\d]{24})"/gi)].map((match) => match[1])

export const serializeTask = (context, task, { order = null, staffById = new Map(), seriesRoot = null } = {}) => {
  const allowed = canReadTask(context, task, order) && canAccessTaskLocation(context, task, order) && (!task.orderId || Boolean(order && canAccessTaskOrder(context, order)))
  const writable = allowed && (!order || !['closed', 'canceled'].includes(order.status))
  const canEdit = writable && canManageTask(context)
  const canComplete = writable && canPartyAccess(context, { resource: 'tasks', action: 'complete' }) && (canManageTask(context) || taskAssigned(context, task)) && !['done', 'canceled'].includes(task.status)
  const result = { ...task }
  for (const field of ['calendarLinks', 'reminders', 'effectsLockToken', 'effectsLockUntil', 'effectsPending', 'pendingNotifications', 'recurrenceRevision', 'creationRequestHash', 'sourceKey', 'seriesTemplate', 'seriesPreview', 'seriesTemplateMediaTaskId', 'mediaSourceTaskId', 'legacySourceTitle', 'mediaRevision']) delete result[field]
  if (!allowed) {
    result.title = 'Задача по недоступному заказу'
    result.descriptionHtml = ''
    result.history = []
    result.dueAt = null
    result.assigneeStaffIds = []
    result.assigneeRoleId = null
  }
  return {
    ...result, _id: String(task._id),
    canEdit, canComplete,
    canCancel: writable && canPartyAccess(context, { resource: 'tasks', action: 'cancel' }) && !['done', 'canceled'].includes(task.status),
    blockedReason: allowed ? '' : 'Должность не имеет доступа к связанному заказу на его текущем этапе.',
    orderTitle: allowed && order ? (canPartyAccess(context, { resource: 'orders.title', order }) ? order.title : '') || (canPartyAccess(context, { resource: 'orders.serviceTitle', order }) ? order.serviceTitle : '') || 'Заказ' : '',
    deadlineWarning: allowed && order && canPartyAccess(context, { resource: 'orders.eventDate', order }) && canPartyAccess(context, { resource: 'orders.dateEnd', order }) ? getPartyTaskDeadlineWarning(task, order) : '',
    completedByName: staffById.get(taskIdOf(task.completedByStaffId)) || '',
    orphaned: canManageTask(context) && (!(task.assigneeStaffIds || []).length && !task.assigneeRoleId || (task.assigneeStaffIds || []).some((id) => !staffById.has(taskIdOf(id)))),
    seriesRootId: String(task.seriesId || task._id),
    seriesRecurrence: allowed ? (seriesRoot || task).recurrence : { frequency: 'none' },
    seriesActive: allowed && Boolean((seriesRoot || task).seriesActive),
    calendarWarning: (task.calendarLinks || []).some((link) => taskIdOf(link.staffId) === taskIdOf(context.staff) && link.error) ? 'Не удалось обновить личный календарь. Задача сохранена в CRM.' : '',
  }
}

export const validateTaskData = async (context, input, previous = {}, { session = null } = {}) => {
  const data = normalizePartyTaskInput(input, previous)
  data.descriptionHtml = sanitizeTaskHtml(data.descriptionHtml)
  const Staff = await getPartyStaffModel()
  if (!canPartyAccess(context, { resource: 'tasks', action: 'assign' }) && (data.assigneeRoleId || data.assigneeStaffIds.length !== 1 || data.assigneeStaffIds[0] !== taskIdOf(context.staff))) {
    const unchanged = previous._id && JSON.stringify(data.assigneeStaffIds) === JSON.stringify((previous.assigneeStaffIds || []).map(String)) && String(data.assigneeRoleId || '') === String(previous.assigneeRoleId || '')
    if (!unchanged) taskFailure('Нет права назначать задачи другим сотрудникам или должности', 403)
  }
  if (data.assigneeStaffIds.length && await inSession(Staff.countDocuments({ tenantId: context.tenantId, _id: { $in: data.assigneeStaffIds }, status: 'active' }), session) !== data.assigneeStaffIds.length) taskFailure('Выберите действующих сотрудников своей компании')
  if (data.assigneeRoleId) {
    const Roles = await getPartyRoleModel()
    if (!await inSession(Roles.exists({ _id: data.assigneeRoleId, tenantId: context.tenantId, active: true }), session)) taskFailure('Выберите действующую должность своей компании')
  }
  if (data.orderId) {
    const order = await loadTaskOrder(context, data, session)
    if (!order || !canAccessTaskOrder(context, order)) taskFailure('Нет доступа к указанному заказу', 403)
    if (['closed', 'canceled'].includes(order.status)) taskFailure('Нельзя менять задачи закрытого или отменённого заказа', 409)
    if (!data.locationId && order.locationId) data.locationId = taskIdOf(order.locationId)
    if (!canAccessTaskLocation(context, data, order)) taskFailure('Нет доступа к площадке задачи', 403)
  }
  if (data.locationId) {
    const Locations = await getPartyLocationModel()
    if (!await inSession(Locations.exists({ tenantId: context.tenantId, _id: data.locationId, status: { $ne: 'archived' } }), session)) taskFailure('Площадка не найдена')
  }
  if (!canAccessTaskLocation(context, data)) taskFailure('Нет доступа к площадке задачи', 403)
  const ids = [...new Set(taskMediaIds(data.descriptionHtml))]
  if (ids.length) {
    const Media = await getPartyTaskMediaModel()
    // Repeated instances share the media of their own series, never another task.
    const taskIds = [previous._id, previous.seriesId, previous.mediaSourceTaskId].filter(Boolean)
    const ownDraft = input.draftKey && /^[a-f\d-]{36}$/i.test(input.draftKey) ? { taskId: null, draftKey: input.draftKey, uploadedByUserId: context.sessionUser._id } : null
    const mediaFilter = { tenantId: context.tenantId, _id: { $in: ids }, $or: [
      ...(taskIds.length ? [{ taskId: { $in: taskIds } }] : []), ...(ownDraft ? [ownDraft] : []),
    ] }
    if (!mediaFilter.$or.length || await inSession(Media.countDocuments(mediaFilter), session) !== ids.length) taskFailure('Фотография не относится к этой задаче')
  }
  return data
}

export const taskRecurrenceFields = (data, context) => {
  const timeZone = context.company?.settings?.timeZone || 'Europe/Moscow'
  const recurrenceAnchorDay = data.dueAt ? partyTaskZonedParts(data.dueAt, timeZone).day : null
  return {
    timeZone, recurrenceAnchorDay,
    seriesActive: data.recurrence.frequency !== 'none',
    nextOccurrenceAt: nextPartyTaskOccurrence({ after: data.dueAt, recurrence: data.recurrence, timeZone, anchorDay: recurrenceAnchorDay }),
  }
}

export const ensurePartyOrderTasks = async ({ tenantId, order, session }) => {
  if (!order?._id) return
  const Tasks = await getPartyTaskModel()
  await Tasks.init()
  const records = [
    ...(order.additionalEvents || []).map((task, index) => ({
      sourceKey: `order:${order._id}:additional:${task._id || index}`,
      title: task.title || 'Задача', descriptionHtml: `<p>${sanitizeHtml(task.description || '', { allowedTags: [], allowedAttributes: {} })}</p>`,
      dueAt: task.date || null, status: task.done ? 'done' : order.status === 'canceled' ? 'canceled' : 'new',
      completedAt: task.doneAt || null, responsibleStaffId: task.responsibleStaffId || order.responsibleStaffId,
    })),
    ...(order.preparation?.items || []).map((task, index) => ({
      sourceKey: `order:${order._id}:preparation:${task._id || task.id || index}`,
      title: task.title || 'Подготовка', descriptionHtml: '', dueAt: task.dueAt || task.deadline || null,
      status: task.status === 'done' ? 'done' : order.status === 'canceled' ? 'canceled' : 'new',
      completedAt: task.doneAt || null, responsibleStaffId: task.responsibleStaffId || order.responsibleStaffId,
    })),
  ]
  for (const item of records) {
    const { responsibleStaffId, ...value } = item
    await Tasks.updateOne({ tenantId, sourceKey: item.sourceKey }, { $setOnInsert: {
      ...value, tenantId, orderId: order._id, locationId: order.locationId || null, assigneeStaffIds: isValidObjectId(responsibleStaffId) ? [responsibleStaffId] : [],
      legacySourceTitle: value.title,
      createdByStaffId: isValidObjectId(order.responsibleStaffId || responsibleStaffId) ? order.responsibleStaffId || responsibleStaffId : null,
      completedByStaffId: value.status === 'done' && isValidObjectId(responsibleStaffId) ? responsibleStaffId : null,
    } }, { upsert: true, ...(session ? { session } : {}) })
  }
}

export const cancelPartyOrderTasks = async ({ tenantId, orderId, staffId, userId = null }) => {
  const Tasks = await getPartyTaskModel()
  const safeStaffId = isValidObjectId(staffId) ? staffId : null
  const affected = await Tasks.find({ tenantId, orderId, status: { $in: ['new', 'in_progress'] } }).select('_id').lean()
  await Tasks.updateMany({ tenantId, orderId, status: { $in: ['new', 'in_progress'] } }, {
    $set: { status: 'canceled', seriesActive: false, nextOccurrenceAt: null, effectsPending: true }, $inc: { revision: 1 },
    $push: { history: { action: 'order_canceled', staffId: safeStaffId, userId: isValidObjectId(userId) ? userId : null, at: new Date(), toStatus: 'canceled' } },
  })
  await Tasks.updateMany({ tenantId, seriesActive: true, $or: [{ 'seriesTemplate.orderId': orderId }, { seriesTemplate: null, orderId }] }, { $set: { seriesActive: false, nextOccurrenceAt: null, effectsPending: true }, $inc: { recurrenceRevision: 1 } })
  const { syncPartyTaskEffects } = await import('./partyTaskEffects')
  for (const task of affected) await syncPartyTaskEffects({ tenantId, taskId: task._id, event: 'canceled' })
}

export const ensurePartyTaskDraft = async (context, draftKey) => {
  if (!validDraftKey(draftKey)) taskFailure('Для сохранения задачи нужен постоянный ключ черновика')
  const Drafts = await getPartyTaskDraftModel()
  await Drafts.init()
  const filter = { tenantId: context.tenantId, userId: context.sessionUser._id, draftKey }
  try { await Drafts.updateOne(filter, { $setOnInsert: { ...filter, taskId: null, revision: 0 } }, { upsert: true }) }
  catch (error) { if (error.code !== 11000) throw error }
  return { Drafts, filter }
}

const assertTaskWriteOrder = async (context, task, session) => {
  const order = await loadTaskOrder(context, task, session)
  if (task.orderId && (!order || !canAccessTaskOrder(context, order))) taskFailure('Должность не имеет доступа к связанному заказу', 403)
  if (!canAccessTaskLocation(context, task, order)) taskFailure('Нет доступа к площадке задачи', 403)
  if (order) {
    if (['closed', 'canceled'].includes(order.status)) taskFailure('Задачи закрытого или отменённого заказа нельзя изменять', 409)
    const Orders = await getPartyOrderModel()
    const lock = await Orders.updateOne({ _id: order._id, tenantId: context.tenantId, status: { $in: ['draft', 'active'] } }, { $inc: { taskScheduleRevision: 1 } }, { session })
    if (!lock.matchedCount) taskFailure('Заказ уже закрыт или отменён', 409)
  }
  return order
}

const creationHash = (data) => createHash('sha256').update(JSON.stringify(data)).digest('hex')
const verifyReplay = (existing, hash) => {
  if (existing.creationRequestHash !== hash) taskFailure('Этот ключ черновика уже использован для другой задачи', 409, 'partycrm_task_idempotency_conflict')
  return { task: existing, created: false }
}

export const createPartyTaskForContext = async (context, body, idempotencyKey = '') => {
  if (!canPartyAccess(context, { resource: 'tasks', action: 'create' })) taskFailure('Нет права создавать задачи', 403)
  const draftKey = body.draftKey || idempotencyKey
  const normalized = normalizePartyTaskInput(body)
  normalized.descriptionHtml = sanitizeTaskHtml(normalized.descriptionHtml)
  const hash = creationHash(normalized)
  const sourceKey = `create:${context.sessionUser._id}:${draftKey}`
  const Tasks = await getPartyTaskModel()
  const existing = await Tasks.findOne({ tenantId: context.tenantId, sourceKey }).lean()
  if (existing) return verifyReplay(existing, hash)
  const { Drafts, filter: draftFilter } = await ensurePartyTaskDraft(context, draftKey)
  const Media = await getPartyTaskMediaModel()
  await Promise.all([Tasks.init(), Media.init()])
  const session = await Tasks.db.startSession()
  let result
  try {
    result = await session.withTransaction(async () => {
      const draft = await Drafts.findOneAndUpdate(draftFilter, { $inc: { revision: 1 } }, { session, new: true }).lean()
      const replay = await Tasks.findOne({ tenantId: context.tenantId, sourceKey }).session(session).lean()
      if (replay) return verifyReplay(replay, hash)
      if (!draft || draft.taskId) taskFailure('Черновик уже сохранён. Откройте существующую задачу.', 409)
      const data = await validateTaskData(context, { ...body, draftKey }, {}, { session })
      await assertTaskWriteOrder(context, data, session)
      const recurrence = taskRecurrenceFields(data, context)
      const [document] = await Tasks.create([{ ...data, ...recurrence, tenantId: context.tenantId, sourceKey, creationRequestHash: hash, seriesTemplate: data.recurrence.frequency === 'none' ? null : data, createdByStaffId: taskActorId(context), createdByUserId: context.sessionUser._id, status: 'new', effectsPending: true, history: [taskHistory(context, 'created', '', 'new')] }], { session })
      const ids = [...new Set(taskMediaIds(data.descriptionHtml))]
      if (ids.length) {
        const attached = await Media.updateMany({ tenantId: context.tenantId, taskId: null, draftKey, uploadedByUserId: context.sessionUser._id, _id: { $in: ids } }, { $set: { taskId: document._id } }, { session })
        if (attached.matchedCount !== ids.length) taskFailure('Фотографии черновика уже изменились. Обновите задачу.', 409)
      }
      await Drafts.updateOne(draftFilter, { $set: { taskId: document._id } }, { session })
      return { task: document.toObject(), created: true }
    })
  } finally { await session.endSession() }
  if (result.created) {
    const { syncPartyTaskEffects } = await import('./partyTaskEffects')
    await syncPartyTaskEffects({ tenantId: context.tenantId, taskId: result.task._id, event: 'assigned' })
  }
  return result
}

export const mirrorPartyTaskToOrder = async ({ context, task, previous, session }) => {
  const match = /^order:([a-f\d]{24}):(additional|preparation):(.+)$/i.exec(task.sourceKey || '')
  if (!match) return
  const Orders = await getPartyOrderModel()
  const order = await Orders.findOne({ _id: match[1], tenantId: context.tenantId }).session(session).lean()
  if (!order) return
  const rows = match[2] === 'additional' ? order.additionalEvents || [] : order.preparation?.items || []
  let index = rows.findIndex((row) => taskIdOf(row._id) === match[3] || taskIdOf(row.id) === match[3])
  if (index < 0 && /^\d+$/.test(match[3])) {
    const candidate = Number(match[3])
    if (rows[candidate]?.title === (previous.legacySourceTitle || previous.title)) index = candidate
  }
  if (index < 0) return
  const prefix = match[2] === 'additional' ? `additionalEvents.${index}` : `preparation.items.${index}`
  const set = { [`${prefix}.title`]: task.title, [`${prefix}.responsibleStaffId`]: task.assigneeStaffIds?.[0] || null }
  if (match[2] === 'additional') Object.assign(set, { [`${prefix}.description`]: sanitizeHtml(task.descriptionHtml || '', { allowedTags: [], allowedAttributes: {} }), [`${prefix}.date`]: task.dueAt, [`${prefix}.done`]: ['done', 'canceled'].includes(task.status), [`${prefix}.doneAt`]: task.completedAt || null })
  else Object.assign(set, { [`${prefix}.dueAt`]: task.dueAt, [`${prefix}.status`]: ['done', 'canceled'].includes(task.status) ? 'done' : 'pending', [`${prefix}.completedAt`]: task.completedAt || null, [`${prefix}.completedByStaffId`]: task.completedByStaffId || null, 'preparation.updatedAt': new Date(), 'preparation.updatedByStaffId': taskActorId(context) })
  await Orders.updateOne({ _id: order._id, tenantId: context.tenantId }, { $set: set, ...(match[2] === 'preparation' ? { $inc: { 'preparation.revision': 1 } } : {}) }, { session })
}

const sameRecurrence = (first, second) => JSON.stringify({ frequency: first?.frequency || 'none', interval: first?.interval || 1, until: first?.until ? new Date(first.until).toISOString() : null }) === JSON.stringify({ frequency: second?.frequency || 'none', interval: second?.interval || 1, until: second?.until ? new Date(second.until).toISOString() : null })

const planSeriesChange = async ({ context, task, root, data, action, session, Tasks }) => {
  await assertTaskWriteOrder(context, root.seriesTemplate || root, session)
  const rootId = root._id
  const cutoff = new Date(task.occurrenceAt || task.dueAt || Date.now())
  const filter = { tenantId: context.tenantId, status: { $in: ['new', 'in_progress'] }, $and: [{ $or: [{ _id: rootId }, { seriesId: rootId }] }, ...(action === 'edit' ? [{ _id: { $ne: task._id } }, { $or: [{ occurrenceAt: { $gte: cutoff } }, { dueAt: { $gte: cutoff } }] }] : [])] }
  const affected = await Tasks.find(filter).session(session).limit(1001).lean()
  if (affected.length > 1000) taskFailure('В серии более 1000 открытых задач. Ограничьте период изменения.', 409)
  for (const candidate of affected) {
    const order = await loadTaskOrder(context, candidate, session)
    if (!canReadTask(context, candidate, order) || !canAccessTaskOrder(context, order)) taskFailure('В серии есть задачи вне области доступа вашей должности', 403)
    if (order && ['closed', 'canceled'].includes(order.status)) taskFailure('В серии есть задачи закрытого или отменённого заказа', 409)
  }
  const fingerprint = creationHash({ actor: taskIdOf(context.sessionUser), tenantId: context.tenantId, action, taskId: taskIdOf(task), taskRevision: task.revision, rootId: taskIdOf(root), generation: root.seriesGeneration || 0, rootRevision: root.revision, nextOccurrenceAt: root.nextOccurrenceAt, data, affected: affected.map((entry) => [taskIdOf(entry), entry.revision]).sort(([a], [b]) => a.localeCompare(b)) })
  return { filter, affected, fingerprint }
}

export const updatePartyTaskForContext = async (context, id, body) => {
  if (!Number.isSafeInteger(body.revision) || body.revision < 0) taskFailure('Обновите задачу перед сохранением', 409)
  const result = await withPartyTaskSeriesMutation({ tenantId: context.tenantId, taskId: taskId(id), work: async ({ session, task, rootId, Tasks }) => {
    const order = await assertTaskWriteOrder(context, task, session)
    if (!canReadTask(context, task, order)) taskFailure('Задача не найдена', 404)
    if (task.revision !== body.revision) taskFailure('Другой сотрудник уже изменил задачу. Обновите список.', 409)
    const action = body.action === 'preview_series_change' ? body.seriesAction : body.action || 'edit'
    const previewOnly = body.action === 'preview_series_change'
    const root = task.seriesId ? await Tasks.findOne({ _id: rootId, tenantId: context.tenantId }).session(session).lean() : task
    if (!root) taskFailure('Исходная серия не найдена', 409)
    const affectedIds = []
    let patch
    if (action === 'status') {
      if (previewOnly) taskFailure('Предпросмотр не нужен для отдельного статуса')
      const canCancel = canPartyAccess(context, { resource: 'tasks', action: 'cancel' })
      const canComplete = canPartyAccess(context, { resource: 'tasks', action: 'complete' }) && (canManageTask(context) || taskAssigned(context, task))
      if (body.status === 'canceled' ? !canCancel : !canComplete) taskFailure('Нет права изменить статус задачи', 403)
      patch = transitionPartyTask({ task, status: body.status, staffId: taskActorId(context), canManage: body.status === 'canceled' ? canCancel : canManageTask(context), canComplete })
      if (!patch) return { task, affectedIds: [], event: '' }
      patch.completedByUserId = body.status === 'done' ? context.sessionUser._id : null
    } else if (action === 'stop_series' || action === 'edit') {
      if (!canManageTask(context)) taskFailure('Нет права изменять задачи', 403)
      if (action === 'edit') {
        patch = await validateTaskData(context, body, task, { session })
        await assertTaskWriteOrder(context, patch, session)
      }
      const seriesChange = action === 'stop_series' || body.applyToSeries === true || previewOnly
      if (seriesChange) {
        if (!canPartyAccess(context, { resource: 'tasks', action: 'cancel' })) taskFailure('Для изменения будущих повторов нужно право отмены задач', 403)
        const plan = await planSeriesChange({ context, task, root, data: patch || null, action, session, Tasks })
        if (previewOnly) {
          const token = randomUUID()
          const expiresAt = new Date(Date.now() + 5 * 60000)
          await Tasks.updateOne({ _id: rootId, tenantId: context.tenantId }, { $set: { seriesPreview: { token, expiresAt, actorUserId: context.sessionUser._id, fingerprint: plan.fingerprint } } }, { session })
          const current = action === 'edit' && ['new', 'in_progress'].includes(task.status) ? [{ _id: String(task._id), title: task.title }] : []
          return { preview: { previewToken: token, expiresAt, affectedCount: plan.affected.length + current.length, affectedTasks: [...current, ...plan.affected.map((entry) => ({ _id: String(entry._id), title: entry.title }))], taskRevision: task.revision }, task, affectedIds: [], event: '' }
        }
        const preview = root.seriesPreview
        if (body.confirmSeriesChange !== true || !preview || body.previewToken !== preview.token || String(preview.actorUserId) !== String(context.sessionUser._id) || new Date(preview.expiresAt) <= new Date() || preview.fingerprint !== plan.fingerprint) taskFailure('Сначала проверьте список затронутых задач и явно подтвердите изменение серии', 409, 'partycrm_task_series_preview_required')
        // This product action is soft cancellation of the explicitly previewed
        // open instances only. No history, completed instance or media is deleted.
        await Tasks.updateMany(plan.filter, { $set: { status: 'canceled', effectsPending: true }, $inc: { revision: 1 }, $push: { history: taskHistory(context, action === 'stop_series' ? 'series_canceled' : 'series_replaced', '', 'canceled') } }, { session })
        affectedIds.push(...plan.affected.map((entry) => entry._id))
        if (action === 'stop_series') {
          await Tasks.updateOne({ _id: rootId, tenantId: context.tenantId }, { $set: { seriesActive: false, nextOccurrenceAt: null, seriesPreview: null }, $inc: { recurrenceRevision: 1 } }, { session })
          const updated = await Tasks.findOne({ _id: task._id, tenantId: context.tenantId }).session(session).lean()
          return { task: updated, affectedIds, event: 'canceled' }
        }
        const recurrence = taskRecurrenceFields(patch, context)
        await Tasks.updateOne({ _id: rootId, tenantId: context.tenantId }, { $set: { seriesTemplate: { ...patch }, seriesTemplateMediaTaskId: task._id, recurrence: patch.recurrence, ...recurrence, seriesPreview: null }, $inc: { seriesGeneration: 1, recurrenceRevision: 1 } }, { session })
        if (['done', 'canceled'].includes(task.status)) return { task, affectedIds, event: 'updated' }
        if (task.seriesId) patch.recurrence = task.recurrence
      } else if (root.seriesActive || task.seriesId || task.recurrence?.frequency !== 'none') {
        if (!sameRecurrence(patch.recurrence, task.recurrence)) taskFailure('Для изменения повторов выберите «Текущая и будущие задачи»')
        if (!task.seriesId && (String(patch.orderId || '') !== String(task.orderId || '') || String(patch.locationId || '') !== String(task.locationId || ''))) taskFailure('Для переноса серии в другой заказ или площадку выберите «Текущая и будущие задачи»')
        if (!root.seriesTemplate && root.seriesActive) await Tasks.updateOne({ _id: rootId, tenantId: context.tenantId }, { $set: { seriesTemplate: normalizePartyTaskInput({}, root) } }, { session })
      } else Object.assign(patch, taskRecurrenceFields(patch, context), { seriesTemplate: patch.recurrence.frequency === 'none' ? null : { ...patch } })
    } else taskFailure('Неизвестное действие')
    const updated = await Tasks.findOneAndUpdate({ _id: task._id, tenantId: context.tenantId, revision: body.revision }, { $set: { ...patch, effectsPending: true }, $inc: { revision: 1 }, $push: { history: taskHistory(context, action, task.status, patch.status || task.status) } }, { new: true, runValidators: true, session }).lean()
    if (!updated) taskFailure('Другой сотрудник уже изменил задачу. Обновите список.', 409)
    await mirrorPartyTaskToOrder({ context, task: updated, previous: task, session })
    return { task: updated, affectedIds, event: action === 'status' ? updated.status : 'updated' }
  } })
  if (!result) taskFailure('Задача не найдена', 404)
  if (result.preview) return result.preview
  const { syncPartyTaskEffects } = await import('./partyTaskEffects')
  for (const affectedId of result.affectedIds) await syncPartyTaskEffects({ tenantId: context.tenantId, taskId: affectedId, event: 'canceled' })
  if (result.event && !result.affectedIds.some((entry) => String(entry) === String(result.task._id))) await syncPartyTaskEffects({ tenantId: context.tenantId, taskId: result.task._id, event: result.event })
  return result.task
}
