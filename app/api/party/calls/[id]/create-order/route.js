import { NextResponse } from 'next/server'
import { getPartyCallModel, getPartyOrderModel } from '@server/partyModels'
import { getPartyRequestContext, partyError } from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { createPartyOrderFromCallDraft } from '@server/partyNovofonCalls'
import {
  findPartyOrderConflicts,
  hasPartyOrderConflicts,
} from '@server/partyOrderConflicts'
import { syncPartyOrderCalendarAfterCrud } from '@server/partyOrderCalendarHooks'
import {
  canCreatePartyOrderByTariff,
  filterPartyOrderPayloadByTariffAccess,
} from '@helpers/partyTariffAccess'
import {
  getMonthRange,
  normalizeOrderPayload,
  validateOrderReferences,
} from '../../../orders/route'

export async function POST(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const { access } = await getPartyCompanyTariffAccessState(context.company)
  if (!access.allowTelephony) {
    return partyError(
      403,
      'partycrm_tariff_telephony_unavailable',
      'Телефония недоступна на текущем тарифе компании',
      'permission'
    )
  }

  const resolvedParams = await params
  const PartyCalls = await getPartyCallModel()
  const PartyOrders = await getPartyOrderModel()
  const result = await createPartyOrderFromCallDraft({
    models: {
      Call: PartyCalls,
      Order: PartyOrders,
    },
    tenantId: context.tenantId,
    callId: resolvedParams?.id,
    prepareOrderPayload: async (draftPayload) => {
      const payload = normalizeOrderPayload(draftPayload)
      if (
        !payload.clientId &&
        !payload.client.name &&
        payload.servicesIds.length === 0 &&
        !payload.serviceTitle
      ) {
        return {
          error: {
            status: 400,
            code: 'partycrm_order_client_or_service_required',
            message: 'Укажите клиента или услугу заказа',
          },
        }
      }

      const referenceError = await validateOrderReferences({
        tenantId: context.tenantId,
        payload,
      })
      if (referenceError) {
        return {
          error: {
            status: referenceError.status || 400,
            code: 'partycrm_order_reference_invalid',
            message: 'Проверьте связанные сущности заказа',
          },
        }
      }

      const { monthStart, nextMonthStart } = getMonthRange(payload.eventDate)
      const currentMonthOrdersCount = await PartyOrders.countDocuments({
        tenantId: context.tenantId,
        status: { $ne: 'canceled' },
        eventDate: { $gte: monthStart, $lt: nextMonthStart },
      })
      const limitState = canCreatePartyOrderByTariff({
        access,
        currentMonthOrdersCount,
      })
      if (!limitState.ok) {
        return {
          error: {
            status: 403,
            code: limitState.code,
            message: limitState.message,
          },
        }
      }

      const limitedPayload = filterPartyOrderPayloadByTariffAccess(
        payload,
        access
      )
      const conflicts = await findPartyOrderConflicts({
        PartyOrders,
        tenantId: context.tenantId,
        payload: limitedPayload,
      })
      if (hasPartyOrderConflicts(conflicts)) {
        return {
          error: {
            status: 409,
            code: 'partycrm_order_conflict',
            message: 'Найдены пересечения по точке или исполнителю',
          },
        }
      }

      return { payload: limitedPayload }
    },
  })

  if (result.error) {
    return partyError(
      result.error.status,
      result.error.code,
      result.error.message,
      'validation'
    )
  }

  await syncPartyOrderCalendarAfterCrud({
    tenantId: context.tenantId,
    orderId: String(result.order._id),
  })

  return NextResponse.json(
    { success: true, data: { order: result.order, call: result.call } },
    { status: 201 }
  )
}
