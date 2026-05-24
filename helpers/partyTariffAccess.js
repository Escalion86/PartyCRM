export const isPartyTrialActive = (user) => {
  if (!user?.trialEndsAt) return false
  const endsAt = new Date(user.trialEndsAt)
  if (Number.isNaN(endsAt.getTime())) return false
  return endsAt.getTime() > Date.now()
}

export const getPartyUserTariffAccess = (user, tariffs = []) => {
  const trialActive = isPartyTrialActive(user)
  const tariffId = user?.tariffId ? String(user.tariffId) : null
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
