import { formatAddressPoolShort } from './addressPool.js'
import { isPartyCompanyModuleEnabled } from './partyCompanyModules.js'

export const canOpenPartyOrderWizard = (order, can) =>
  Boolean(order?._id) &&
  !['closed', 'canceled'].includes(order.status) &&
  can('orders.title') &&
  ['orders.title', 'orders.servicesIds', 'orders.eventDate'].some((field) => can(field, 'edit'))

const hasId = (id) => /^[a-f\d]{24}$/i.test(String(id || ''))
const timeOf = (value) => value ? new Date(value).getTime() : NaN

const getProgramDuration = (order, services) => {
  const catalogDurations = new Map(services.map((service) => [String(service._id), service.duration]))
  const items = order.orderItems?.length
    ? order.orderItems
    : (order.servicesIds || []).map((serviceId) => ({ serviceId, quantity: 1 }))
  const duration = items.reduce((total, item) => {
    const minutes = item.durationMinutes ?? catalogDurations.get(String(item.serviceId)) ?? 0
    return total + Number(minutes) * Number(item.quantity)
  }, 0)
  return Math.ceil(duration)
}

export const getPartyOrderWizardInitialStep = ({ order, can, company, services = [], locations = [] }) => {
  if (!canOpenPartyOrderWizard(order, can)) return null
  if (can('orders.title', 'edit') && !hasId(order.orderTypeId)) return 0

  const offsiteAllowed = isPartyCompanyModuleEnabled(company, 'offsite')
  const placeType = order.placeType || (
    offsiteAllowed && (company?.settings?.noOwnPremises || !locations.length)
      ? 'client_address'
      : 'company_location'
  )
  const canReadPlace = can('orders.placeType')
  const canEditAddress = can('orders.customAddress', 'edit') || can('orders.clientAddress', 'edit')
  if (canReadPlace && placeType === 'company_location' && can('orders.locationId', 'edit') && !hasId(order.locationId))
    return 1
  if (canReadPlace && placeType === 'client_address' && canEditAddress) {
    const address = String(order.customAddress || '').trim() || formatAddressPoolShort({ ...order.clientAddress, comment: '' })
    if (!address.trim()) return 1
  }

  const duration = getProgramDuration(order, services)
  if (canReadPlace && placeType === 'client_address' && can('orders.servicesIds', 'edit') && !(duration > 0))
    return 2

  if (can('orders.eventDate', 'edit') && can('orders.dateEnd', 'edit')) {
    const start = timeOf(order.eventDate)
    if (!Number.isFinite(start)) return 3
    if (canReadPlace && placeType === 'company_location') {
      // Legacy venue orders use their event interval until an explicit rental is set.
      const rentalStart = order.rental ? timeOf(order.rental.startsAt) : start
      const rentalEnd = timeOf(order.rental ? order.rental.endsAt : order.dateEnd)
      if (!Number.isFinite(rentalStart) || !Number.isFinite(rentalEnd) ||
        rentalEnd <= rentalStart || start < rentalStart || start + duration * 60000 > rentalEnd)
        return 3
    }
  }
  if (can('orders.clientId', 'edit') && !hasId(order.clientId)) return 4
  return null
}
