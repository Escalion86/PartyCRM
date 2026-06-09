import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import { savePushSubscription } from '@server/pushNotifications'
import { normalizePartyPushSubscriptionPayload } from '@server/partyPushCore'

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const subscription = normalizePartyPushSubscriptionPayload(body.subscription)
  if (!subscription) {
    return NextResponse.json(
      { success: false, error: 'Некорректная push-подписка' },
      { status: 400 }
    )
  }

  await savePushSubscription({
    tenantId: context.tenantId,
    product: 'partycrm',
    companyId: context.tenantId,
    userId: context.sessionUser._id,
    subscription,
    userAgent: req.headers.get('user-agent') || '',
  })

  const PartyCompanies = await getPartyCompanyModel()
  await PartyCompanies.updateOne(
    { _id: context.tenantId },
    { $set: { 'settings.notifications.pushEnabled': true } }
  )

  return NextResponse.json({
    success: true,
    data: { subscribed: true },
  })
}
