import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext } from '@server/partyApi'
import { sendPushToTenant } from '@server/pushNotifications'
import { buildPartyTestPushPayload } from '@server/partyPushCore'

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const PartyCompanies = await getPartyCompanyModel()
  const company = await PartyCompanies.findById(context.tenantId)
    .select({ title: 1 })
    .lean()

  const result = await sendPushToTenant({
    tenantId: context.tenantId,
    product: 'partycrm',
    companyId: context.tenantId,
    userId: context.sessionUser._id,
    source: 'party-settings-test',
    payload: buildPartyTestPushPayload({
      companyId: context.tenantId,
      companyTitle: company?.title || '',
    }),
  })

  return NextResponse.json({
    success: true,
    data: result,
  })
}
