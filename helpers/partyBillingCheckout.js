export const PARTY_BILLING_PROVIDER_ENDPOINTS = {
  yookassa: '/api/party/billing/yookassa/create',
  tochka: '/api/party/billing/tochka/create',
}

export const isFreePartyTariff = (tariff) => {
  if (!tariff) return false
  const price = Number(tariff.price ?? 0)
  return Number.isFinite(price) && price <= 0
}

export const getPartyTariffCheckoutRequest = ({ tariff, provider }) => {
  if (!tariff?._id) return null
  if (isFreePartyTariff(tariff)) {
    return {
      endpoint: '/api/party/billing/tariff/select',
      body: {
        tariffId: String(tariff._id),
      },
      requiresPayment: false,
    }
  }

  const endpoint = PARTY_BILLING_PROVIDER_ENDPOINTS[provider]
  if (!endpoint) return null

  return {
    endpoint,
    body: {
      tariffId: String(tariff._id),
      purpose: 'tariff',
      amount: Number(tariff.price ?? 0),
    },
    requiresPayment: true,
  }
}
