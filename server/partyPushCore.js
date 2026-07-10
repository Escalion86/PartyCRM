const cleanText = (value, maxLength = 500) =>
  String(value ?? '').trim().slice(0, maxLength)

export const normalizePartyPushSubscriptionPayload = (value) => {
  if (!value || typeof value !== 'object') return null
  const endpoint = cleanText(value.endpoint, 2000)
  const keys = value.keys && typeof value.keys === 'object' ? value.keys : {}
  const p256dh = cleanText(keys.p256dh, 500)
  const auth = cleanText(keys.auth, 500)

  if (!endpoint || !p256dh || !auth) return null

  return {
    endpoint,
    keys: {
      p256dh,
      auth,
    },
  }
}

export const buildPartyTestPushPayload = ({
  companyId = '',
  companyTitle = '',
} = {}) => ({
  title: 'PartyCRM',
  body: `Тест push-уведомлений для компании ${cleanText(companyTitle, 160) || 'PartyCRM'}`,
  icon: '/icons/icon-192.png',
  badge: '/icons/icon-192.png',
  tag: `party-test-${cleanText(companyId, 80) || 'company'}`,
  data: {
    type: 'party_test',
    companyId: cleanText(companyId, 80),
    url: '/company/settings/notifications',
  },
})

export const buildPartyPerformerTestPushPayload = () => ({
  title: 'PartyCRM',
  body: 'Тест push-уведомлений для кабинета исполнителя',
  icon: '/icons/icon-192.png',
  badge: '/icons/icon-192.png',
  tag: 'party-performer-test',
  data: {
    type: 'party_performer_test',
    url: '/performer/settings/notifications',
  },
})

export const buildPartyInviteAcceptedPushPayload = ({
  companyId = '',
  companyTitle = '',
  staffId = '',
  staffName = '',
  roleLabel = '',
} = {}) => ({
  title: cleanText(companyTitle, 160) || 'PartyCRM',
  body: `${cleanText(staffName, 160) || 'Сотрудник'} принял приглашение и подключён как ${cleanText(roleLabel, 80) || 'сотрудник'}`,
  icon: '/icons/icon-192.png',
  badge: '/icons/icon-192.png',
  tag: `party-invite-accepted-${cleanText(staffId, 80) || 'staff'}`,
  data: {
    type: 'party_staff_invite_accepted',
    companyId: cleanText(companyId, 80),
    staffId: cleanText(staffId, 80),
    url: '/company/staff',
  },
})

export const buildPartyPerformerAssignmentPushPayload = ({
  companyId = '',
  companyTitle = '',
  orderId = '',
  orderTitle = '',
  staffId = '',
  eventDate = '',
  changeType = 'new',
} = {}) => {
  const normalizedChangeType = changeType === 'changed' ? 'changed' : 'new'
  const orderLabel = cleanText(orderTitle, 160) || 'Заказ'
  const eventDateLabel = cleanText(eventDate, 80)
  const bodyPrefix =
    normalizedChangeType === 'changed'
      ? 'Назначение изменено'
      : 'Новое назначение'
  const bodyDetails = [bodyPrefix, orderLabel, eventDateLabel].filter(Boolean)

  return {
    title: cleanText(companyTitle, 160) || 'PartyCRM',
    body: bodyDetails.join(': '),
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: `party-performer-assignment-${normalizedChangeType}-${cleanText(orderId, 80) || 'order'}-${cleanText(staffId, 80) || 'staff'}`,
    data: {
      type: `party_performer_assignment_${normalizedChangeType === 'changed' ? 'changed' : 'new'}`,
      companyId: cleanText(companyId, 80),
      orderId: cleanText(orderId, 80),
      staffId: cleanText(staffId, 80),
      url: '/performer',
    },
  }
}

export const buildPartyPerformerLinkRequestPushPayload = ({
  companyId = '',
  companyTitle = '',
  staffId = '',
  staffName = '',
} = {}) => ({
  title: cleanText(companyTitle, 160) || 'PartyCRM',
  body: `${cleanText(staffName, 160) || 'Сотрудник'}, подтвердите привязку карточки исполнителя`,
  icon: '/icons/icon-192.png',
  badge: '/icons/icon-192.png',
  tag: `party-performer-link-request-${cleanText(staffId, 80) || 'staff'}`,
  data: {
    type: 'party_performer_link_request',
    companyId: cleanText(companyId, 80),
    staffId: cleanText(staffId, 80),
    url: '/performer',
  },
})
