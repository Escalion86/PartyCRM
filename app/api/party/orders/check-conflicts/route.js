import { NextResponse } from 'next/server'
import { getPartyOrderModel } from '@server/partyModels'
import {
  getPartyRequestContext,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import { findPartyOrderConflicts } from '@server/partyOrderConflicts'
import { normalizeOrderPayload, validateOrderReferences } from '../route'

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const payload = normalizeOrderPayload(body)
  const referenceError = await validateOrderReferences({
    tenantId: context.tenantId,
    payload,
  })
  if (referenceError) return referenceError

  if (!payload.eventDate || !payload.dateEnd) {
    return partyError(
      400,
      'partycrm_order_dates_required',
      'Укажите дату начала и окончания для проверки конфликтов',
      'validation'
    )
  }

  const PartyOrders = await getPartyOrderModel()
  const conflicts = await findPartyOrderConflicts({
    PartyOrders,
    tenantId: context.tenantId,
    payload,
  })

  return NextResponse.json({
    success: true,
    data: {
      hasConflicts: Boolean(
        conflicts.locationConflicts.length || conflicts.staffConflicts.length
      ),
      conflicts,
    },
  })
}
