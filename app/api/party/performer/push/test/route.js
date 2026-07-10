import { NextResponse } from 'next/server'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { getPartyEntryState } from '@server/partyEntry'
import { getPartyUserModel } from '@server/partyModels'
import { buildPartyPerformerTestPushPayload } from '@server/partyPushCore'
import { getActivePartyPushMembershipTargets } from '@server/partyPushSubscriptionTargets'
import { sendPushToTenant } from '@server/pushNotifications'

export async function POST() {
  const { sessionUser, memberships } = await getPartyMembershipContext()

  if (!sessionUser?._id) {
    return NextResponse.json(
      { success: false, error: 'Не авторизован' },
      { status: 401 }
    )
  }

  const state = getPartyEntryState({ user: sessionUser, memberships })
  if (!state.canUsePerformer) {
    return NextResponse.json(
      { success: false, error: 'Кабинет исполнителя недоступен' },
      { status: 403 }
    )
  }

  const PartyUsers = await getPartyUserModel()
  const user = await PartyUsers.findById(sessionUser._id)
    .select('performerSettings.notifications')
    .lean()

  if (user?.performerSettings?.notifications?.pushEnabled === false) {
    return NextResponse.json(
      { success: false, error: 'Сначала включите push-уведомления' },
      { status: 400 }
    )
  }

  const targets = getActivePartyPushMembershipTargets(memberships)
  const results = await Promise.all(
    targets.map((target) =>
      sendPushToTenant({
        tenantId: target.tenantId,
        product: 'partycrm',
        companyId: target.tenantId,
        userId: sessionUser._id,
        targetUserId: sessionUser._id,
        source: 'party-performer-settings-test',
        payload: buildPartyPerformerTestPushPayload(),
      })
    )
  )

  return NextResponse.json({
    success: true,
    data: {
      companies: targets.length,
      sent: results.reduce((sum, item) => sum + Number(item?.sent || 0), 0),
      failed: results.reduce((sum, item) => sum + Number(item?.failed || 0), 0),
    },
  })
}
