export const sanitizePartyOrderForPerformer = ({
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
  const location = locationKey ? locationsById.get(locationKey) : null
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
