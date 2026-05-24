import { NextResponse } from 'next/server'
import {
  getPartyClientModel,
  getPartyLocationModel,
  getPartyOrderModel,
} from '@server/partyModels'
import getPartyMembershipContext from '@server/getPartyMembershipContext'

const sanitizeOrderForPerformer = ({
  order,
  membership,
  locationsById,
  clientsById,
}) => {
  const staffId = String(membership.staffId)
  const assignment = (order.assignedStaff ?? []).find(
    (item) => String(item.staffId) === staffId
  )
  const locationKey = order.locationId
    ? `${String(order.tenantId)}:${String(order.locationId)}`
    : ''
  const location = locationKey
    ? locationsById.get(locationKey)
    : null
  const client = order.clientId ? clientsById.get(String(order.clientId)) : null

  return {
    _id: String(order._id),
    tenantId: String(order.tenantId),
    staffId,
    companyId: membership.tenantId,
    companyTitle: membership.company?.title || 'Компания',
    companyRole: membership.role,
    title: order.title || order.serviceTitle || 'Заказ',
    status: order.status,
    eventDate: order.eventDate,
    dateEnd: order.dateEnd,
    placeType: order.placeType,
    location: location
      ? {
          _id: String(location._id),
          title: location.title,
          address: location.address,
        }
      : null,
    customAddress: order.customAddress || '',
    serviceTitle: order.serviceTitle || '',
    client: {
      name:
        [client?.firstName, client?.secondName, client?.thirdName]
          .filter(Boolean)
          .join(' ') ||
        order.client?.name ||
        '',
      phone: client?.phone || order.client?.phone || '',
    },
    adminComment: order.adminComment || '',
    assignment: assignment
      ? {
          role: assignment.role,
          payoutAmount: assignment.payoutAmount || 0,
          payoutStatus: assignment.payoutStatus,
          confirmationStatus: assignment.confirmationStatus,
        }
      : null,
  }
}

export async function GET() {
  const { sessionUser, memberships } = await getPartyMembershipContext()

  if (!sessionUser?._id) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'unauthorized',
          type: 'auth',
          message: 'Не авторизован',
        },
      },
      { status: 401 }
    )
  }

  const activeMemberships = memberships.filter(
    (membership) => membership.status !== 'archived'
  )

  if (activeMemberships.length === 0) {
    return NextResponse.json({ success: true, data: [] })
  }

  const PartyOrders = await getPartyOrderModel()
  const orders = await PartyOrders.find({
    status: { $nin: ['canceled', 'closed'] },
    $or: activeMemberships.map((membership) => ({
      tenantId: membership.tenantId,
      'assignedStaff.staffId': String(membership.staffId),
    })),
  })
    .sort({ eventDate: 1, createdAt: -1 })
    .limit(120)
    .lean()

  const locationPairs = orders
    .map((order) => ({
      tenantId: String(order.tenantId),
      locationId: String(order.locationId || ''),
    }))
    .filter((pair) => pair.locationId)
  const locationFilters = [
    ...new Map(
      locationPairs.map((pair) => [
        `${pair.tenantId}:${pair.locationId}`,
        pair,
      ])
    ).values(),
  ]
  const PartyLocations = await getPartyLocationModel()
  const PartyClients = await getPartyClientModel()
  const locations = locationFilters.length
    ? await PartyLocations.find({
        $or: locationFilters.map((pair) => ({
          _id: pair.locationId,
          tenantId: pair.tenantId,
        })),
      }).lean()
    : []
  const clientIds = [
    ...new Set(
      orders
        .map((order) => String(order.clientId || ''))
        .filter(Boolean)
    ),
  ]
  const clients = clientIds.length
    ? await PartyClients.find({
        _id: { $in: clientIds },
        status: { $ne: 'archived' },
      }).lean()
    : []
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

  return NextResponse.json({
    success: true,
    data: orders
      .map((order) => {
        const assignment = (order.assignedStaff ?? []).find((item) =>
          membershipsByStaffId.has(String(item.staffId))
        )
        const membership = assignment
          ? membershipsByStaffId.get(String(assignment.staffId))
          : null
        if (!membership) return null
        return sanitizeOrderForPerformer({
          order,
          membership,
          locationsById,
          clientsById,
        })
      })
      .filter(Boolean),
  })
}
