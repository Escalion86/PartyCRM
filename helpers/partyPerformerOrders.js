import { buildPartyOrderContacts } from './partyOrderContacts.js'

export const sanitizePartyOrderForPerformer = ({
  order,
  membership,
  locationsById,
  clientsById,
  servicesById = new Map(),
  staffById = new Map(),
  canViewContacts = true,
  contactFieldAccess = {},
}) => {
  const staffId = String(membership.staffId)
  const assignment = (order.assignedStaff ?? []).find(
    (item) => String(item.staffId) === staffId
  )
  const locationKey = order.locationId
    ? `${String(order.tenantId)}:${String(order.locationId)}`
    : ''
  const location = locationKey ? locationsById.get(locationKey) : null
  const clientCandidate = order.clientId
    ? clientsById.get(`${String(order.tenantId)}:${String(order.clientId)}`)
    : null
  const validClient = (person) =>
    person &&
    String(person.tenantId) === String(order.tenantId) &&
    person.status !== 'archived'
  const showName = canViewContacts && contactFieldAccess.name !== false
  const showPhone = canViewContacts && contactFieldAccess.phone !== false
  const showEmail = canViewContacts && contactFieldAccess.email !== false
  const showChannels =
    canViewContacts &&
    (contactFieldAccess.channels ?? contactFieldAccess.phone) !== false
  const contactRows = buildPartyOrderContacts(order)
  const primaryAllowed =
    canViewContacts &&
    (contactRows.find((item) => item.isPrimary)?.performerCanContact ??
      !order.clientId)
  const client =
    primaryAllowed && validClient(clientCandidate) ? clientCandidate : null
  const snapshot = primaryAllowed && !clientCandidate ? order.client : null
  const projectContact = (person, fallback) => ({
    _id: person?._id ? String(person._id) : '',
    firstName: showName ? person?.firstName || fallback?.name || '' : '',
    secondName: showName ? person?.secondName || '' : '',
    thirdName: showName ? person?.thirdName || '' : '',
    name: showName
      ? [person?.firstName, person?.secondName, person?.thirdName]
          .filter(Boolean)
          .join(' ') ||
        fallback?.name ||
        ''
      : '',
    phone: showPhone ? person?.phone || fallback?.phone || '' : '',
    whatsapp: showChannels ? person?.whatsapp || '' : '',
    viber: showChannels ? person?.viber || '' : '',
    telegram: showChannels ? person?.telegram || '' : '',
    instagram: showChannels ? person?.instagram || '' : '',
    vk: showChannels ? person?.vk || '' : '',
    max: showChannels ? person?.max || '' : '',
    email: showEmail ? person?.email || fallback?.email || '' : '',
  })
  const performerContacts = canViewContacts
    ? contactRows.flatMap((item) => {
        if (!item.performerCanContact) return []
        const person = clientsById.get(
          `${String(order.tenantId)}:${item.clientId}`
        )
        if (!validClient(person)) return []
        return [
          {
            ...projectContact(person),
            _id: item.clientId,
            label: showName
              ? item.comments.join('; ') ||
                (item.isPrimary
                  ? 'Заказчик'
                  : item.systemRoles.includes('onsiteClientId')
                    ? 'Контакт на месте'
                    : 'Контакт')
              : '',
            allowedContactMethods: item.allowedContactMethods,
          },
        ]
      })
    : []
  const onsite = performerContacts.find(
    (item) => item._id === String(order.contactRoles?.onsiteClientId || '')
  )
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
          name: [onsite.firstName, onsite.secondName, onsite.thirdName]
            .filter(Boolean)
            .join(' '),
          phone: onsite.phone || '',
          email: onsite.email || '',
        }
      : null,
    communicationInstructions: {
      representAs:
        canViewContacts && contactFieldAccess.instructions !== false
          ? order.contactRoles?.representAs || ''
          : '',
      communicationNotes:
        canViewContacts && contactFieldAccess.instructions !== false
          ? order.contactRoles?.communicationNotes || ''
          : '',
      allowedContactMethods:
        canViewContacts &&
        Array.isArray(order.contactRoles?.allowedContactMethods)
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
    client: projectContact(client, snapshot),
    performerContacts,
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
