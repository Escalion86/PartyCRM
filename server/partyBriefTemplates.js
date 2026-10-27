import { NextResponse } from 'next/server'
import { PRODUCTS } from './productContext'
import { getProductModel } from './productDbConnect'
import partyBriefTemplatesSchema from '@schemas/partyBriefTemplatesSchema'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import {
  copyPartyBriefValues,
  getPartyApplicableBriefFields,
  getPartyArchivedBriefAnswers,
  getPartyBriefMissingFields,
  getPartyDefaultBriefTemplate,
  PARTY_BRIEF_FIELD_TYPES,
  PARTY_LEGACY_BRIEF_FIELDS,
  resolvePartyBriefTemplate,
} from '@helpers/partyBriefTemplates'
import { getPartyRequestContext, isValidObjectId, partyError } from './partyApi'
import { getPartyOrderModel, getPartyServiceModel } from './partyModels'

const fail = (status, code, message) => {
  throw Object.assign(new Error(message), { status, code })
}
export const getPartyBriefTemplateModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'BriefTemplate',
    collectionName: 'briefTemplates',
    schemaDefinition: partyBriefTemplatesSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) =>
      schema.index({ tenantId: 1, revision: 1 }, { unique: true }),
  })

export const getPartyBriefTemplate = async (tenantId) => {
  const Templates = await getPartyBriefTemplateModel()
  return (
    (await Templates.findOne({ tenantId }).sort({ revision: -1 }).lean()) ||
    getPartyDefaultBriefTemplate()
  )
}

export const getPartyBriefTemplateForOrder = async ({ tenantId, order }) => {
  if (!order || String(order.tenantId) !== String(tenantId))
    fail(404, 'partycrm_order_not_found', 'Заказ не найден')
  const template =
    order.status === 'closed' ? null : await getPartyBriefTemplate(tenantId)
  const resolved = resolvePartyBriefTemplate(
    order.eventBrief,
    template,
    order.status
  )
  return {
    ...resolved,
    applicableFieldIds: getPartyApplicableBriefFields(
      resolved,
      order.servicesIds || []
    ).map((field) => field.id),
  }
}

export const validatePartyBriefForTransition = async ({ tenantId, order }) => {
  const template = await getPartyBriefTemplateForOrder({ tenantId, order })
  const missingFields = getPartyBriefMissingFields(
    order.eventBrief,
    template,
    order.servicesIds || []
  )
  return { ok: missingFields.length === 0, missingFields, template }
}

export const snapshotPartyBriefForClose = async ({ tenantId, order }) => {
  const template = await getPartyBriefTemplateForOrder({ tenantId, order })
  return {
    ...copyPartyBriefValues(order.eventBrief || {}),
    templateSnapshot: {
      title: template.title,
      revision: template.revision,
      fields: copyPartyBriefValues(template.fields),
      retiredFields: copyPartyBriefValues(template.retiredFields || []),
      applicableFieldIds: template.applicableFieldIds,
      applicabilityFrozen: true,
    },
  }
}

