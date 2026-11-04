const VERSION = 1
const MAX_AGE = 24 * 60 * 60 * 1000
const MAX_SIZE = 200000
const record = (value) => value && typeof value === 'object' && !Array.isArray(value)
const numericInput = (value) => ['string', 'number'].includes(typeof value) && Number.isFinite(Number(value))
const validDraft = (draft) => record(draft) &&
  ['orderTypeId', 'locationId', 'customAddress', 'eventDate', 'clientId'].every((key) => typeof draft[key] === 'string') &&
  (draft.adminComment === undefined || typeof draft.adminComment === 'string') &&
  ['company_location', 'client_address'].includes(draft.placeType) &&
  Array.isArray(draft.serviceSelections) && draft.serviceSelections.length <= 500 &&
  draft.serviceSelections.every((item) => record(item) && typeof item.serviceId === 'string' && numericInput(item.quantity)) &&
  record(draft.eventBrief) && record(draft.discount) && ['amount', 'percent'].includes(draft.discount.type) && numericInput(draft.discount.value) &&
  (draft.rental === null || (record(draft.rental) && ['startsAt', 'endsAt'].every((key) => typeof draft.rental[key] === 'string')))

export const getPartyOrderWizardDraftScope = (context, order = {}) => {
  const tenantId = String(context?.tenantId || '')
  const staffId = String(context?.staff?._id || '')
  if (!tenantId || !staffId) return null
  return {
    key: `partycrm:order-wizard:${VERSION}:${tenantId}:${staffId}:${order._id || 'new'}`,
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
    if (
      saved.version !== VERSION || saved.key !== scope.key || saved.signature !== scope.signature ||
      !Number.isFinite(saved.savedAt) || now < saved.savedAt || now - saved.savedAt > MAX_AGE ||
      !record(value) || !validDraft(value.draft) ||
      !Number.isInteger(value.step) || value.step < -1 || value.step > 5 ||
      !Number.isInteger(value.reachedStep) || value.reachedStep < value.step || value.reachedStep > 5 ||
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
    return value
  } catch {
    return null
  }
}
