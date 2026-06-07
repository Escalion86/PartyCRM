import { formatMoney } from './formatMoney.js'
import { isFreePartyTariff } from './partyBillingCheckout.js'

const PROVIDER_META = {
  yookassa: {
    label: 'ЮKassa',
    description: 'Карта, СБП и другие способы ЮKassa',
  },
  tochka: {
    label: 'Точка',
    description: 'СБП через Точка Банк',
  },
}

const PAYMENT_STATUS_LABELS = {
  succeeded: 'Завершён',
  pending: 'В обработке',
  failed: 'Ошибка',
  canceled: 'Отменён',
}

export const getPartyBillingProviderOptions = (billingConfig) => {
  const providers = billingConfig?.providers ?? {}
  return Object.entries(PROVIDER_META)
    .filter(([provider]) => providers[provider])
    .map(([value, meta]) => ({ value, ...meta }))
}

export const getPartyPaymentStatusLabel = (status) =>
  PAYMENT_STATUS_LABELS[status] || String(status || '')

export const getPartyTariffSelectOptions = (tariffs = []) =>
  tariffs
    .filter((tariff) => tariff?._id)
    .map((tariff) => {
      const price = Number(tariff.price ?? 0)
      const priceLabel =
        Number.isFinite(price) && price > 0
          ? `${formatMoney(price)}/мес`
          : 'бесплатно'
      return {
        value: String(tariff._id),
        label: `${tariff.title || 'Без названия'} - ${priceLabel}`,
      }
    })

const availableLabel = (enabled) => (enabled ? 'Доступно' : 'Недоступно')

export const getPartyTariffAccessRows = (access = {}) => [
  {
    label: 'Заказы в месяц',
    value: access.unlimitedEvents
      ? 'Без ограничений'
      : String(Number(access.eventsPerMonth ?? 0)),
  },
  {
    label: 'Сотрудники',
    value: access.unlimitedStaff
      ? 'Без ограничений'
      : String(Number(access.staffLimit ?? 0)),
  },
  { label: 'Документы', value: availableLabel(access.allowDocuments) },
  { label: 'Статистика', value: availableLabel(access.allowStatistics) },
  { label: 'Google Calendar', value: availableLabel(access.allowCalendarSync) },
  { label: 'Телефония', value: availableLabel(access.allowTelephony) },
  { label: 'AI', value: availableLabel(access.allowAi) },
]

export const getPartyTariffActionState = ({
  tariff,
  activeTariffId,
  selectedProvider,
  loading = false,
}) => {
  const isActive =
    Boolean(tariff?._id) && String(tariff._id) === String(activeTariffId || '')
  const isFree = isFreePartyTariff(tariff)
  const price = Number(tariff?.price ?? 0)

  return {
    isActive,
    isFree,
    disabled: Boolean(loading || isActive || (!isFree && !selectedProvider)),
    buttonLabel: isFree ? 'Выбрать' : `Купить за ${formatMoney(price)}`,
  }
}
