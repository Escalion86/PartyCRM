export const isPartyTrialActive = (billingSubject) => {
  if (!billingSubject?.trialEndsAt) return false
  const endsAt = new Date(billingSubject.trialEndsAt)
  if (Number.isNaN(endsAt.getTime())) return false
  return endsAt.getTime() > Date.now()
}

export const getPartyCompanyTariffAccess = (company, tariffs = []) => {
  const trialActive = isPartyTrialActive(company)
  const tariffId = company?.tariffId ? String(company.tariffId) : null
  const tariff =
    tariffId && Array.isArray(tariffs)
      ? tariffs.find((item) => String(item?._id) === tariffId)
      : null

  return {
    trialActive,
    tariff,
    hasTariff: Boolean(tariff),
    allowCalendarSync: trialActive || Boolean(tariff?.allowCalendarSync),
    allowStatistics: trialActive || Boolean(tariff?.allowStatistics),
    allowDocuments: trialActive || Boolean(tariff?.allowDocuments),
    allowTelephony: Boolean(tariff?.allowTelephony),
    allowAi: Boolean(tariff?.allowAi),
    eventsPerMonth: trialActive
      ? Infinity
      : Number(tariff?.eventsPerMonth ?? 0),
  }
}

export const getPartyUserTariffAccess = getPartyCompanyTariffAccess
