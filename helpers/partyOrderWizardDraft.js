import { PARTY_ORDER_WIZARD_STEP as STEP } from './partyOrderWizardSteps.js'

const VERSION = 2
const LEGACY_VERSION = 1
// Keep the storage key stable so the new layout can recover existing drafts.
const STORAGE_PREFIX = 'partycrm:order-wizard:1'
const LEGACY_STEPS = [STEP.type, STEP.place, STEP.services, STEP.time, STEP.brief, STEP.finance]
const MAX_AGE = 24 * 60 * 60 * 1000
const MAX_SIZE = 200000
const record = (value) => value && typeof value === 'object' && !Array.isArray(value)
const numericInput = (value) => ['string', 'number'].includes(typeof value) && Number.isFinite(Number(value))
const isOptionId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value)
const validCustomServiceValue = (value) => value === null ||
  (typeof value === 'number' && Number.isFinite(value)) ||
  (typeof value === 'string' && value.length <= 64) ||
  (Array.isArray(value) && value.length <= 50 && value.every(isOptionId))
const validCustomServiceValues = (values) => record(values) && Object.keys(values).length <= 60 &&
  Object.entries(values).every(([fieldId, value]) => isOptionId(fieldId) && validCustomServiceValue(value))
const validLegacyServiceParameters = (parameters) =>
  (parameters.participants === null || numericInput(parameters.participants)) &&
  Array.isArray(parameters.addonIds) && parameters.addonIds.length <= 50 && parameters.addonIds.every(isOptionId) &&
  record(parameters.optionIds) && Object.keys(parameters.optionIds).length <= 50 &&
  Object.entries(parameters.optionIds).every(([groupId, optionId]) => isOptionId(groupId) && isOptionId(optionId))
const validServiceParameters = (parameters) => record(parameters) &&
  (Object.hasOwn(parameters, 'values') ? validCustomServiceValues(parameters.values) : validLegacyServiceParameters(parameters))
const validRental = (rental) => rental === null || (record(rental) && ['startsAt', 'endsAt'].every((key) => typeof rental[key] === 'string'))
const validPlaceDraft = (place) => record(place) && isOptionId(place.id) && typeof place.locationId === 'string' &&
  typeof place.eventDate === 'string' && validRental(place.rental) && (place.rentalMinutes === null || numericInput(place.rentalMinutes)) && numericInput(place.guestCount) &&
  record(place.parameters) && Object.keys(place.parameters).every((key) => ['hourlyRate', 'extras'].includes(key) && validServiceParameters(place.parameters[key])) &&
  Array.isArray(place.serviceSelections) && place.serviceSelections.length <= 500 &&
  place.serviceSelections.every((item) => record(item) && isOptionId(item.lineId) && typeof item.serviceId === 'string' &&
    numericInput(item.quantity) && (item.parameters === undefined || validServiceParameters(item.parameters)))
const validDraft = (draft) => record(draft) &&
  ['orderTypeId', 'locationId', 'customAddress', 'eventDate', 'clientId'].every((key) => typeof draft[key] === 'string') &&
  (draft.clientAddress === undefined || (record(draft.clientAddress) && ['town', 'street', 'house', 'room', 'comment'].every((key) => typeof draft.clientAddress[key] === 'string'))) &&
  (draft.adminComment === undefined || typeof draft.adminComment === 'string') &&
  ['company_location', 'client_address'].includes(draft.placeType) &&
  Array.isArray(draft.serviceSelections) && draft.serviceSelections.length <= 500 &&
  draft.serviceSelections.every((item) => record(item) && typeof item.serviceId === 'string' && numericInput(item.quantity) &&
    (item.parameters === undefined || validServiceParameters(item.parameters))) &&
  (draft.places == null || (Array.isArray(draft.places) && draft.places.length <= 10 && draft.places.every(validPlaceDraft))) &&
  record(draft.eventBrief) && record(draft.discount) && ['amount', 'percent'].includes(draft.discount.type) && numericInput(draft.discount.value) &&
  validRental(draft.rental)

export const getPartyOrderWizardDraftScope = (context, order = {}, inboxId = '') => {
  const tenantId = String(context?.tenantId || '')
  const staffId = String(context?.staff?._id || '')
  if (!tenantId || !staffId) return null
  return {
    key: `${STORAGE_PREFIX}:${tenantId}:${staffId}:${order._id || (inboxId ? `inbox:${inboxId}` : 'new')}`,
    signature: JSON.stringify({
      role: context.role,
      positionId: context.position?._id || '',
      permissions: context.position?.permissions || null,
      orderScope: context.position?.orderScope || null,
      revision: order.commercialRevision || 0,
      updatedAt: order.updatedAt || '',
    }),
  }
}

export const encodePartyOrderWizardDraft = (scope, value, now = Date.now()) => {
  if (!scope) return null
  const encoded = JSON.stringify({ version: VERSION, key: scope.key, signature: scope.signature, savedAt: now, value })
  return encoded.length <= MAX_SIZE ? encoded : null
}

export const decodePartyOrderWizardDraft = (scope, encoded, now = Date.now()) => {
  if (!scope || typeof encoded !== 'string' || encoded.length > MAX_SIZE) return null
  try {
    const saved = JSON.parse(encoded)
    const value = saved.value
    const legacy = saved.version === LEGACY_VERSION
    const lastStep = legacy ? LEGACY_STEPS.length - 1 : STEP.finance
    if (
      (!legacy && saved.version !== VERSION) || saved.key !== scope.key || saved.signature !== scope.signature ||
      !Number.isFinite(saved.savedAt) || now < saved.savedAt || now - saved.savedAt > MAX_AGE ||
      !record(value) || !validDraft(value.draft) ||
      !Number.isInteger(value.step) || value.step < STEP.lead || value.step > lastStep ||
      !Number.isInteger(value.reachedStep) || value.reachedStep < value.step || value.reachedStep > lastStep ||
      !numericInput(value.rentalMinutes) || !Array.isArray(value.expectations) || value.expectations.length > 500 ||
      !value.expectations.every(record) ||
      !record(value.initialPayment) || !numericInput(value.initialPayment.amount) ||
      !['transfer', 'cash', 'account'].includes(value.initialPayment.paymentMethod) ||
      (value.createdClients && (!Array.isArray(value.createdClients) || !value.createdClients.every((person) => record(person) && typeof person._id === 'string' && typeof person.name === 'string'))) ||
      (value.clientForm && (!record(value.clientForm) || typeof value.clientForm.open !== 'boolean' || !record(value.clientForm.draft) ||
        !['firstName', 'secondName', 'thirdName', 'email'].every((key) => typeof value.clientForm.draft[key] === 'string')))
    ) return null
    // An interrupted create must reuse its original operation and body.
    if (value.attempt && (
      typeof value.attempt.key !== 'string' || !value.attempt.key ||
      !record(value.attempt.body)
    )) return null
    if (!legacy) return value
    let step = LEGACY_STEPS[value.step] ?? STEP.lead
    if (step === STEP.brief && (!value.draft.clientId || value.clientForm?.open)) {
      step = STEP.client
    }
    return { ...value, step, reachedStep: LEGACY_STEPS[value.reachedStep] ?? STEP.lead }
  } catch {
    return null
  }
}
