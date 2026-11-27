import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import { getPartyOrderWriteGuard } from '@helpers/partyOrderWriteGuard'
import { getPartyRequestContext, isValidObjectId, partyError } from './partyApi'
import { getPartyBriefTemplateForOrder } from './partyBriefTemplates'
import { getPartyCompanyModel, getPartyOrderModel } from './partyModels'
import {
  getPartyClientBriefFields,
  getPartyClientBriefFormVersion,
  parsePartyClientBriefAnswers,
  parsePartyClientBriefToken,
} from './partyClientBriefCore'

const activeStatuses = ['draft', 'active']
const canSubmit = (order) => activeStatuses.includes(order.status)
const briefPermission = (context, order, action) =>
  canPartyAccess(context, { resource: 'orders', order }) &&
  canPartyAccess(context, { resource: 'orders.eventBrief', order, action })

const noStore = (response) => {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

const briefRoute = (handler) => async (req, { params }) => {
  try {
    return await handler(req, await params)
  } catch {
    return noStore(partyError(500, 'partycrm_client_brief_failed', 'Не удалось обработать бриф. Попробуйте ещё раз.'))
  }
}

const managementData = (order, showLink = false) => ({
  path: showLink && order.clientBriefLink?.secret
    ? `/brief/${order.tenantId}.${order._id}.${order.clientBriefLink.secret}`
    : null,
  createdAt: order.clientBriefLink?.createdAt || null,
  submittedAt: order.clientBriefSubmittedAt || null,
})

export const partyClientBriefLinkRoute = (write = false) => briefRoute(async (req, { id }) => {
  const { context, error } = await getPartyRequestContext({
    req,
    allowLocationOwner: true,
    permissionAware: true,
  })
  if (error) return noStore(error)
  if (!isValidObjectId(id)) return noStore(partyError(400, 'partycrm_invalid_order_id', 'Некорректный заказ', 'validation'))

  const Orders = await getPartyOrderModel()
  const filter = { _id: id, tenantId: context.tenantId }
  const read = () => Orders.findOne(filter).select('+clientBriefLink').lean()
  const order = await read()
  if (!order || !briefPermission(context, order, 'read')) {
    return noStore(partyError(404, 'partycrm_order_not_found', 'Заказ не найден'))
  }
  const editable = briefPermission(context, order, 'edit')
  if (!write) return noStore(NextResponse.json({ success: true, data: managementData(order, editable && canSubmit(order)) }))
  if (!editable) return noStore(partyError(403, 'partycrm_forbidden', 'Нет права создавать ссылку на бриф', 'permission'))
  if (!canSubmit(order)) return noStore(partyError(409, 'partycrm_client_brief_unavailable', 'Заказ закрыт или отменён', 'conflict'))
  if (order.clientBriefLink?.secret) return noStore(NextResponse.json({ success: true, data: managementData(order, true) }))

  const template = await getPartyBriefTemplateForOrder({ tenantId: context.tenantId, order })
  if (!getPartyClientBriefFields(template).length) {
    return noStore(partyError(409, 'partycrm_client_brief_no_questions', 'В брифе этого заказа нет вопросов для клиента', 'validation'))
  }

  const updated = await Orders.findOneAndUpdate(
    { ...filter, ...getPartyOrderWriteGuard(order), clientBriefLink: null },
    { $set: { clientBriefLink: { secret: randomBytes(32).toString('hex'), createdAt: new Date() } } },
    { returnDocument: 'after' }
  ).select('+clientBriefLink').lean()
  const published = updated || await read()
  if (!published || !canSubmit(published) || !briefPermission(context, published, 'edit') || !published.clientBriefLink?.secret) {
    return noStore(partyError(409, 'partycrm_order_changed', 'Заказ изменился. Обновите его и повторите попытку.', 'conflict'))
  }
  return noStore(NextResponse.json({ success: true, data: managementData(published, true) }))
})

const findPublicOrder = (Orders, filter) => Orders.findOne({ ...filter, status: { $ne: 'canceled' } })
  .select('tenantId status servicesIds orderTypeId clientBriefSubmittedAt updatedAt sharedLocationRevision commercialRevision eventBrief')
  .lean()

const describePublicBrief = async (order) => {
  const [template, Companies] = await Promise.all([
    getPartyBriefTemplateForOrder({ tenantId: order.tenantId, order }),
    getPartyCompanyModel(),
  ])
  const company = await Companies.findById(order.tenantId).select('title settings.timeZone').lean()
  const timeZone = company?.settings?.timeZone || 'Asia/Krasnoyarsk'
  const fields = getPartyClientBriefFields(template)
  return {
    timeZone,
    fields,
    form: {
      title: template.title || 'Бриф заказа',
      companyTitle: company?.title || '',
      version: getPartyClientBriefFormVersion(fields, String(order.orderTypeId || ''), timeZone),
      fields: fields.map(({ legacyKey: _legacyKey, ...field }) => field),
    },
  }
}

export const getPublicPartyClientBrief = async (token) => {
  const filter = parsePartyClientBriefToken(token)
  if (!filter) return null
  const Orders = await getPartyOrderModel()
  const order = await findPublicOrder(Orders, filter)
  if (!order) return null
  if (order.clientBriefSubmittedAt) return { submitted: true }
  if (!canSubmit(order)) return null
  const { form } = await describePublicBrief(order)
  return form.fields.length ? form : null
}

const maxRequestBytes = 4 * 1024 * 1024
const readBriefSubmission = async (req) => {
  if (!req.body || Number(req.headers.get('content-length')) > maxRequestBytes) return null
  const reader = req.body.getReader()
  const decoder = new TextDecoder()
  let size = 0
  let text = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > maxRequestBytes) {
        await reader.cancel()
        return null
      }
      text += decoder.decode(value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } catch {
    return null
  } finally {
    reader.releaseLock()
  }
}

