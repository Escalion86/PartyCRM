const normalizeAddressPoolString = (value) =>
  typeof value === 'string' ? value.trim() : ''

const formatAddressPoolShort = (address) => {
  if (!address) return ''

  const parts = []
  if (address.town) parts.push(address.town)
  if (address.street) parts.push(address.street)
  if (address.house) parts.push(`д. ${address.house}`)
  if (address.room) parts.push(address.room)
  if (address.entrance) parts.push(`под. ${address.entrance}`)
  if (address.flat) parts.push(`кв. ${address.flat}`)

  if (parts.length === 0) return address.comment || ''

  return parts.join(', ') + (address.comment ? ` (${address.comment})` : '')
}

const getAddressPoolSignature = (
  address,
  fields = [
    'town',
    'street',
    'house',
    'room',
    'entrance',
    'floor',
    'flat',
    'comment',
  ]
) =>
  fields
    .map((field) => normalizeAddressPoolString(address?.[field]))
    .join('|')

const normalizePartyPoolAddress = (address) => ({
  town: normalizeAddressPoolString(address?.town),
  street: normalizeAddressPoolString(address?.street),
  house: normalizeAddressPoolString(address?.house),
  room: normalizeAddressPoolString(address?.room),
  comment: normalizeAddressPoolString(address?.comment),
})

const normalizeTownList = (towns = []) =>
  Array.from(
    new Set(
      towns.map((item) => normalizeAddressPoolString(item)).filter(Boolean)
    )
  ).sort((a, b) => a.localeCompare(b, 'ru'))

export {
  formatAddressPoolShort,
  getAddressPoolSignature,
  normalizeAddressPoolString,
  normalizePartyPoolAddress,
  normalizeTownList,
}
