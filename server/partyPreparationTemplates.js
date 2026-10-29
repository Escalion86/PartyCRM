import { createHash } from 'node:crypto'
import sanitizeHtml from 'sanitize-html'
import { getPartyPreparationTemplateModel } from './partyPreparationTemplateModels'
import { getPartyTaskModel } from './partyTaskModels'
import {
  getPartyOrderModel,
  getPartyStaffModel,
  getPartyRoleModel,
} from './partyModels'
import { getPartyRequestContext, partyError } from './partyApi'
import { NextResponse } from 'next/server'
import {
  canPartyAccess,
  buildPartyOrderAccessFilter,
  isPartyRestrictedManagementContext,
} from '../helpers/partyRolePermissions'
import {
  canAccessTaskLocation,
  taskActorId,
  validateTaskData,
} from './partyTasks'
import { getPartyOrderWriteGuard } from '../helpers/partyOrderWriteGuard'
import {
  normalizePartyPreparationTemplate,
  preparationTemplateId,
  preparationTemplateFailure,
  buildPartyPreparationTemplatePreview,
} from '../helpers/partyPreparationTemplates'

const sessionQuery = (query, session) =>
  session ? query.session(session) : query
const management = (context) =>
  ['owner', 'admin'].includes(context.role) &&
  !isPartyRestrictedManagementContext(context)
const canUse = (context) =>
  ['tasks', 'tasks.create', 'tasks.assign'].every((resource) =>
    canPartyAccess(context, {
      resource,
      action: resource === 'tasks' ? 'read' : 'edit',
    })
  )
export const preparationTemplateJson = (data, status = 200) =>
  NextResponse.json(
    { success: true, data },
    { status, headers: { 'Cache-Control': 'private, no-store' } }
  )
export const readPreparationTemplateBody = async (req) => {
  let body
  try {
    body = await req.json()
  } catch {
    preparationTemplateFailure('Не удалось прочитать JSON запроса')
  }
  if (!body || typeof body !== 'object' || Array.isArray(body))
    preparationTemplateFailure('Ожидается объект JSON')
  return body
}
export const withPreparationTemplateContext =
  (handler, manage = false) =>
  async (req, route) => {
    try {
      const { context, error } = await getPartyRequestContext({
        req,
        allowLocationOwner: true,
      })
      if (error) return error
      if (manage ? !management(context) : !canUse(context))
        preparationTemplateFailure('Нет доступа к шаблонам задач', 403)
      return await handler(req, context, route)
    } catch (error) {
      return partyError(
        error.status || 500,
        error.code || 'partycrm_preparation_template_failed',
        error.status ? error.message : 'Не удалось обработать шаблон задач'
      )
    }
  }
