import {
  calculatePartyBooking,
  calculatePartyBookingDiscount,
  partyBookingFailure,
  partyMoneyKopecks,
} from './partyOrderBooking.js'
import {
  calculatePartyServiceConfiguration,
  normalizePartyServiceConfiguration,
  redactPartyServiceConfigurationPrices,
} from './partyServiceConfiguration.js'

const ruleKeys = ['hourlyRate', 'extras']
const zeroDiscount = { type: 'amount', value: 0 }
const record = (value) => value && typeof value === 'object' && !Array.isArray(value)

export const normalizePartyLocationRentalConfiguration = (value) => {
  if (value == null) return null
  if (!record(value) || Object.keys(value).some((key) => !ruleKeys.includes(key)))
    partyBookingFailure('Проверьте правила расчёта аренды')

  const definition = Object.fromEntries(ruleKeys.map((key) => {
    if (value[key] == null) return [key, null]
    if (!Array.isArray(value[key]?.fields)) partyBookingFailure('Добавьте параметры расчёта аренды')
    const configuration = normalizePartyServiceConfiguration(value[key])
    if (configuration?.fields.some((field) =>
      field.durationPerUnit || field.tiers?.some((tier) => tier.durationMinutes) ||
      field.options?.some((option) => option.durationDelta)
    )) partyBookingFailure('Параметры аренды меняют цену. Время аренды задаётся отдельно в заказе')
    return [key, configuration]
  }))
  return ruleKeys.some((key) => definition[key]) ? definition : null
}

export const redactPartyLocationRentalConfiguration = (definition) => definition
  ? Object.fromEntries(ruleKeys.map((key) => [key, redactPartyServiceConfigurationPrices(definition[key])]))
  : null

export const redactPartyLocationRentalSnapshot = (snapshot) => snapshot ? {
  definition: redactPartyLocationRentalConfiguration(snapshot.definition),
  parameters: snapshot.parameters,
  details: snapshot.details,
} : null

export const calculatePartyPlaceBooking = ({ location, rental, items, parameters, locationConfiguration }) => {
  const definition = locationConfiguration ? locationConfiguration.definition : location?.rentalConfiguration ?? null
  const baseHourlyRate = locationConfiguration ? locationConfiguration.baseHourlyRate ?? 0 : location?.hourlyRentalRate ?? 0
  const input = parameters ?? locationConfiguration?.parameters ?? {}
  if (!record(input) || Object.keys(input).some((key) => !ruleKeys.includes(key) || (input[key] != null && !definition?.[key])))
    partyBookingFailure('Проверьте параметры аренды')

  const savedParameters = {}
  const details = []
  const ruleAmount = (key, base) => {
    if (!definition?.[key]) return base
    const result = calculatePartyServiceConfiguration({ price: base, duration: 0, configuration: definition[key] }, input[key] ?? {})
    savedParameters[key] = result.parameters
    details.push(...result.details)
    return result.unitPrice
  }
  const hourlyRate = ruleAmount('hourlyRate', baseHourlyRate)
  const rentalExtrasKopecks = partyMoneyKopecks(ruleAmount('extras', 0))
  const pricing = calculatePartyBooking({ items, rental, hourlyRate })
  const subtotalKopecks = pricing.subtotalKopecks + rentalExtrasKopecks
  if (!Number.isSafeInteger(subtotalKopecks)) partyBookingFailure('Сумма по месту слишком велика')
  return {
    pricingSnapshot: { ...pricing, rentalExtrasKopecks, subtotalKopecks, totalKopecks: subtotalKopecks },
    locationConfiguration: { definition, parameters: savedParameters, details, baseHourlyRate },
  }
}

export const calculatePartyMultiPlaceTotal = (places, discount = zeroDiscount) => {
  let servicesKopecks = 0
  let rentalKopecks = 0
  let rentalExtrasKopecks = 0
  let first = Infinity
  let last = -Infinity
  for (const { pricingSnapshot, eventDate, dateEnd } of places) {
    servicesKopecks += pricingSnapshot.servicesKopecks
    rentalKopecks += pricingSnapshot.rentalKopecks
    rentalExtrasKopecks += pricingSnapshot.rentalExtrasKopecks ?? 0
    if (eventDate && dateEnd) {
      first = Math.min(first, +new Date(eventDate))
      last = Math.max(last, +new Date(dateEnd))
    }
  }
  const subtotalKopecks = servicesKopecks + rentalKopecks + rentalExtrasKopecks
  const discountKopecks = calculatePartyBookingDiscount(subtotalKopecks, discount)
  return {
    servicesKopecks,
    rentalKopecks,
    rentalExtrasKopecks,
    subtotalKopecks,
    discountKopecks,
    totalKopecks: subtotalKopecks - discountKopecks,
    durationMinutes: Number.isFinite(last - first) ? Math.ceil((last - first) / 60000) : 0,
  }
}
