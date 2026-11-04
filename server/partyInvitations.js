import { randomBytes } from 'node:crypto'
import { Schema } from 'mongoose'
import { NextResponse } from 'next/server'
import { PRODUCTS } from './productContext'
import { getProductModel } from './productDbConnect'
import { getPartyRequestContext, parseJsonBody, partyError } from './partyApi'
import {
  getPartyOrderModel,
  getPartyLocationModel,
  getPartyCompanyModel,
  getPartyOrderTypeModel,
} from './partyModels'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'
import { partyBookingFailure } from '../helpers/partyOrderBooking.js'

const templateSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  title: { type: String, required: true, maxlength: 180 },
  content: { type: Schema.Types.Mixed, required: true },
  revision: { type: Number, default: 0 },
}
const invitationSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  orderId: { type: Schema.Types.ObjectId, required: true },
  templateId: { type: Schema.Types.ObjectId, default: null },
  snapshot: { type: Schema.Types.Mixed, required: true },
  token: { type: String, required: true },
  published: { type: Boolean, default: false },
  revision: { type: Number, default: 0 },
}
export const getPartyInvitationTemplateModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'InvitationTemplate',
    collectionName: 'invitationTemplates',
    schemaDefinition: templateSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => schema.index({ tenantId: 1, title: 1 }),
  })
export const getPartyInvitationModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'Invitation',
    collectionName: 'invitations',
    schemaDefinition: invitationSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, orderId: 1 }, { unique: true })
      schema.index({ token: 1 }, { unique: true })
    },
  })

