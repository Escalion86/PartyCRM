import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { deactivatePushSubscription } from '@server/pushNotifications'
import { normalizePartyPushSubscriptionPayload } from '@server/partyPushCore'
import { getActivePartyPushMembershipTargets } from '@server/partyPushSubscriptionTargets'

export async function POST(req) {
  const body = await parseJsonBody(req)
  const subscription = normalizePartyPushSubscriptionPayload(body.subscription)

  const requestedCompanyId = String(
    req.headers.get('x-partycrm-company-id') || ''
  ).trim()
  if (!requestedCompanyId) {
    const membershipContext = await getPartyMembershipContext({ excludeLocationOwners: true })
    if (!membershipContext?.sessionUser?._id) {
      return NextResponse.json(
        { success: false, error: 'Не авторизован' },
        { status: 401 }
      )
    }
    const targets = getActivePartyPushMembershipTargets(
      membershipContext.memberships
    )
    if (subscription?.endpoint) {
      await Promise.all(
        targets.map((target) =>
          deactivatePushSubscription({
            tenantId: target.tenantId,
            product: 'partycrm',
            companyId: target.tenantId,
            userId: membershipContext.sessionUser._id,
            endpoint: subscription.endpoint,
          })
        )
      )
    }

    return NextResponse.json({
      success: true,
      data: { subscribed: false, companies: targets.length },
    })
  }

  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

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