const normalizeFields = (fields) => {
  if (!Array.isArray(fields) || fields.length > 100)
    fail(400, 'partycrm_invalid_brief_fields', 'Допускается до 100 вопросов')
  const used = new Set()
  return fields.map((field) => {
    if (
      !field ||
      typeof field.id !== 'string' ||
      !/^[a-zA-Z][a-zA-Z0-9_-]{0,79}$/.test(field.id) ||
      used.has(field.id)
    )
      fail(
        400,
        'partycrm_invalid_brief_field',
        'У каждого вопроса должен быть уникальный идентификатор'
      )
    used.add(field.id)
    const label = typeof field.label === 'string' ? field.label.trim() : ''
    if (
      !label ||
      label.length > 240 ||
      !Object.hasOwn(PARTY_BRIEF_FIELD_TYPES, field.type)
    )
      fail(
        400,
        'partycrm_invalid_brief_field',
        'Укажите название и тип вопроса'
      )
    const options = Array.isArray(field.options)
      ? [
          ...new Set(
            field.options
              .map((option) =>
                typeof option === 'string' ? option.trim() : ''
              )
              .filter(Boolean)
          ),
        ]
      : []
    if (
      field.type === 'select' &&
      (!options.length ||
        options.length > 50 ||
        options.some((option) => option.length > 200))
    )
      fail(
        400,
        'partycrm_invalid_brief_options',
        'Укажите от 1 до 50 вариантов ответа, каждый до 200 символов'
      )
    const legacyKey = field.legacyKey || null
    if (
      legacyKey &&
      !PARTY_LEGACY_BRIEF_FIELDS.some((entry) => entry.legacyKey === legacyKey)
    )
      fail(
        400,
        'partycrm_invalid_brief_binding',
        'Некорректная связь с прежним вопросом'
      )
    const rawServiceIds = field.serviceIds ?? []
    if (
      !Array.isArray(rawServiceIds) ||
      rawServiceIds.length > 200 ||
      rawServiceIds.some((id) => typeof id !== 'string' || !isValidObjectId(id))
    )
      fail(
        400,
        'partycrm_invalid_brief_services',
        'Выберите корректные услуги для вопроса'
      )
    const serviceIds = [
      ...new Set(rawServiceIds.map((id) => id.toLowerCase())),
    ].sort()
    return {
      id: field.id,
      label,
      type: field.type,
      options: field.type === 'select' ? options : [],
      legacyKey,
      required: field.required !== false,
      serviceIds,
    }
  })
}

export const planPartyBriefTemplateUpdate = (previous, body) => {
  const fields = normalizeFields(body.fields)
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title || title.length > 180)
    fail(
      400,
      'partycrm_invalid_brief_title',
      'Укажите название формы до 180 символов'
    )
  const previousById = new Map(
    [...(previous.retiredFields || []), ...(previous.fields || [])].map(
      (field) => [field.id, field]
    )
  )
  for (const field of fields) {
    const old = previousById.get(field.id)
    if (
      old &&
      (old.type !== field.type || (old.legacyKey || null) !== field.legacyKey)
    )
      fail(
        400,
        'partycrm_brief_field_type_changed',
        'Для нового типа создайте отдельный вопрос: прежние ответы должны сохранять свой смысл'
      )
  }
  const nextIds = new Set(fields.map((field) => field.id))
  const removed = (previous.fields || []).filter(
    (field) => !nextIds.has(field.id)
  )
  const retired = new Map(
    (previous.retiredFields || [])
      .filter((field) => !nextIds.has(field.id))
      .map((field) => [field.id, field])
  )
  for (const field of removed) {
    const choice = body.removedFieldPolicy?.[field.id]
    if (!['archive', 'keep'].includes(choice))
      fail(
        400,
        'partycrm_brief_removal_decision_required',
        `Выберите, оставить ли вопрос «${field.label}» или убрать с сохранением ответов`
      )
    if (choice === 'keep') fields.push(field)
    else
      retired.set(field.id, {
        ...field,
        retiredAtRevision: previous.revision + 1,
      })
  }
  return {
    title,
    fields,
    retiredFields: [...retired.values()],
    removedFields: removed.filter(
      (field) => body.removedFieldPolicy?.[field.id] === 'archive'
    ),
  }
}

