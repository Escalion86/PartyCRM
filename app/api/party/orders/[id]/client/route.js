import { NextResponse } from 'next/server'
import { getPartyRequestContext, partyError, isValidObjectId } from '@server/partyApi'
import { getPartyClientModel, getPartyOrderModel } from '@server/partyModels'
import { canPartyAccess, filterPartyOrderForAccess } from '@helpers/partyRolePermissions'
import { normalizePhoneNumber } from '@helpers/phoneInput'
import { getPartyOrderWriteGuard } from '@helpers/partyOrderWriteGuard'
import { withPartyFinancialTransaction } from '@server/partyFinancialSettlements'
import { recordPartyOrderAudit } from '@server/partyAuditLog'
import { syncPartyOrderCalendarAfterCrud } from '@server/partyOrderCalendarHooks'

export const dynamic = 'force-dynamic'
export async function PATCH(req, { params }) {
  const { context, error } = await getPartyRequestContext({ req, allowLocationOwner: true })
  if (error) return error
  try {
    const { id } = await params
    if (!isValidObjectId(id)) return partyError(400, 'partycrm_invalid_order_id', 'Некорректный заказ')
    const body = await req.json()
    const input = body.client
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some((key) => !['name', 'phone', 'email'].includes(key))) return partyError(400, 'partycrm_invalid_contact_patch', 'Передайте только изменённые имя, телефон или email')
    const result = await withPartyFinancialTransaction(context.tenantId, async (session) => {
      const [Orders, Clients] = await Promise.all([getPartyOrderModel(), getPartyClientModel()])
      const order = await Orders.findOne({ _id: id, tenantId: context.tenantId }).session(session).lean()
      if (!order || !canPartyAccess(context, { resource: 'orders', order })) return { error: partyError(404, 'partycrm_order_not_found', 'Заказ не найден') }
      if (['closed', 'canceled'].includes(order.status)) return { error: partyError(409, 'partycrm_order_readonly', 'Заказ закрыт или отменён') }
      for (const field of Object.keys(input)) if (!canPartyAccess(context, { resource: `orders.client.${field}`, action: 'edit', order })) return { error: partyError(403, 'partycrm_contact_field_forbidden', 'Нет права изменять это поле контакта') }
      if (body.expectedUpdatedAt !== new Date(order.updatedAt).toISOString()) return { error: partyError(409, 'partycrm_order_changed', 'Заказ изменился. Обновите его.') }
      const currentClient = order.clientId ? await Clients.findOne({ _id: order.clientId, tenantId: context.tenantId, status: { $ne: 'archived' } }).session(session).lean() : null
      if (order.clientId && !currentClient) return { error: partyError(409, 'partycrm_client_unavailable', 'Контакт недоступен для редактирования') }
      let nameParts = null
      const values = { ...(order.client || {}) }
      for (const [key, value] of Object.entries(input)) {
        if (key === 'name' && value && typeof value === 'object' && !Array.isArray(value)) {
          if (Object.keys(value).some((field) => !['firstName', 'secondName', 'thirdName'].includes(field)) || Object.values(value).some((part) => typeof part !== 'string' || part.trim().length > 160)) return { error: partyError(400, 'partycrm_invalid_contact_value', 'Проверьте имя, фамилию и отчество') }
          nameParts = Object.fromEntries(['firstName', 'secondName', 'thirdName'].map((field) => [field, Object.hasOwn(value, field) ? value[field].trim() : currentClient?.[field] || '']))
          values.name = Object.values(nameParts).filter(Boolean).join(' ')
        } else if (key === 'name' && currentClient) {
          return { error: partyError(400, 'partycrm_invalid_contact_name', 'Передайте имя, фамилию и отчество отдельно, чтобы сохранить данные контакта') }
        } else if (key === 'phone') {
          const phone = value == null || value === '' ? null : normalizePhoneNumber(value)
          if (value && !phone) return { error: partyError(400, 'partycrm_invalid_phone', 'Укажите полный номер телефона в формате +7') }
          values.phone = phone ? Number(phone) : null
        } else {
          if (typeof value !== 'string' || value.trim().length > (key === 'name' ? 240 : 160)) return { error: partyError(400, 'partycrm_invalid_contact_value', 'Проверьте имя или email') }
          values[key] = key === 'email' ? value.trim().toLowerCase() : value.trim()
          if (key === 'email' && values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) return { error: partyError(400, 'partycrm_invalid_email', 'Проверьте email') }
        }
      }
      if (order.clientId) {
        const patch = {}
        if (nameParts) Object.assign(patch, nameParts)
        if (Object.hasOwn(input, 'phone')) patch.phone = values.phone
        if (Object.hasOwn(input, 'email')) patch.email = values.email
        await Clients.updateOne({ _id: currentClient._id, tenantId: context.tenantId }, { $set: patch }, { session })
      }
      const updated = await Orders.findOneAndUpdate({ _id: id, tenantId: context.tenantId, ...getPartyOrderWriteGuard(order) }, { $set: { client: values }, $inc: { sharedLocationRevision: 1 } }, { new: true, session }).lean()
      if (!updated) throw Object.assign(new Error('Заказ изменился. Обновите его.'), { status: 409, code: 'partycrm_order_changed' })
      return { order: updated, previous: order }
    })
    if (result.error) return result.error
    await recordPartyOrderAudit({ context, order: result.order, previousOrder: result.previous, action: 'order_client_updated', summary: 'Изменил доступные поля контакта заказа' })
    await syncPartyOrderCalendarAfterCrud({ tenantId: context.tenantId, orderId: id, previousOrder: result.previous })
    return NextResponse.json({ success: true, data: filterPartyOrderForAccess(context, result.order) })
  } catch (error) { return partyError(error.status || 500, error.code || 'partycrm_client_patch_failed', error.status ? error.message : 'Не удалось сохранить контакт') }
}
