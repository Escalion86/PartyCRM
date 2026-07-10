import { NextResponse } from 'next/server'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { getPartyOrderModel } from '@server/partyModels'
import { syncPartyOrderToPerformerCalendars } from '@server/partyPerformerGoogleCalendarSync'
import { isValidObjectId } from '@server/partyApi'

export async function POST() {
  const { sessionUser, memberships } = await getPartyMembershipContext()
  if (!sessionUser?._id) {
    return NextResponse.json(
      { success: false, error: { code: 'unauthorized', message: 'Не авторизован' } },
      { status: 401 }
    )
  }
  const activeMemberships = memberships.filter(
    (membership) =>
      membership.status !== 'archived' &&
      !membership.isDeveloperAccess &&
      isValidObjectId(membership.staffId)
  )
  if (activeMemberships.length === 0) {
    return NextResponse.json({
      success: true,
      data: { processed: 0, synced: 0, skipped: 0 },
    })
  }

  const PartyOrders = await getPartyOrderModel()
  const orders = await PartyOrders.find({
    status: { $nin: ['canceled', 'closed'] },
    eventDate: { $gte: new Date() },
    $or: activeMemberships.map((membership) => ({
      tenantId: membership.tenantId,
      assignedStaff: {
        $elemMatch: {
          staffId: String(membership.staffId),
          confirmationStatus: { $in: ['confirmed', 'done'] },
        },
      },
    })),
  })
    .select('_id tenantId')
    .sort({ eventDate: 1 })
    .limit(200)
    .lean()

  const total = { processed: 0, synced: 0, skipped: 0 }
  for (const order of orders) {
    total.processed += 1
    const result = await syncPartyOrderToPerformerCalendars({
      tenantId: String(order.tenantId),
      orderId: String(order._id),
    })
    total.synced += Number(result.synced || 0)
    total.skipped += Number(result.skipped || 0)
  }

  return NextResponse.json({ success: true, data: total })
}
