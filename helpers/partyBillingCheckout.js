export const PARTY_BILLING_PROVIDER_ENDPOINTS = {
  yookassa: '/api/party/billing/yookassa/create',
  tochka: '/api/party/billing/tochka/create',
}

export const isFreePartyTariff = (tariff) => {
  if (!tariff) return false
  const price = Number(tariff.price ?? 0)
  return Number.isFinite(price) && price <= 0
}

export const getPartyTariffCheckoutRequest = ({ tariff }) => {
  if (!tariff?._id) return null

  return {
    endpoint: '/api/party/billing/tariff/select',
    body: {
      tariffId: String(tariff._id),
    },
    requiresPayment: false,
  }
}

export const getPartyBalanceTopUpRequest = ({ provider, amount }) => {
  const endpoint = PARTY_BILLING_PROVIDER_ENDPOINTS[provider]
  const value = Number(amount ?? 0)
  if (!endpoint || !Number.isFinite(value) || value <= 0) return null

  return {
    endpoint,
    body: {
      purpose: 'balance',
      amount: Math.floor(value),
    },
    requiresPayment: true,
  }
}
