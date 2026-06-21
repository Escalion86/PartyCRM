import { NextResponse } from 'next/server'
import { getPartyCallModel } from '@server/partyModels'
import { getPartyRequestContext, partyError } from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'

export async function GET(req) {
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

  const PartyCalls = await getPartyCallModel()
  const calls = await PartyCalls.find({
    tenantId: context.tenantId,
  })
    .sort({ startedAt: -1, createdAt: -1 })
    .limit(100)
    .lean()

  return NextResponse.json({ success: true, data: calls })
}
