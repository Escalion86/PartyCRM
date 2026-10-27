export const PARTY_ORDER_CONTACT_ROLE_KEYS = [
  'partnerClientId',
  'payerClientId',
  'onsiteClientId',
]
export const PARTY_ORDER_CONTACT_METHODS = [
  'phone',
  'telegram',
  'whatsapp',
  'sms',
  'email',
]

export const parsePartyOrderContactRoles = (input) => {
  const invalid = (error) => ({ error })
  if (
    input !== undefined &&
    (!input || typeof input !== 'object' || Array.isArray(input))
  ) {
    return invalid('Контакты заказа должны быть объектом')
  }
  const source = input || {}
  const value = {}
  for (const key of PARTY_ORDER_CONTACT_ROLE_KEYS) {
    const raw = source[key]
    const id = typeof raw?.toHexString === 'function' ? raw.toHexString() : raw
    if (
      id !== undefined &&
      id !== null &&
      id !== '' &&
      (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))
    ) {
      return invalid('Некорректный идентификатор контакта заказа')
    }
    value[key] = id || null
  }
  for (const [key, max] of [
    ['representAs', 240],
    ['communicationNotes', 2000],
  ]) {
    if (
      source[key] !== undefined &&
      (typeof source[key] !== 'string' || source[key].length > max)
    ) {
      return invalid(`Некорректное поле ${key}: не более ${max} символов`)
    }
    value[key] = (source[key] || '').trim()
  }
  const methods =
    source.allowedContactMethods === undefined
      ? []
      : source.allowedContactMethods
  if (
    !Array.isArray(methods) ||
    methods.length > 5 ||
    methods.some((method) => !PARTY_ORDER_CONTACT_METHODS.includes(method)) ||
    new Set(methods).size !== methods.length
  ) {
    return invalid('Укажите допустимые способы связи без повторений')
  }
  value.allowedContactMethods = [...methods]
  if (Object.prototype.hasOwnProperty.call(source, 'contactSettings')) {
    if (
      !Array.isArray(source.contactSettings) ||
      source.contactSettings.length > 100
    )
      return invalid(
        'Настройки контактов должны содержать не более 100 записей'
      )
    const settings = new Map()
    for (const item of source.contactSettings) {
      const id =
        typeof item?.clientId?.toHexString === 'function'
          ? item.clientId.toHexString()
          : item?.clientId
      if (
        typeof id !== 'string' ||
        !/^[a-f\d]{24}$/i.test(id) ||
        typeof item?.performerCanContact !== 'boolean'
      )
        return invalid('Укажите контакт и его доступность исполнителю')
      const channels =
        item.allowedContactMethods === undefined
          ? []
          : item.allowedContactMethods
      if (
        !Array.isArray(channels) ||
        channels.length > 5 ||
        channels.some(
          (method) => !PARTY_ORDER_CONTACT_METHODS.includes(method)
        ) ||
        new Set(channels).size !== channels.length
      )
        return invalid(
          'Укажите допустимые способы связи контакта без повторений'
        )
      const previous = settings.get(id)
      // Client merges can temporarily give two preferences the same ID.
      // Explicitly restricted access wins until the next ordinary save.
      settings.set(id, {
        clientId: id,
        performerCanContact:
          item.performerCanContact && previous?.performerCanContact !== false,
        allowedContactMethods: [
          ...new Set([...(previous?.allowedContactMethods || []), ...channels]),
        ],
      })
    }
    value.contactSettings = [...settings.values()]
  }
  return { value }
}

export const preservePartyOrderContactSettings = ({
  input,
  previous = {},
  clientId,
  otherContacts = [],
}) => {
  if (
    input !== undefined &&
    (!input || typeof input !== 'object' || Array.isArray(input))
  )
    return input
  if (input && Object.prototype.hasOwnProperty.call(input, 'contactSettings'))
    return input
  const source = input === undefined ? previous : input
  if (!Array.isArray(previous?.contactSettings)) return source
  const linked = new Set(
    [
      clientId,
      ...(Array.isArray(otherContacts) ? otherContacts : []).map(
        (item) => item?.clientId
      ),
      ...PARTY_ORDER_CONTACT_ROLE_KEYS.map((key) => source?.[key]),
    ]
      .filter(Boolean)
      .map(String)
  )
  return {
    ...source,
    contactSettings: previous.contactSettings.filter((item) =>
      linked.has(String(item.clientId))
    ),
  }
}

export const validatePartyOrderContactSettingsOrder = (order) => {
  const linked = new Set(
    [
      order?.clientId,
      ...(Array.isArray(order?.otherContacts) ? order.otherContacts : []).map(
        (item) => item?.clientId
      ),
      ...PARTY_ORDER_CONTACT_ROLE_KEYS.map((key) => order?.contactRoles?.[key]),
    ]
      .filter(Boolean)
      .map(String)
  )
  return (order?.contactRoles?.contactSettings || []).some(
    (item) => !linked.has(String(item.clientId))
  )
    ? 'Настройки доступны только контактам, связанным с этим заказом'
    : null
}

export const normalizePartyOrderOtherContacts = (items) => {
  if (!Array.isArray(items)) return []
  const seen = new Set()
  return items.flatMap((item) => {
    const clientId = String(item?.clientId || '').trim()
    if (!/^[a-f\d]{24}$/i.test(clientId)) return []
    const comment =
      typeof item.comment === 'string' ? item.comment.trim().slice(0, 180) : ''
    const key = `${clientId}:${comment}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ clientId, comment }]
  })
}
