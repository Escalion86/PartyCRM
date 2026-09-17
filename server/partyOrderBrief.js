import { normalizePartyProposalDuration } from '../helpers/partyProposalCore.js'
const trimText = (value, maxLength) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

const normalizeInteger = (value, { min = 0, max }) => {
  if (value === '' || value === null || value === undefined) return null
  const number = Number(value)
  if (!Number.isFinite(number)) return null
  return Math.min(Math.max(Math.floor(number), min), max)
}

const normalizeMoney = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 0) return 0
  return Math.round(number * 100) / 100
}

const normalizeQuantity = (value) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number <= 0) return 1
  return Math.min(Math.max(number, 0.01), 100000)
}

const normalizeDate = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const defaultIsValidObjectId = (value) =>
  /^[a-f\d]{24}$/i.test(String(value || ''))

export const normalizePartyOrderEventBrief = (value) => {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {}

  return {
    occasion: trimText(source.occasion, 180),
    celebrantName: trimText(source.celebrantName, 160),
    celebrantAge: normalizeInteger(source.celebrantAge, { min: 0, max: 120 }),
    guestCount: normalizeInteger(source.guestCount, { min: 0, max: 10000 }),
    guestAgeRange: trimText(source.guestAgeRange, 180),
    interests: trimText(source.interests, 2000),
    previousPrograms: trimText(source.previousPrograms, 2000),
    characters: trimText(source.characters, 2000),
    costumeOptions: trimText(source.costumeOptions, 2000),
    eventFormat: trimText(source.eventFormat, 1000),
    venueConditions: trimText(source.venueConditions, 2000),
    cakeAndGifts: trimText(source.cakeAndGifts, 2000),
    wishes: trimText(source.wishes, 4000),
    restrictions: trimText(source.restrictions, 4000),
  }
}

export const normalizePartyOrderItems = (
  items,
  { isValidObjectId = defaultIsValidObjectId } = {}
) => {
  if (!Array.isArray(items)) return []

  return items
    .map((item) => {
      const quantity = normalizeQuantity(item?.quantity)
      const unitPrice = normalizeMoney(item?.unitPrice)
      const discount = Math.min(
        normalizeMoney(item?.discount),
        normalizeMoney(quantity * unitPrice)
      )
      return {
        serviceId: isValidObjectId(item?.serviceId)
          ? String(item.serviceId)
          : null,
        title: trimText(item?.title, 240),
        description: trimText(item?.description, 1000),
        quantity,
        unit: trimText(item?.unit, 40) || 'услуга',
        durationMinutes: normalizePartyProposalDuration(item?.durationMinutes),
        unitPrice,
        discount,
        total: normalizeMoney(quantity * unitPrice - discount),
      }
    })
    .filter((item) => item.title)
}

export const normalizePartyOrderAgreedProposal = (
  value,
  { isValidObjectId = defaultIsValidObjectId } = {}
) => {
  const source =
    value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  const proposalId = String(source.proposalId || '').trim()
  const appliedByStaffId = String(source.appliedByStaffId || '').trim()

  return {
    proposalId: isValidObjectId(proposalId) ? proposalId : null,
    number: trimText(source.number, 80),
    version: normalizeInteger(source.version, { min: 1, max: 1000000 }),
    subtotal: normalizeMoney(source.subtotal),
    discount: normalizeMoney(source.discount),
    total: normalizeMoney(source.total),
    appliedAt: normalizeDate(source.appliedAt),
    appliedByStaffId: isValidObjectId(appliedByStaffId)
      ? appliedByStaffId
      : null,
    snapshotHash: trimText(source.snapshotHash, 128),
  }
}

export const normalizePartyOrderCommercialRevision = (value) =>
  normalizeInteger(value, { min: 0, max: Number.MAX_SAFE_INTEGER }) ?? 0
