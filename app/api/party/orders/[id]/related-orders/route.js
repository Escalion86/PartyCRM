import { NextResponse } from 'next/server'
import { getPartyRequestContext, isValidObjectId, parseJsonBody, partyError } from '@server/partyApi'
import { getPartyRelatedOrders, linkPartyRelatedOrder, unlinkPartyRelatedOrder, updatePartySharedLocationBooking } from '@server/partyRelatedOrders'

const handle = async (req, params, method) => {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error
  const { id } = await params
  if (!isValidObjectId(id)) return partyError(400, 'partycrm_invalid_order_id', 'Некорректный id заказа')
  try {
    const args = { tenantId: context.tenantId, orderId: id }
    let data
    if (method === 'GET') data = await getPartyRelatedOrders({ ...args, search: new URL(req.url).searchParams.get('search') || '' })
    else {
      const body = await parseJsonBody(req)
      if (!body || typeof body !== 'object') return partyError(400, 'partycrm_invalid_payload', 'Некорректные данные')
      if (method === 'POST') {
        if (!isValidObjectId(body.targetOrderId)) return partyError(400, 'partycrm_invalid_order_id', 'Выберите связанный заказ')
        data = await linkPartyRelatedOrder({ ...args, targetOrderId: body.targetOrderId, title: body.title, expectedRevision: body.expectedRevision })
      } else if (method === 'PATCH') data = await updatePartySharedLocationBooking({ ...args, sharedLocationBooking: body.sharedLocationBooking, expectedRevision: body.expectedRevision })
      else data = await unlinkPartyRelatedOrder({ ...args, expectedRevision: body.expectedRevision })
    }
    return NextResponse.json({ success: true, data })
  } catch (error) {
    return partyError(error.status || 500, error.status ? error.code : 'partycrm_related_orders_failed', error.status ? error.message : 'Не удалось обновить связанные заказы')
  }
}

export const GET = (req, { params }) => handle(req, params, 'GET')
export const POST = (req, { params }) => handle(req, params, 'POST')
export const DELETE = (req, { params }) => handle(req, params, 'DELETE')
export const PATCH = (req, { params }) => handle(req, params, 'PATCH')
