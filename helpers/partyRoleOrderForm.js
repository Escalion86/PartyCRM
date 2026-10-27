import { canPartyAccess } from './partyRolePermissions.js'

export const PARTY_ROLE_ORDER_FIELD_RESOURCES = {
  title: 'orders.title',
  clientId: 'orders.clientId',
  eventDate: 'orders.eventDate',
  dateEnd: 'orders.dateEnd',
  durationMinutes: 'orders.durationMinutes',
  placeType: 'orders.placeType',
  locationId: 'orders.locationId',
  customAddress: 'orders.customAddress',
  serviceTitle: 'orders.serviceTitle',
  servicesIds: 'orders.servicesIds',
  responsibleStaffId: 'orders.responsibleStaffId',
  adminComment: 'orders.adminComment',
  performerComment: 'orders.performerComment',
  eventBrief: 'orders.eventBrief',
  contactRoles: 'orders.contactRoles',
  otherContacts: 'orders.otherContacts',
  contractAmount: 'finance.clientAmount',
  assignedStaff: 'orders.assignedStaff',
}

const dateFields = new Set(['eventDate', 'dateEnd'])
const numberFields = new Set(['durationMinutes', 'contractAmount'])
const idFields = new Set(['clientId', 'locationId', 'responsibleStaffId'])
const arrays = new Set(['servicesIds', 'assignedStaff', 'otherContacts'])
const normalized = (field, value) => {
  if (dateFields.has(field)) return value ? new Date(value).toISOString() : null
  if (numberFields.has(field))
    return value === '' || value == null ? 0 : Number(value)
  if (idFields.has(field)) return value ? String(value) : null
  if (arrays.has(field)) return value || []
  if (field === 'placeType') return value || 'company_location'
  if (field === 'contactRoles' || field === 'eventBrief') return value || {}
  return value ?? ''
}
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right)
const assignmentIdentity = (items = []) =>
  items.map((item) => ({
    staffId: String(item.staffId),
    role: item.role || 'performer',
  }))

export const partyOrderDateInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
  return Number.isFinite(+date)
    ? new Date(+date - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16)
    : ''
}

export const createPartyRoleOrderDraft = (order = {}) => {
  const draft = {}
  for (const field of Object.keys(PARTY_ROLE_ORDER_FIELD_RESOURCES)) {
    if (!Object.hasOwn(order, field)) continue
    draft[field] = structuredClone(order[field])
  }
  return draft
}

// The API has already authorized which order DTOs are returned. Do not re-run
// record scope on a masked DTO: hidden team/location fields are absent from it.
// The server rechecks the complete record and every changed field on write.
export const buildPartyRoleOrderPatch = ({
  order = {},
  draft = {},
  context,
}) => {
  const patch = {},
    forbiddenFields = []
  for (const [field, resource] of Object.entries(
    PARTY_ROLE_ORDER_FIELD_RESOURCES
  )) {
    if (!Object.hasOwn(draft, field)) continue
    const next = normalized(field, draft[field]),
      previous = normalized(field, order[field])
    if (equal(next, previous)) continue
    if (field === 'assignedStaff') {
      const teamChanged = !equal(
        assignmentIdentity(next),
        assignmentIdentity(previous)
      )
      const payoutsChanged = next.some((item) => {
        const prior = previous.find(
          (value) => String(value.staffId) === String(item.staffId)
        )
        return ['payoutAmount', 'payoutStatus'].some(
          (key) =>
            Object.hasOwn(item, key) &&
            (key === 'payoutAmount'
              ? Number(item[key] || 0) !== Number(prior?.[key] || 0)
              : (item[key] || 'planned') !== (prior?.[key] || 'planned'))
        )
      })
      if (
        (teamChanged &&
          !canPartyAccess(context, { resource, action: 'edit' })) ||
        (payoutsChanged &&
          !canPartyAccess(context, {
            resource: 'finance.payouts',
            action: 'edit',
          }))
      ) {
        forbiddenFields.push(field)
        continue
      }
      patch.assignedStaff = next.map((item) => ({
        staffId: item.staffId,
        role: item.role || 'performer',
        ...(canPartyAccess(context, {
          resource: 'finance.payouts',
          action: 'edit',
        })
          ? {
              payoutAmount: Number(item.payoutAmount || 0),
              payoutStatus: item.payoutStatus || 'planned',
            }
          : {}),
      }))
    } else if (canPartyAccess(context, { resource, action: 'edit' }))
      patch[field] = next
    else forbiddenFields.push(field)
  }
  return {
    patch,
    forbiddenFields,
    dirty: Object.keys(patch).length > 0 || forbiddenFields.length > 0,
  }
}