const unavailable = () => noStore(partyError(404, 'partycrm_client_brief_unavailable', 'Эта ссылка на бриф недоступна. Уточните у организатора, как передать ответы.'))
const submitted = (submittedAt) => noStore(NextResponse.json({ success: true, data: { submittedAt } }))

export const submitPublicPartyClientBrief = briefRoute(async (req, { token }) => {
  const filter = parsePartyClientBriefToken(token)
  if (!filter) return unavailable()
  const Orders = await getPartyOrderModel()
  const order = await findPublicOrder(Orders, filter)
  if (!order) return unavailable()
  if (order.clientBriefSubmittedAt) return submitted(order.clientBriefSubmittedAt)
  if (!canSubmit(order)) return unavailable()

  const body = await readBriefSubmission(req)
  if (!body) return noStore(partyError(400, 'partycrm_client_brief_invalid', 'Проверьте ответы и отправьте форму ещё раз.', 'validation'))
  const { fields, form, timeZone } = await describePublicBrief(order)
  if (body.version !== form.version || !fields.length) {
    return noStore(partyError(409, 'partycrm_client_brief_form_changed', 'Вопросы изменились. Обновите страницу и заполните актуальную форму.', 'conflict'))
  }
  const { customAnswers, legacyAnswers, error } = parsePartyClientBriefAnswers(fields, body.answers, timeZone)
  if (error) return noStore(partyError(400, 'partycrm_client_brief_invalid', error.message, 'validation', { fieldId: error.fieldId }))

  const submittedAt = new Date(Math.max(Date.now(), (order.updatedAt?.getTime() || 0) + 1))
  const eventBrief = {
    ...order.eventBrief,
    ...legacyAnswers,
    customAnswers: { ...order.eventBrief?.customAnswers, ...customAnswers },
  }
  const result = await Orders.updateOne(
    { ...filter, ...getPartyOrderWriteGuard(order), clientBriefSubmittedAt: null },
    { $set: { eventBrief, clientBriefSubmittedAt: submittedAt, updatedAt: submittedAt } },
    { timestamps: false, runValidators: true }
  )
  if (result.matchedCount) return submitted(submittedAt)

  const current = await findPublicOrder(Orders, filter)
  if (current?.clientBriefSubmittedAt) return submitted(current.clientBriefSubmittedAt)
  if (!current || !canSubmit(current)) return unavailable()
  return noStore(partyError(409, 'partycrm_client_brief_order_changed', 'Организатор обновил заказ. Нажмите «Отправить бриф» ещё раз.', 'conflict'))
})
