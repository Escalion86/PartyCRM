export const isPartyTrialActive = (billingSubject) => {
  if (!billingSubject?.trialEndsAt) return false
  const endsAt = new Date(billingSubject.trialEndsAt)
  if (Number.isNaN(endsAt.getTime())) return false
  return endsAt.getTime() > Date.now()
}

const normalizePositiveLimit = (value) => {
  const number = Number(value ?? 0)
  if (!Number.isFinite(number) || number <= 0) return Infinity
  return Math.floor(number)
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
      : normalizePositiveLimit(tariff?.eventsPerMonth),
    staffLimit: trialActive ? Infinity : normalizePositiveLimit(tariff?.staffLimit),
  }
}

export const serializePartyTariffAccess = (access = {}) => {
  const unlimitedEvents = access.eventsPerMonth === Infinity
  const unlimitedStaff = access.staffLimit === Infinity
  return {
    trialActive: Boolean(access.trialActive),
    hasTariff: Boolean(access.hasTariff),
    allowCalendarSync: Boolean(access.allowCalendarSync),
    allowStatistics: Boolean(access.allowStatistics),
    allowDocuments: Boolean(access.allowDocuments),
    allowTelephony: Boolean(access.allowTelephony),
    allowAi: Boolean(access.allowAi),
    eventsPerMonth: unlimitedEvents ? null : Number(access.eventsPerMonth ?? 0),
    unlimitedEvents,
    staffLimit: unlimitedStaff ? null : Number(access.staffLimit ?? 0),
    unlimitedStaff,
    tariff: access.tariff || null,
  }
}

export const canCreatePartyOrderByTariff = ({
  access,
  currentMonthOrdersCount = 0,
}) => {
  const limit = access?.eventsPerMonth ?? 0
  if (limit === Infinity || Number(limit) <= 0) return { ok: true }
  if (Number(currentMonthOrdersCount) >= Number(limit)) {
    return {
      ok: false,
      code: 'partycrm_tariff_orders_limit_reached',
      message: 'Лимит заказов по тарифу исчерпан',
    }
  }
  return { ok: true }
}

export const canCreatePartyStaffByTariff = ({
  access,
  currentStaffCount = 0,
}) => {
  const limit = access?.staffLimit ?? 0
  if (limit === Infinity || Number(limit) <= 0) return { ok: true }
  if (Number(currentStaffCount) >= Number(limit)) {
    return {
      ok: false,
      code: 'partycrm_tariff_staff_limit_reached',
      message: 'Лимит сотрудников по тарифу исчерпан',
    }
  }
  return { ok: true }
}

export const filterPartyOrderPayloadByTariffAccess = (payload = {}, access = {}) => {
  if (access.allowCalendarSync) return payload
  if (!Array.isArray(payload.additionalEvents)) return payload

  return {
    ...payload,
    additionalEvents: payload.additionalEvents.map((item) => ({
      ...item,
      googleCalendarEventId: '',
    })),
  }
}

export const getPartyUserTariffAccess = getPartyCompanyTariffAccess