const serializeTemplate = (template) => ({
  _id: String(template._id),
  title: template.title,
  active: template.active,
  revision: Number(template.revision || 0),
  items: template.items.map((item) => ({
    id: item.id,
    title: item.title,
    descriptionHtml: item.descriptionHtml || '',
    offsetMinutes: item.offsetMinutes ?? null,
    assigneeStaffIds: (item.assigneeStaffIds || []).map(String),
    assigneeRoleId: item.assigneeRoleId ? String(item.assigneeRoleId) : null,
  })),
})
const validateAssignees = async (context, items, session = null) => {
  const [Staff, Roles] = await Promise.all([
    getPartyStaffModel(),
    getPartyRoleModel(),
  ])
  const staffIds = [...new Set(items.flatMap((item) => item.assigneeStaffIds))]
  const roleIds = [
    ...new Set(items.map((item) => item.assigneeRoleId).filter(Boolean)),
  ]
  if (
    staffIds.length &&
    (await sessionQuery(
      Staff.countDocuments({
        tenantId: context.tenantId,
        _id: { $in: staffIds },
        status: 'active',
      }),
      session
    )) !== staffIds.length
  )
    preparationTemplateFailure(
      'Выберите действующих сотрудников своей компании'
    )
  if (
    roleIds.length &&
    (await sessionQuery(
      Roles.countDocuments({
        tenantId: context.tenantId,
        _id: { $in: roleIds },
        active: true,
      }),
      session
    )) !== roleIds.length
  )
    preparationTemplateFailure('Выберите действующие должности своей компании')
}
const normalize = (body) => {
  const data = normalizePartyPreparationTemplate(body)
  data.items = data.items.map((item) => ({
    ...item,
    descriptionHtml: sanitizeHtml(item.descriptionHtml, {
      allowedTags: [
        'p',
        'br',
        'strong',
        'b',
        'em',
        'i',
        'u',
        's',
        'ul',
        'ol',
        'li',
        'blockquote',
        'a',
      ],
      allowedAttributes: { a: ['href'] },
      allowedSchemes: ['https', 'http', 'mailto', 'tel'],
      allowProtocolRelative: false,
    }),
  }))
  return data
}
export const listPartyPreparationTemplates = async (req, context) => {
  const manage = new URL(req.url).searchParams.get('manage') === '1'
  if (manage && !management(context))
    preparationTemplateFailure(
      'Настройка шаблонов доступна владельцу и администратору с полным доступом',
      403
    )
  const [Templates, Staff, Roles] = await Promise.all([
    getPartyPreparationTemplateModel(),
    getPartyStaffModel(),
    getPartyRoleModel(),
  ])
  const [templates, staff, roles] = await Promise.all([
    Templates.find({
      tenantId: context.tenantId,
      ...(manage ? {} : { active: true }),
    })
      .sort({ active: -1, title: 1, _id: 1 })
      .limit(101)
      .lean(),
    Staff.find({ tenantId: context.tenantId, status: 'active' })
      .select('_id firstName secondName positionId')
      .sort({ firstName: 1 })
      .lean(),
    Roles.find({ tenantId: context.tenantId, active: true })
      .select('_id title')
      .sort({ title: 1 })
      .lean(),
  ])
  return preparationTemplateJson({
    templates: templates.slice(0, 100).map(serializeTemplate),
    hasMore: templates.length > 100,
    canManage: management(context),
    staff: staff.map((person) => ({
      _id: String(person._id),
      name:
        [person.firstName, person.secondName].filter(Boolean).join(' ') ||
        'Сотрудник',
    })),
    roles: roles.map((role) => ({ _id: String(role._id), title: role.title })),
  })
}
export const savePartyPreparationTemplate = async (
  context,
  body,
  id = null
) => {
  if (!management(context))
    preparationTemplateFailure('Нет доступа к настройке шаблонов', 403)
  const Templates = await getPartyPreparationTemplateModel()
  const data = normalize(body)
  if (data.active) await validateAssignees(context, data.items)
  if (!id) {
    if ((await Templates.countDocuments({ tenantId: context.tenantId })) >= 100)
      preparationTemplateFailure('Достигнут лимит 100 шаблонов')
    const template = await Templates.create({
      ...data,
      tenantId: context.tenantId,
      createdByStaffId: taskActorId(context),
      updatedByStaffId: taskActorId(context),
    })
    return preparationTemplateJson(serializeTemplate(template.toObject()), 201)
  }
  if (!Number.isInteger(body.expectedRevision) || body.expectedRevision < 0)
    preparationTemplateFailure('Обновите шаблон перед сохранением')
  const template = await Templates.findOneAndUpdate(
    {
      _id: preparationTemplateId(id),
      tenantId: context.tenantId,
      revision: body.expectedRevision,
    },
    {
      $set: { ...data, updatedByStaffId: taskActorId(context) },
      $inc: { revision: 1 },
    },
    { new: true, runValidators: true }
  ).lean()
  if (!template)
    preparationTemplateFailure(
      'Шаблон изменён другим сотрудником. Обновите список.',
      409
    )
  return preparationTemplateJson(serializeTemplate(template))
}
const loadPlan = async (context, orderId, templateId, session = null) => {
  if (!canUse(context))
    preparationTemplateFailure('Нет права создавать и назначать задачи', 403)
  const [Orders, Templates, Tasks] = await Promise.all([
    getPartyOrderModel(),
    getPartyPreparationTemplateModel(),
    getPartyTaskModel(),
  ])
  const scope = buildPartyOrderAccessFilter(context)
  const order = await sessionQuery(
    Orders.findOne({
      ...scope,
      _id: preparationTemplateId(orderId),
      tenantId: context.tenantId,
    }),
    session
  ).lean()
  if (
    !order ||
    !canPartyAccess(context, { resource: 'orders', order }) ||
    !canAccessTaskLocation(context, { locationId: order.locationId }, order)
  )
    preparationTemplateFailure('Заказ не найден', 404)
  if (['closed', 'canceled'].includes(order.status))
    preparationTemplateFailure(
      'Нельзя добавлять задачи в закрытый или отменённый заказ',
      409
    )
  const template = await sessionQuery(
    Templates.findOne({
      _id: preparationTemplateId(templateId),
      tenantId: context.tenantId,
      active: true,
    }),
    session
  ).lean()
  if (!template) preparationTemplateFailure('Шаблон недоступен', 404)
  if (
    template.items.some((item) => item.offsetMinutes !== null) &&
    !canPartyAccess(context, { resource: 'orders.eventDate', order })
  )
    preparationTemplateFailure(
      'Для расчёта сроков нужен доступ к дате мероприятия',
      403
    )
  // Only source keys are read: completed, renamed or canceled tasks remain applied.
  const prefix = `order:${String(order._id)}:template:${String(template._id)}:`
  const existing = await sessionQuery(
    Tasks.find({
      tenantId: context.tenantId,
      orderId: order._id,
      sourceKey: { $in: template.items.map((item) => prefix + item.id) },
    }).select('sourceKey'),
    session
  ).lean()
  await validateAssignees(context, template.items, session)
  const items = buildPartyPreparationTemplatePreview({
    template: serializeTemplate(template),
    order,
    existingSourceKeys: existing.map((task) => task.sourceKey),
  })
  const pending = items.filter((item) => !item.alreadyCreated)
  for (const item of pending)
    await validateTaskData(
      context,
      {
        ...item,
        orderId: String(order._id),
        locationId: order.locationId ? String(order.locationId) : null,
        recurrence: { frequency: 'none' },
      },
      {},
      { session }
    )
  const previewToken = createHash('sha256')
    .update(
      JSON.stringify({
        templateId: String(template._id),
        templateRevision: template.revision || 0,
        items: template.items,
        orderId: String(order._id),
        orderUpdatedAt: order.updatedAt || null,
        eventDate: order.eventDate || null,
        sources: existing.map((task) => task.sourceKey).sort(),
      })
    )
    .digest('hex')
  return {
    Orders,
    Templates,
    Tasks,
    order,
    template,
    items,
    pending,
    previewToken,
  }
}
const publicPlan = (plan, context) => ({
  templateId: String(plan.template._id),
  title: plan.template.title,
  previewToken: plan.previewToken,
  items: plan.items.map(({ sourceKey: _sourceKey, afterEvent, ...item }) =>
    item.alreadyCreated
      ? {
          id: item.id,
          title: item.title,
          alreadyCreated: true,
          dueAt: null,
          overdue: false,
        }
      : {
          ...item,
          ...(canPartyAccess(context, {
            resource: 'orders.dateEnd',
            order: plan.order,
          })
            ? { afterEvent }
            : {}),
        }
  ),
  createCount: plan.pending.length,
  skipCount: plan.items.length - plan.pending.length,
  timeZone: context.company?.settings?.timeZone || 'Europe/Moscow',
})
export const applyPartyPreparationTemplate = async (
  context,
  orderId,
  body,
  dependencies = {}
) => {
  if (!['preview', 'apply'].includes(body.action))
    preparationTemplateFailure('Выберите действие с шаблоном')
  if (body.action === 'preview')
    return preparationTemplateJson(
      publicPlan(await loadPlan(context, orderId, body.templateId), context)
    )
  if (!/^[a-f\d]{64}$/.test(String(body.previewToken || '')))
    preparationTemplateFailure('Сначала проверьте задачи в предпросмотре')
  const Tasks = await getPartyTaskModel()
  await Tasks.init()
  const session = await Tasks.db.startSession()
  let result
  try {
    result = await session.withTransaction(async () => {
      const plan = await loadPlan(context, orderId, body.templateId, session)
      if (plan.previewToken !== body.previewToken)
        preparationTemplateFailure(
          'Заказ, шаблон или задачи изменились. Проверьте новый предпросмотр.',
          409,
          'partycrm_preparation_preview_changed'
        )
      if (!plan.pending.length)
        return { createdIds: [], skippedCount: plan.items.length }
      const orderLock = await plan.Orders.updateOne(
        {
          _id: plan.order._id,
          tenantId: context.tenantId,
          ...getPartyOrderWriteGuard(plan.order),
          status: { $in: ['draft', 'active'] },
        },
        { $inc: { taskScheduleRevision: 1 } },
        { session }
      )
      if (!orderLock.matchedCount)
        preparationTemplateFailure(
          'Заказ изменился. Проверьте новый предпросмотр.',
          409
        )
      const templateLock = await plan.Templates.updateOne(
        {
          _id: plan.template._id,
          tenantId: context.tenantId,
          revision: plan.template.revision || 0,
          active: true,
        },
        { $inc: { applicationRevision: 1 } },
        { session }
      )
      if (!templateLock.matchedCount)
        preparationTemplateFailure(
          'Шаблон изменился. Проверьте новый предпросмотр.',
          409
        )
      const at = new Date()
      const documents = await Tasks.create(
        plan.pending.map((item) => ({
          tenantId: context.tenantId,
          title: item.title,
          descriptionHtml: item.descriptionHtml,
          orderId: plan.order._id,
          locationId: plan.order.locationId || null,
          assigneeStaffIds: item.assigneeStaffIds,
          assigneeRoleId: item.assigneeRoleId,
          dueAt: item.dueAt,
          sourceKey: item.sourceKey,
          status: 'new',
          revision: 0,
          recurrence: { frequency: 'none', interval: 1 },
          seriesActive: false,
          effectsPending: true,
          pendingNotifications: [
            { key: '0:assigned', revision: 0, event: 'assigned' },
          ],
          timeZone: context.company?.settings?.timeZone || 'Europe/Moscow',
          createdByStaffId: taskActorId(context),
          createdByUserId: context.sessionUser._id,
          history: [
            {
              action: 'created',
              staffId: taskActorId(context),
              userId: context.sessionUser._id,
              at,
              fromStatus: '',
              toStatus: 'new',
            },
          ],
        })),
        { session, ordered: true }
      )
      return {
        createdIds: documents.map((task) => String(task._id)),
        skippedCount: plan.items.length - plan.pending.length,
      }
    })
  } catch (error) {
    if (error.code === 20 || error.codeName === 'IllegalOperation')
      preparationTemplateFailure(
        'Сервер пока не поддерживает безопасное применение шаблонов. Обратитесь к администратору.',
        503,
        'partycrm_preparation_transaction_required'
      )
    if (error.code === 11000)
      preparationTemplateFailure(
        'Задачи уже добавлены другим сотрудником. Обновите предпросмотр.',
        409,
        'partycrm_preparation_preview_changed'
      )
    throw error
  } finally {
    await session.endSession()
  }
  let effectsWarning = false
  try {
    const syncEffects =
      dependencies.syncEffects ||
      (await import('./partyTaskEffects')).syncPartyTaskEffects
    for (const taskId of result.createdIds) {
      try {
        if (
          (
            await syncEffects({
              tenantId: context.tenantId,
              taskId,
              event: 'assigned',
            })
          )?.failed
        )
          effectsWarning = true
      } catch {
        effectsWarning = true
      }
    }
  } catch {
    effectsWarning = result.createdIds.length > 0
  }
  return preparationTemplateJson({
    createdCount: result.createdIds.length,
    skippedCount: result.skippedCount,
    effectsWarning,
  })
}
