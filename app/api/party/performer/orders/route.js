import { NextResponse } from 'next/server'
import {
  getPartyClientModel,
  getPartyLocationModel,
  getPartyOrderModel,
  getPartyServiceModel,
  getPartyStaffModel,
} from '@server/partyModels'
import getPartyMembershipContext from '@server/getPartyMembershipContext'
import { isValidObjectId } from '@server/partyApi'
import { sanitizePartyOrderForPerformer } from '@helpers/partyPerformerOrders'

export async function GET() {
  const { sessionUser, memberships } = await getPartyMembershipContext({ excludeLocationOwners: true })

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
    (membership) =>
      membership.status !== 'archived' &&
      !membership.isDeveloperAccess &&
      isValidObjectId(membership.staffId)
  )

  if (activeMemberships.length === 0) {
    return NextResponse.json({ success: true, data: [] })
  }

  const PartyOrders = await getPartyOrderModel()
  const orders = await PartyOrders.find({
    status: { $ne: 'canceled' },
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
  const PartyServices = await getPartyServiceModel()
  const PartyStaff = await getPartyStaffModel()
  const locations = locationFilters.length
    ? await PartyLocations.find({
        $or: locationFilters.map((pair) => ({
          _id: pair.locationId,
          tenantId: pair.tenantId,
        })),
      }).lean()
    : []
  const clientFilters = [
    ...new Map(
      orders
        .map((order) => ({
          tenantId: String(order.tenantId || ''),
          clientId: String(order.clientId || ''),
        }))
        .filter((pair) => pair.tenantId && pair.clientId)
        .map((pair) => [`${pair.tenantId}:${pair.clientId}`, pair])
    ).values(),
  ]
  const clients = clientFilters.length
    ? await PartyClients.find({
        $or: clientFilters.map((pair) => ({
          _id: pair.clientId,
          tenantId: pair.tenantId,
          status: { $ne: 'archived' },
        })),
      }).lean()
    : []
  const serviceFilters = [
    ...new Map(
      orders
        .flatMap((order) =>
          (order.servicesIds ?? []).map((serviceId) => ({
            tenantId: String(order.tenantId),
            serviceId: String(serviceId || ''),
          }))
        )
        .filter((pair) => pair.serviceId)
        .map((pair) => [`${pair.tenantId}:${pair.serviceId}`, pair])
    ).values(),
  ]
  const services = serviceFilters.length
    ? await PartyServices.find({
        $or: serviceFilters.map((pair) => ({
          _id: pair.serviceId,
          tenantId: pair.tenantId,
          status: { $ne: 'archived' },
        })),
      })
        .select('_id title')
        .lean()
    : []
  const responsibleStaffFilters = [
    ...new Map(
      orders
        .map((order) => ({
          tenantId: String(order.tenantId),
          staffId: String(order.responsibleStaffId || ''),
        }))
        .filter((pair) => pair.staffId)
        .map((pair) => [`${pair.tenantId}:${pair.staffId}`, pair])
    ).values(),
  ]
  const responsibleStaff = responsibleStaffFilters.length
    ? await PartyStaff.find({
        $or: responsibleStaffFilters.map((pair) => ({
          _id: pair.staffId,
          tenantId: pair.tenantId,
          role: { $in: ['owner', 'admin'] },
          status: { $ne: 'archived' },
        })),
      })
        .select('_id tenantId firstName secondName phone email role')
        .lean()
    : []
  const locationsById = new Map(
    locations.map((location) => [
      `${String(location.tenantId)}:${String(location._id)}`,
      location,
    ])
  )
  const clientsById = new Map(
    clients.map((client) => [
      `${String(client.tenantId)}:${String(client._id)}`,
      client,
    ])
  )
  const servicesById = new Map(
    services.map((service) => [String(service._id), service])
  )
  const staffById = new Map(
    responsibleStaff.map((person) => [
      `${String(person.tenantId)}:${String(person._id)}`,
      person,
    ])
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
        return sanitizePartyOrderForPerformer({
          order,
          membership,
          locationsById,
          clientsById,
          servicesById,
          staffById,
        })
      })
      .filter(Boolean),
  })
}
