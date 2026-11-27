import { calculatePartyServiceConfiguration } from './partyServiceConfiguration.js'

export const emptyPartyOrderServiceParameters = () => ({
  participants: '',
  addonIds: [],
  optionIds: {},
})

export const previewPartyOrderService = (service, prior, selection) => {
  const saved = prior?.serviceConfiguration
  const configuration = saved?.definition ?? ((!prior || selection.parameters) ? service?.configuration : null)
  const parameters = selection.parameters ?? saved?.parameters
  const item = {
    ...prior,
    serviceId: selection.serviceId,
    quantity: selection.quantity,
    unitPrice: prior?.unitPrice ?? service?.price ?? 0,
    durationMinutes: prior?.durationMinutes ?? service?.duration ?? 0,
    includedRentalMinutes: prior?.includedRentalMinutes ?? service?.includedRentalMinutes ?? 0,
    title: prior?.title || service?.title || 'Сохранённая услуга',
  }

  if (!configuration) return {
    item,
    configuration: null,
    error: parameters ? { message: 'Параметры услуги изменились в справочнике. Добавьте услугу заново.' } : null,
  }

  const input = parameters ?? emptyPartyOrderServiceParameters()
  const pricedService = saved ? {
    ...service,
    title: item.title,
    configuration,
    price: saved.basePrice ?? 0,
    duration: saved.baseDuration ?? 0,
  } : service

  try {
    const result = calculatePartyServiceConfiguration(pricedService, input)
    return {
      item: { ...item, unitPrice: result.unitPrice, durationMinutes: result.durationMinutes },
      configuration,
      parameters: input,
      normalizedParameters: result.parameters,
      error: null,
    }
  } catch (error) {
    return { item, configuration, parameters: input, error }
  }
}
