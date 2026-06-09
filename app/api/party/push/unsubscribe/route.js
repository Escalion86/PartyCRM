import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import { deactivatePushSubscription } from '@server/pushNotifications'
import { normalizePartyPushSubscriptionPayload } from '@server/partyPushCore'

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const subscription = normalizePartyPushSubscriptionPayload(body.subscription)
  if (subscription?.endpoint) {
    await deactivatePushSubscription({
      tenantId: context.tenantId,
      product: 'partycrm',
      companyId: context.tenantId,
      userId: context.sessionUser._id,
      endpoint: subscription.endpoint,
    })
  }

  const PartyCompanies = await getPartyCompanyModel()
  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    { $set: { 'settings.notifications.pushEnabled': false } }
  )

  return NextResponse.json({
    success: true,
    data: { subscribed: false },
  })
}
