export const PARTY_ORDER_CONTACT_ROLE_LABELS = {
  partnerClientId: 'Партнёр / агентство',
  payerClientId: 'Плательщик',
  onsiteClientId: 'Контакт на месте',
}

export const PARTY_ORDER_CONTACT_METHOD_LABELS = {
  phone: 'Звонок',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  sms: 'SMS',
  email: 'Email',
}

const idOf = (value) => String(value || '')
const list = (value) => (Array.isArray(value) ? value : [])
const cleanMethods = (value) => [
  ...new Set(
    list(value).filter((method) =>
      Object.hasOwn(PARTY_ORDER_CONTACT_METHOD_LABELS, method)
    )
  ),
]

// These remain references to the existing client directory. Text labels never
// determine the financial payer or partner relationship.
export const buildPartyOrderContacts = ({
  clientId,
  otherContacts,
  contactRoles = {},
} = {}) => {
  const contacts = new Map()
  const add = (id) => {
    const key = idOf(id)
    if (!key) return null
    if (!contacts.has(key))
      contacts.set(key, {
        clientId: key,
        isPrimary: key === idOf(clientId),
        comments: [],
        systemRoles: [],
        otherContactIndices: [],
      })
    return contacts.get(key)
  }
  add(clientId)
  list(otherContacts).forEach((item, index) => {
    const contact = add(item?.clientId)
    if (!contact) return
    if (item.comment && !contact.comments.includes(item.comment))
      contact.comments.push(item.comment)
    contact.otherContactIndices.push(index)
  })
  for (const role of Object.keys(PARTY_ORDER_CONTACT_ROLE_LABELS)) {
    const contact = add(contactRoles?.[role])
    if (contact) contact.systemRoles.push(role)
  }
  const settings = new Map()
  for (const item of list(contactRoles?.contactSettings)) {
    const key = idOf(item.clientId)
    const previous = settings.get(key)
    settings.set(key, {
      ...item,
      performerCanContact:
        item.performerCanContact !== false &&
        previous?.performerCanContact !== false,
      allowedContactMethods: cleanMethods([
        ...(previous?.allowedContactMethods || []),
        ...list(item.allowedContactMethods),
      ]),
    })
  }
  return [...contacts.values()].map((contact) => {
    const preference = settings.get(contact.clientId)
    return {
      ...contact,
      performerCanContact:
        typeof preference?.performerCanContact === 'boolean'
          ? preference.performerCanContact
          : contact.isPrimary || contact.systemRoles.includes('onsiteClientId'),
      allowedContactMethods: cleanMethods(preference?.allowedContactMethods),
    }
  })
}

export const setPartyOrderContactSetting = (
  contactRoles = {},
  clientId,
  patch
) => {
  const contactSettings = list(contactRoles.contactSettings)
  const previous = contactSettings.find(
    (item) => idOf(item.clientId) === idOf(clientId)
  )
  const next = { clientId: idOf(clientId), ...previous, ...patch }
  return {
    ...contactRoles,
    contactSettings: [
      ...contactSettings.filter(
        (item) => idOf(item.clientId) !== idOf(clientId)
      ),
      next,
    ],
  }
}

export const setPartyOrderContactComment = (
  otherContacts = [],
  clientId,
  comment
) => {
  const matching = list(otherContacts).filter(
    (item) => idOf(item.clientId) === idOf(clientId)
  )
  if (!matching.length)
    return [...list(otherContacts), { clientId: idOf(clientId), comment }]
  let updated = false
  return list(otherContacts).flatMap((item) => {
    if (idOf(item.clientId) !== idOf(clientId)) return [item]
    if (updated) return []
    updated = true
    return [{ ...item, comment }]
  })
}

export const removePartyOrderContact = ({
  clientId,
  otherContacts = [],
  contactRoles = {},
}) => {
  const nextRoles = { ...contactRoles }
  for (const role of Object.keys(PARTY_ORDER_CONTACT_ROLE_LABELS))
    if (idOf(nextRoles[role]) === idOf(clientId)) nextRoles[role] = null
  if (Array.isArray(nextRoles.contactSettings))
    nextRoles.contactSettings = nextRoles.contactSettings.filter(
      (item) => idOf(item.clientId) !== idOf(clientId)
    )
  return {
    otherContacts: list(otherContacts).filter(
      (item) => idOf(item.clientId) !== idOf(clientId)
    ),
    contactRoles: nextRoles,
  }
}

export const getPartyOrderPerformerContactIds = (order) =>
  buildPartyOrderContacts(order)
    .filter((item) => item.performerCanContact)
    .map((item) => item.clientId)
