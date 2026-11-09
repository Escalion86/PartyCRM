import { NextResponse } from 'next/server'
import { getPartyCallModel } from '@server/partyModels'
import { getPartyRequestContext, isValidObjectId, partyError } from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const callId = new URL(req.url).searchParams.get('callId')
  if (callId !== null && !isValidObjectId(callId)) {
    return partyError(400, 'partycrm_invalid_call_id', 'Некорректный звонок', 'validation')
  }

  const { access } = await getPartyCompanyTariffAccessState(context.company)
  if (!access.allowTelephony) {
    return partyError(
      403,
      'partycrm_tariff_telephony_unavailable',
      'Телефония недоступна на текущем тарифе компании',
      'permission'
    )
  }

  const PartyCalls = await getPartyCallModel()
  const calls = await PartyCalls.find({
    tenantId: context.tenantId,
    ...(callId ? { _id: callId, provider: 'novofon' } : {}),
  })
    .sort({ startedAt: -1, createdAt: -1 })
    .limit(100)
    .lean()

  return NextResponse.json({ success: true, data: calls })
}
