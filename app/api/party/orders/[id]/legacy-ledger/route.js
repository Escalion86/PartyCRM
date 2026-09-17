import { NextResponse } from 'next/server'
import { getPartyRequestContext, isValidObjectId, parseJsonBody, partyError } from '@server/partyApi'
import { getPartyLegacyLedger, migratePartyLegacyLedger } from '@server/partyLegacyLedger'

const handle = async (req, params, method) => {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error
  const { id } = await params
  if (!isValidObjectId(id)) return partyError(400, 'partycrm_invalid_order_id', 'Некорректный id заказа')
  try {
    const args = { tenantId: context.tenantId, orderId: id }
    if (method === 'GET') return NextResponse.json({ success: true, data: await getPartyLegacyLedger(args) })
    const body = await parseJsonBody(req)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return partyError(400, 'partycrm_invalid_body', 'Некорректные данные')
    const data = await migratePartyLegacyLedger({ ...args, expectedFingerprint: body.expectedFingerprint, actorStaffId: context.staff?._id || null, actorUserId: context.user?._id || null })
    return NextResponse.json({ success: true, data }, { status: data.replayed ? 200 : 201 })
  } catch (error) {
    return partyError(error.status || 500, error.status ? error.code : 'partycrm_legacy_ledger_failed', error.status ? error.message : 'Не удалось перенести журнал платежей. Повторите ту же операцию')
  }
}
export const GET = (req, { params }) => handle(req, params, 'GET')
export const POST = (req, { params }) => handle(req, params, 'POST')