export const defaultPartyInvitationContent = () => ({
  heading: 'Приглашаем на праздник!',
  message: 'Будем рады видеть вас!',
  instructions: '',
  logoUrl: '',
  backgroundUrl: '',
  accentColor: '#0369a1',
  backgroundColor: '#f0f9ff',
  textColor: '#0f172a',
  publicContact: '',
  showEndTime: false,
})
export const normalizePartyInvitationContent = (body = {}) => {
  const result = defaultPartyInvitationContent()
  for (const key of ['heading', 'message', 'instructions', 'publicContact']) {
    const value = body[key] ?? result[key]
    if (
      typeof value !== 'string' ||
      value.length > (key === 'heading' ? 240 : 5000)
    )
      partyBookingFailure('Текст приглашения слишком длинный')
    result[key] = value.trim()
  }
  if (!result.heading) partyBookingFailure('Укажите заголовок приглашения')
  for (const key of ['logoUrl', 'backgroundUrl']) {
    const value = body[key] || ''
    if (
      typeof value !== 'string' ||
      value.length > 2000 ||
      (value &&
        !/^https:\/\/[^\s]+$/i.test(value) &&
        !/^\/(?!\/)[^\s\\]*$/.test(value))
    )
      partyBookingFailure(
        'Для изображения укажите HTTPS-ссылку или путь существующего изображения сайта'
      )
    result[key] = value
  }
  for (const key of ['accentColor', 'backgroundColor', 'textColor']) {
    const value = body[key] ?? result[key]
    if (!/^#[a-f\d]{6}$/i.test(value))
      partyBookingFailure('Цвет должен иметь формат #RRGGBB')
    result[key] = value
  }
  result.showEndTime = body.showEndTime === true
  return result
}
const idOf = (value) => {
  if (!/^[a-f\d]{24}$/i.test(String(value || '')))
    partyBookingFailure('Некорректная запись')
  return String(value)
}
const loadOrder = async (context, orderId, write = false) => {
  const Orders = await getPartyOrderModel()
  const order = await Orders.findOne({
    _id: idOf(orderId),
    tenantId: context.tenantId,
  }).lean()
  if (!order || !canPartyAccess(context, { resource: 'orders', order }))
    partyBookingFailure('Заказ недоступен', 404)
  if (
    ![
      'orders.title',
      'orders.eventDate',
      'orders.locationId',
      'orders.customAddress',
    ].every((resource) => canPartyAccess(context, { resource, order }))
  )
    partyBookingFailure(
      'Для приглашения нужен доступ к типу, времени и месту заказа',
      403
    )
  if (
    write &&
    !canPartyAccess(context, {
      resource: 'orders.title',
      action: 'edit',
      order,
    })
  )
    partyBookingFailure('Нет права управлять приглашением заказа', 403)
  if (write && order.status === 'canceled')
    partyBookingFailure('Для отменённого заказа приглашение недоступно', 409)
  return order
}
export const projectPartyInvitation = async ({
  invitation,
  order,
  company,
}) => {
  let location = null
  if (order.placeType !== 'client_address' && order.locationId) {
    const Locations = await getPartyLocationModel()
    location = await Locations.findOne({
      _id: order.locationId,
      tenantId: order.tenantId,
    })
      .select('title address')
      .lean()
  }
  const address = location?.address || order.clientAddress || {}
  return {
    ...normalizePartyInvitationContent(invitation.snapshot),
    companyTitle: company.title || '',
    orderTypeTitle: order.orderTypeSnapshot || order.title || '',
    eventDate: order.eventDate ? new Date(order.eventDate).toISOString() : null,
    dateEnd: order.dateEnd ? new Date(order.dateEnd).toISOString() : null,
    timeZone: company.settings?.timeZone || 'Asia/Krasnoyarsk',
    locationTitle:
      location?.title ||
      (order.placeType === 'client_address' ? 'На выезде' : ''),
    address:
      order.placeType === 'client_address' && order.customAddress
        ? order.customAddress
        : [address.town, address.street, address.house, address.room]
            .filter(Boolean)
            .join(', '),
  }
}
const dto = async (record, order, company) => ({
  _id: String(record._id),
  templateId: record.templateId ? String(record.templateId) : null,
  snapshot: record.snapshot,
  revision: record.revision,
  published: record.published,
  url: record.published ? `/invitation/${record.token}` : '',
  preview: await projectPartyInvitation({ invitation: record, order, company }),
})

export const readPartyOrderInvitation = async ({ context, orderId }) => {
  const order = await loadOrder(context, orderId)
  const Invitations = await getPartyInvitationModel()
  const record = await Invitations.findOne({
    tenantId: context.tenantId,
    orderId,
  }).lean()
  return record ? dto(record, order, context.company) : null
}
export const savePartyOrderInvitation = async ({ context, orderId, body }) => {
  const order = await loadOrder(context, orderId, true)
  const Invitations = await getPartyInvitationModel()
  const existing = await Invitations.findOne({
    tenantId: context.tenantId,
    orderId,
  }).lean()
  if (existing && existing.revision !== body.expectedRevision)
    partyBookingFailure(
      'Приглашение уже изменилось. Загрузите его заново.',
      409
    )
  let snapshot = existing?.snapshot
  let templateId = existing?.templateId || null
  if (!existing || body.action === 'apply_template') {
    const Templates = await getPartyInvitationTemplateModel()
    templateId = body.templateId || null
    if (!templateId && order.orderTypeId) {
      const Types = await getPartyOrderTypeModel()
      const type = await Types.findOne({
        _id: order.orderTypeId,
        tenantId: context.tenantId,
      })
        .select('invitationTemplateId')
        .lean()
      templateId = type?.invitationTemplateId || null
    }
    const template = templateId
      ? await Templates.findOne({
          _id: idOf(templateId),
          tenantId: context.tenantId,
        }).lean()
      : null
    if (templateId && !template)
      partyBookingFailure('Шаблон приглашения недоступен', 404)
    snapshot = template?.content || defaultPartyInvitationContent()
  }
  if (body.snapshot) snapshot = normalizePartyInvitationContent(body.snapshot)
  if (!['save', 'publish', 'unpublish', 'apply_template'].includes(body.action))
    partyBookingFailure('Выберите действие с приглашением')
  if (
    body.action === 'publish' &&
    (!order.eventDate ||
      !order.dateEnd ||
      (!order.locationId &&
        !order.customAddress &&
        !order.clientAddress?.street))
  )
    partyBookingFailure('Перед публикацией укажите дату, время и место заказа')
  const published =
    body.action === 'publish'
      ? true
      : body.action === 'unpublish'
        ? false
        : existing?.published || false
  const token =
    (body.action === 'publish' && !existing?.published) || !existing
      ? randomBytes(32).toString('hex')
      : existing.token
  let record
  try {
    record = existing
      ? await Invitations.findOneAndUpdate(
          {
            _id: existing._id,
            tenantId: context.tenantId,
            revision: existing.revision,
          },
          {
            $set: { snapshot, templateId, token, published },
            $inc: { revision: 1 },
          },
          { returnDocument: 'after' }
        ).lean()
      : (
          await Invitations.create({
            tenantId: context.tenantId,
            orderId,
            snapshot,
            templateId,
            token,
            published,
          })
        ).toObject()
  } catch (cause) {
    if (cause.code === 11000)
      partyBookingFailure('Приглашение уже создано. Обновите заказ.', 409)
    throw cause
  }
  if (!record)
    partyBookingFailure('Приглашение уже изменилось. Обновите заказ.', 409)
  return dto(record, order, context.company)
}
export const getPublicPartyInvitation = async (token) => {
  if (!/^[a-f\d]{64}$/.test(String(token || ''))) return null
  const Invitations = await getPartyInvitationModel()
  const invitation = await Invitations.findOne({
    token,
    published: true,
  }).lean()
  if (!invitation) return null
  const Orders = await getPartyOrderModel(),
    Companies = await getPartyCompanyModel()
  const [order, company] = await Promise.all([
    Orders.findOne({
      _id: invitation.orderId,
      tenantId: invitation.tenantId,
      status: { $ne: 'canceled' },
    })
      .select(
        'tenantId orderTypeSnapshot title eventDate dateEnd locationId placeType customAddress clientAddress'
      )
      .lean(),
    Companies.findOne({ _id: invitation.tenantId })
      .select('title settings.timeZone')
      .lean(),
  ])
  return order && company
    ? projectPartyInvitation({ invitation, order, company })
    : null
}
export const invitationRoute =
  (handler, managementOnly = false) =>
  async (req, route) => {
    const { context, error } = await getPartyRequestContext({
      req,
      managementOnly,
      allowLocationOwner: !managementOnly,
    })
    if (error) return error
    try {
      return NextResponse.json(
        {
          success: true,
          data: await handler({
            req,
            context,
            body: req.method === 'GET' ? {} : await parseJsonBody(req),
            params: await route?.params,
          }),
        },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    } catch (cause) {
      return partyError(
        cause.status || 500,
        cause.code || 'partycrm_invitation_failed',
        cause.status ? cause.message : 'Не удалось сохранить приглашение'
      )
    }
  }
