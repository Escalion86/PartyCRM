import { NextResponse } from 'next/server'
import { getPartyOrderModel } from '@server/partyModels'
import { getPartyRequestContext } from '@server/partyApi'

const startOfToday = () => {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const PartyOrders = await getPartyOrderModel()
  const today = startOfToday()
  const match = {
    tenantId: context.tenantId,
    status: { $in: ['draft', 'active'] },
    $or: [
      { dateEnd: { $lt: today } },
      {
        $and: [
          { $or: [{ dateEnd: null }, { dateEnd: { $exists: false } }] },
          { eventDate: { $lt: today } },
        ],
      },
    ],
  }

  const orders = await PartyOrders.find(match).select({ _id: 1 }).lean()
  const closedIds = orders.map((order) => String(order._id))

  if (closedIds.length > 0) {
    await PartyOrders.updateMany(
      { _id: { $in: closedIds }, tenantId: context.tenantId },
      { $set: { status: 'closed' } }
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      closedCount: closedIds.length,
      closedIds,
    },
  })
}
