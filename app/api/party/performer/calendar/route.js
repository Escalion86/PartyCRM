import { NextResponse } from 'next/server'
import {
  getPartyClientModel,
  getPartyLocationModel,
  getPartyOrderModel,
} from '@server/partyModels'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { isValidObjectId, partyError } from '@server/partyApi'
import { sanitizePartyOrderForPerformer } from '@helpers/partyPerformerOrders'
import { buildPartyPerformerCalendarIcs } from '@helpers/partyPerformerCalendar'

export async function GET() {
  const { sessionUser, memberships } = await getPartyMembershipContext()

  if (!sessionUser?._id) {
    return partyError(401, 'unauthorized', 'Не авторизован', 'auth')
  }

  const activeMemberships = memberships.filter(
    (membership) =>
      membership.status !== 'archived' &&
      !membership.isDeveloperAccess &&
      isValidObjectId(membership.staffId)
  )

  const PartyOrders = await getPartyOrderModel()
  const orders = activeMemberships.length
    ? await PartyOrders.find({
        status: { $nin: ['canceled', 'closed'] },
        $or: activeMemberships.map((membership) => ({
          tenantId: membership.tenantId,
          'assignedStaff.staffId': String(membership.staffId),
        })),
      })
        .sort({ eventDate: 1, createdAt: -1 })
        .limit(500)
        .lean()
    : []

  const locationFilters = [
    ...new Map(
      orders
        .map((order) => ({
          tenantId: String(order.tenantId),
          locationId: String(order.locationId || ''),
        }))
        .filter((pair) => pair.locationId)
        .map((pair) => [`${pair.tenantId}:${pair.locationId}`, pair])
    ).values(),
  ]
  const clientIds = [
    ...new Set(
      orders
        .map((order) => String(order.clientId || ''))
        .filter(Boolean)
    ),
  ]

  const PartyLocations = await getPartyLocationModel()
  const PartyClients = await getPartyClientModel()
  const [locations, clients] = await Promise.all([
    locationFilters.length
      ? PartyLocations.find({
          $or: locationFilters.map((pair) => ({
            _id: pair.locationId,
            tenantId: pair.tenantId,
          })),
        }).lean()
      : [],
    clientIds.length
      ? PartyClients.find({
          _id: { $in: clientIds },
          status: { $ne: 'archived' },
        }).lean()
      : [],
  ])

  const locationsById = new Map(
    locations.map((location) => [
      `${String(location.tenantId)}:${String(location._id)}`,
      location,
    ])
  )
  const clientsById = new Map(
    clients.map((client) => [String(client._id), client])
  )
  const membershipsByStaffId = new Map(
    activeMemberships.map((membership) => [
      String(membership.staffId),
      membership,
    ])
  )
  const sanitizedOrders = orders
    .map((order) => {
      const assignment = (order.assignedStaff ?? []).find((item) =>
        membershipsByStaffId.has(String(item.staffId))
      )
      const membership = assignment
        ? membershipsByStaffId.get(String(assignment.staffId))
        : null
      if (!membership) return null
      return sanitizePartyOrderForPerformer({
        order,
        membership,
        locationsById,
        clientsById,
      })
    })
    .filter(Boolean)

  return new NextResponse(
    buildPartyPerformerCalendarIcs({ orders: sanitizedOrders }),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition':
          'attachment; filename="partycrm-performer-calendar.ics"',
        'Cache-Control': 'no-store',
      },
    }
  )
}

export const dynamic = 'force-dynamic'