export const publishPartyBriefTemplate = async ({ context, body }) => {
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0)
    fail(
      400,
      'partycrm_brief_revision_required',
      'Обновите форму перед сохранением'
    )
  const previous = await getPartyBriefTemplate(context.tenantId)
  if (previous.revision !== body.expectedRevision)
    fail(
      409,
      'partycrm_brief_revision_conflict',
      'Форма уже изменена. Обновите настройки.'
    )
  const plan = planPartyBriefTemplateUpdate(previous, body)
  const previousServiceIds = new Set(
    [...(previous.fields || []), ...(previous.retiredFields || [])]
      .flatMap((field) => field.serviceIds || [])
      .map(String)
  )
  const addedServiceIds = [
    ...new Set(plan.fields.flatMap((field) => field.serviceIds || [])),
  ].filter((id) => !previousServiceIds.has(id))
  if (addedServiceIds.length) {
    const Services = await getPartyServiceModel()
    const services = await Services.find({
      tenantId: context.tenantId,
      _id: { $in: addedServiceIds },
    })
      .select('_id')
      .lean()
    const found = new Set(services.map((service) => String(service._id)))
    if (addedServiceIds.some((id) => !found.has(id)))
      fail(
        400,
        'partycrm_invalid_brief_services',
        'Некоторые услуги недоступны в этой компании. Проверьте условия вопросов.'
      )
  }
  if (body.preview === true) {
    const Orders = await getPartyOrderModel()
    const openOrders = await Orders.find({
      tenantId: context.tenantId,
      status: { $ne: 'closed' },
    })
      .select('_id eventBrief')
      .lean()
    return {
      ...plan,
      affectedOpenOrders: openOrders.length,
      archivedAnswerCount: openOrders.reduce(
        (sum, order) =>
          sum + getPartyArchivedBriefAnswers(order.eventBrief, plan).length,
        0
      ),
      previousRevision: previous.revision,
    }
  }
  const Templates = await getPartyBriefTemplateModel()
  try {
    const published = await Templates.create({
      tenantId: context.tenantId,
      title: plan.title,
      fields: plan.fields,
      retiredFields: plan.retiredFields,
      revision: previous.revision + 1,
      publishedByStaffId: isValidObjectId(context.staff?._id)
        ? context.staff._id
        : null,
    })
    return published.toObject()
  } catch (error) {
    if (error?.code === 11000)
      fail(
        409,
        'partycrm_brief_revision_conflict',
        'Форма уже изменена. Обновите настройки.'
      )
    throw error
  }
}

export const partyBriefTemplateRoute =
  (handler, write = false) =>
  async (req) => {
    const { context, error } = await getPartyRequestContext({
      req,
      managementOnly: write,
      allowLocationOwner: !write,
      permissionAware: true,
    })
    if (error) return error
    try {
      if (
        write &&
        !canPartyAccess(context, { resource: 'brief.manage', action: 'edit' })
      )
        fail(403, 'partycrm_forbidden', 'Нет права изменять форму брифа')
      return NextResponse.json({
        success: true,
        data: await handler(req, context),
      })
    } catch (error) {
      return partyError(
        error.status || 500,
        error.status ? error.code : 'partycrm_brief_template_failed',
        error.status ? error.message : 'Не удалось получить форму брифа',
        error.status === 403 ? 'permission' : 'validation'
      )
    }
  }

export const readPartyBriefTemplate = async (req, context) => {
  const orderId = new URL(req.url).searchParams.get('orderId')
  if (!orderId) {
    if (!['owner', 'admin'].includes(context.role))
      fail(403, 'partycrm_forbidden', 'Выберите доступный заказ')
    const template = await getPartyBriefTemplate(context.tenantId)
    const canManage = canPartyAccess(context, {
      resource: 'brief.manage',
      action: 'edit',
    })
    const Services = canManage ? await getPartyServiceModel() : null
    const services = Services
      ? await Services.find({ tenantId: context.tenantId })
          .select('_id title status')
          .lean()
      : []
    return {
      ...template,
      canManage,
      serviceOptions: services.map((service) => ({
        _id: String(service._id),
        title: service.title || 'Услуга',
        status: service.status,
      })),
    }
  }
  if (!isValidObjectId(orderId))
    fail(400, 'partycrm_invalid_order_id', 'Некорректный заказ')
  const Orders = await getPartyOrderModel()
  const order = await Orders.findOne({
    _id: orderId,
    tenantId: context.tenantId,
  }).lean()
  if (
    !order ||
    !canPartyAccess(context, { resource: 'orders.eventBrief', order })
  )
    fail(404, 'partycrm_order_not_found', 'Заказ не найден')
  const template = await getPartyBriefTemplateForOrder({
    tenantId: context.tenantId,
    order,
  })
  if (canPartyAccess(context, { resource: 'orders.servicesIds', order }))
    return template
  const withoutConditions = (fields) =>
    (fields || []).map(({ serviceIds: _serviceIds, ...field }) => field)
  return {
    ...template,
    fields: withoutConditions(template.fields),
    retiredFields: withoutConditions(template.retiredFields),
  }
}
