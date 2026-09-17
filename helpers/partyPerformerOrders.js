export const sanitizePartyOrderForPerformer = ({
  order,
  membership,
  locationsById,
  clientsById,
  servicesById = new Map(),
  staffById = new Map(),
}) => {
  const staffId = String(membership.staffId)
  const assignment = (order.assignedStaff ?? []).find(
    (item) => String(item.staffId) === staffId
  )
  const locationKey = order.locationId
    ? `${String(order.tenantId)}:${String(order.locationId)}`
    : ''
  const location = locationKey ? locationsById.get(locationKey) : null
  const client = order.clientId
    ? clientsById.get(`${String(order.tenantId)}:${String(order.clientId)}`)
    : null
  const onsiteCandidate = order.contactRoles?.onsiteClientId
    ? clientsById.get(`${String(order.tenantId)}:${String(order.contactRoles.onsiteClientId)}`)
    : null
  const onsite = onsiteCandidate &&
    String(onsiteCandidate.tenantId) === String(order.tenantId) &&
    onsiteCandidate.status !== 'archived'
    ? onsiteCandidate
    : null
  const responsibleStaffKey = order.responsibleStaffId
    ? `${String(order.tenantId)}:${String(order.responsibleStaffId)}`
    : ''
  const responsibleStaff = responsibleStaffKey
    ? staffById.get(responsibleStaffKey)
    : null
  const serviceTitles = Array.isArray(order.servicesIds)
    ? order.servicesIds
        .map((serviceId) => servicesById.get(String(serviceId))?.title)
        .filter(Boolean)
    : []
  if (order.serviceTitle && !serviceTitles.includes(order.serviceTitle)) {
    serviceTitles.push(order.serviceTitle)
  }

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
    serviceTitles,
    performerComment: order.performerComment || '',
    onsiteContact: onsite
      ? {
          name: [onsite.firstName, onsite.secondName, onsite.thirdName].filter(Boolean).join(' '),
          phone: onsite.phone || '',
          email: onsite.email || '',
        }
      : null,
    communicationInstructions: {
      representAs: order.contactRoles?.representAs || '',
      communicationNotes: order.contactRoles?.communicationNotes || '',
      allowedContactMethods: Array.isArray(order.contactRoles?.allowedContactMethods)
        ? order.contactRoles.allowedContactMethods.filter((method) =>
            ['phone', 'telegram', 'whatsapp', 'sms', 'email'].includes(method)
          )
        : [],
    },
    responsibleStaff: responsibleStaff
      ? {
          _id: String(responsibleStaff._id),
          firstName: responsibleStaff.firstName || '',
          secondName: responsibleStaff.secondName || '',
          name:
            [responsibleStaff.secondName, responsibleStaff.firstName]
              .filter(Boolean)
              .join(' ') ||
            responsibleStaff.phone ||
            responsibleStaff.email ||
            'Администратор',
          phone: responsibleStaff.phone || '',
          email: responsibleStaff.email || '',
          role: responsibleStaff.role || 'admin',
        }
      : null,
    client: {
      _id: client?._id ? String(client._id) : '',
      firstName: client?.firstName || order.client?.name || '',
      secondName: client?.secondName || '',
      thirdName: client?.thirdName || '',
      name:
        [client?.firstName, client?.secondName, client?.thirdName]
          .filter(Boolean)
          .join(' ') ||
        order.client?.name ||
        '',
      phone: client?.phone || order.client?.phone || '',
      whatsapp: client?.whatsapp || '',
      viber: client?.viber || '',
      telegram: client?.telegram || '',
      instagram: client?.instagram || '',
      vk: client?.vk || '',
      email: client?.email || order.client?.email || '',
    },
    assignment: assignment
      ? {
          role: assignment.role,
          payoutAmount: assignment.payoutAmount || 0,
          payoutStatus: assignment.payoutStatus,
          confirmationStatus: assignment.confirmationStatus,
          report: assignment.report || null,
        }
      : null,
  }
}
