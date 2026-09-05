import { NextResponse } from 'next/server'
import { getPartyCompanyModel } from '@server/partyModels'
import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { savePushSubscription } from '@server/pushNotifications'
import { normalizePartyPushSubscriptionPayload } from '@server/partyPushCore'
import { getActivePartyPushMembershipTargets } from '@server/partyPushSubscriptionTargets'

export async function POST(req) {
  const body = await parseJsonBody(req)
  const subscription = normalizePartyPushSubscriptionPayload(body.subscription)
  if (!subscription) {
    return NextResponse.json(
      { success: false, error: 'Некорректная push-подписка' },
      { status: 400 }
    )
  }

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
    await Promise.all(
      targets.map((target) =>
        savePushSubscription({
          tenantId: target.tenantId,
          product: 'partycrm',
          companyId: target.tenantId,
          userId: membershipContext.sessionUser._id,
          subscription,
          userAgent: req.headers.get('user-agent') || '',
        })
      )
    )

    return NextResponse.json({
      success: true,
      data: { subscribed: true, companies: targets.length },
    })
  }

  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

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
