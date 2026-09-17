import { NextResponse } from 'next/server'
import { getPartyRequestContext, isValidObjectId, parseJsonBody, partyError } from '@server/partyApi'
import { correctPartyGroupPayment } from '@server/partyGroupPaymentCorrections'
import { getPartyAuditActor } from '@server/partyAuditLog'
import { syncPartyOrderCalendarAfterCrud } from '@server/partyOrderCalendarHooks'

export const PATCH = async (req, { params }) => {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error
  const { id, paymentId } = await params
  if (!isValidObjectId(id) || !isValidObjectId(paymentId)) return partyError(400, 'partycrm_invalid_payment_id', 'Некорректный id заказа или платежа')
  try {
    const data = await correctPartyGroupPayment({ tenantId: context.tenantId, orderId: id, paymentId, body: await parseJsonBody(req), actor: getPartyAuditActor(context) })
    const warnings = []
    if (!data.replayed) {
      for (const part of data.payment.allocations) {
        try {
          const result = await syncPartyOrderCalendarAfterCrud({ tenantId: context.tenantId, orderId: part.orderId })
          if (result?.ok === false) warnings.push('Корректировка сохранена, но синхронизация календаря не завершена')
        } catch { warnings.push('Корректировка сохранена, но синхронизация календаря не завершена') }
      }
    }
    return NextResponse.json({ success: true, data: { ...data, warnings: [...new Set(warnings)] } })
  } catch (error) {
    return partyError(error.status || 500, error.status ? error.code : 'partycrm_group_payment_correction_failed', error.status ? error.message : 'Не удалось изменить распределение. Повторите ту же операцию')
  }
}
