export const PARTY_ORDER_CONTACT_ROLE_KEYS = ['partnerClientId', 'payerClientId', 'onsiteClientId']
export const PARTY_ORDER_CONTACT_METHODS = ['phone', 'telegram', 'whatsapp', 'sms', 'email']

export const parsePartyOrderContactRoles = (input) => {
  const invalid = (error) => ({ error })
  if (input !== undefined && (!input || typeof input !== 'object' || Array.isArray(input))) {
    return invalid('Контакты заказа должны быть объектом')
  }
  const source = input || {}
  const value = {}
  for (const key of PARTY_ORDER_CONTACT_ROLE_KEYS) {
    const raw = source[key]
    const id = typeof raw?.toHexString === 'function' ? raw.toHexString() : raw
    if (id !== undefined && id !== null && id !== '' &&
        (typeof id !== 'string' || !/^[a-f\d]{24}$/i.test(id))) {
      return invalid('Некорректный идентификатор контакта заказа')
    }
    value[key] = id || null
  }
  for (const [key, max] of [['representAs', 240], ['communicationNotes', 2000]]) {
    if (source[key] !== undefined && (typeof source[key] !== 'string' || source[key].length > max)) {
      return invalid(`Некорректное поле ${key}: не более ${max} символов`)
    }
    value[key] = (source[key] || '').trim()
  }
  const methods = source.allowedContactMethods === undefined ? [] : source.allowedContactMethods
  if (!Array.isArray(methods) || methods.length > 5 ||
      methods.some((method) => !PARTY_ORDER_CONTACT_METHODS.includes(method)) ||
      new Set(methods).size !== methods.length) {
    return invalid('Укажите допустимые способы связи без повторений')
  }
  value.allowedContactMethods = [...methods]
  return { value }
}
