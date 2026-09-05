const cleanText = (value, maxLength = 1000) =>
  String(value ?? '').trim().slice(0, maxLength)

const parseMoney = (value) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.round(parsed * 100) / 100
}

const parseQuantity = (value) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return 1
  return Math.min(parsed, 100000)
}

const normalizeDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export const calculatePartyProposalItem = (item = {}) => {
  const quantity = parseQuantity(item.quantity)
  const unitPrice = parseMoney(item.unitPrice)
  const discount = Math.min(parseMoney(item.discount), quantity * unitPrice)
  return {
    serviceId: item.serviceId || null,
    title: cleanText(item.title, 240),
    description: cleanText(item.description, 1000),
    quantity,
    unit: cleanText(item.unit, 40) || 'услуга',
    unitPrice,
    discount,
    total: parseMoney(quantity * unitPrice - discount),
  }
}

export const calculatePartyProposalTotals = (items = [], discount = 0) => {
  const normalizedItems = Array.isArray(items)
    ? items.map(calculatePartyProposalItem).filter((item) => item.title)
    : []
  const subtotal = parseMoney(
    normalizedItems.reduce((sum, item) => sum + item.total, 0)
  )
  const normalizedDiscount = Math.min(parseMoney(discount), subtotal)
  return {
    items: normalizedItems,
    subtotal,
    discount: normalizedDiscount,
    total: parseMoney(subtotal - normalizedDiscount),
  }
}

const normalizePartySnapshot = (value = {}) => ({
  displayName: cleanText(value.displayName, 240),
  fullName: cleanText(value.fullName, 240),
  position: cleanText(value.position, 180),
  inn: cleanText(value.inn, 40),
  ogrn: cleanText(value.ogrn, 40),
  legalAddress: cleanText(value.legalAddress, 400),
  phone: cleanText(value.phone, 40),
  email: cleanText(value.email, 160).toLowerCase(),
})

export const normalizePartyProposalPayload = (value = {}) => {
  const totals = calculatePartyProposalTotals(value.items, value.discount)
  return {
    number: cleanText(value.number, 80),
    proposalDate: normalizeDate(value.proposalDate) || new Date(),
    validUntil: normalizeDate(value.validUntil),
    requestNumber: cleanText(value.requestNumber, 120),
    requestDate: normalizeDate(value.requestDate),
    recipientSnapshot: normalizePartySnapshot(value.recipientSnapshot),
    eventSnapshot: {
      title: cleanText(value?.eventSnapshot?.title, 240),
      date: normalizeDate(value?.eventSnapshot?.date),
      address: cleanText(value?.eventSnapshot?.address, 500),
    },
    ...totals,
    taxText: cleanText(value.taxText, 500),
    paymentTerms: cleanText(value.paymentTerms, 2000),
    includedText: cleanText(value.includedText, 3000),
    additionalTerms: cleanText(value.additionalTerms, 3000),
  }
}

export const buildPartyProposalSenderSnapshot = (requisites = {}) => ({
  displayName: cleanText(
    requisites.providerDisplayName || requisites.providerFullName,
    240
  ),
  fullName: cleanText(
    requisites.providerFullName || requisites.providerDisplayName,
    240
  ),
  position:
    requisites.providerStatus === 'self_employed'
      ? 'Самозанятый'
      : 'Индивидуальный предприниматель',
  inn: cleanText(requisites.providerInn, 40),
  ogrn: cleanText(requisites.providerOgrnip, 40),
  legalAddress: cleanText(requisites.providerLegalAddress, 400),
})

export const buildPartyProposalRecipientSnapshot = (client = {}) => ({
  displayName: cleanText(
    client.legalName ||
      [client.secondName, client.firstName, client.thirdName]
        .filter(Boolean)
        .join(' '),
    240
  ),
  fullName: cleanText(
    [client.secondName, client.firstName, client.thirdName]
      .filter(Boolean)
      .join(' '),
    240
  ),
  position: '',
  inn: cleanText(client.inn, 40),
  ogrn: cleanText(client.ogrn, 40),
  legalAddress: cleanText(client.legalAddress, 400),
  phone: cleanText(client.phone, 40),
  email: cleanText(client.email, 160).toLowerCase(),
})

export const formatPartyProposalAddress = (order = {}, locationTitle = '') => {
  if (order.placeType === 'company_location') {
    return cleanText(order.customAddress || locationTitle, 500)
  }
  if (order.customAddress) return cleanText(order.customAddress, 500)
  const address = order.clientAddress || {}
  return [
    address.town,
    address.street,
    address.house ? `д. ${address.house}` : '',
    address.room,
  ]
    .filter(Boolean)
    .join(', ')
}

export const PARTY_PROPOSAL_STATUSES = Object.freeze([
  'draft',
  'sent',
  'accepted',
  'rejected',
  'expired',
])
