import { NextResponse } from 'next/server'
import { getPartyRequestContext, isValidObjectId, parseJsonBody, partyError } from '@server/partyApi'
import { createPartyGroupPayment, listPartyGroupPayments } from '@server/partyGroupPayments'
import { syncPartyOrderCalendarAfterCrud } from '@server/partyOrderCalendarHooks'
import { recordPartyOrderAudit } from '@server/partyAuditLog'

const handle = async (req, params, method) => {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error
  const { id } = await params
  if (!isValidObjectId(id)) return partyError(400, 'partycrm_invalid_order_id', 'Некорректный id заказа')
  try {
    const args = { tenantId: context.tenantId, orderId: id }
    if (method === 'GET') return NextResponse.json({ success: true, data: await listPartyGroupPayments(args) })
    const body = await parseJsonBody(req)
    const data = await createPartyGroupPayment({ ...args, body })
    const warnings = []
    if (!data.replayed) {
      for (const part of data.payment.allocations) {
        try {
          const audit = await recordPartyOrderAudit({ context, orderId: part.orderId, action: 'transaction_created', summary: `Часть общего поступления: ${part.amount} ₽`, changes: [], metadata: { transactionId: part.transactionId, groupPaymentId: data.payment._id } })
          if (!audit) warnings.push('Платёж сохранён, но запись истории не обновилась')
        } catch { warnings.push('Платёж сохранён, но запись истории не обновилась') }
        try {
          const result = await syncPartyOrderCalendarAfterCrud({ tenantId: context.tenantId, orderId: part.orderId })
          if (result?.ok === false) warnings.push('Платёж сохранён, но синхронизация календаря не завершена')
        } catch { warnings.push('Платёж сохранён, но синхронизация календаря не завершена') }
      }
    }
    return NextResponse.json({ success: true, data: { ...data, warnings: [...new Set(warnings)] } }, { status: data.replayed ? 200 : 201 })
  } catch (error) {
    return partyError(error.status || 500, error.status ? error.code : 'partycrm_group_payment_failed', error.status ? error.message : 'Не удалось сохранить общий платеж. Повторите ту же операцию')
  }
}
export const GET = (req, { params }) => handle(req, params, 'GET')
export const POST = (req, { params }) => handle(req, params, 'POST')
