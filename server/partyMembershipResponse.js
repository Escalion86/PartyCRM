// API response boundary only. Internal membership context retains server credentials.
const text = (value) => (typeof value === 'string' ? value : '')
const id = (value) => (value == null ? null : String(value))
const date = (value) => {
  if (!value) return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null
}
const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0)
const isManager = (role) => ['owner', 'admin'].includes(role)

const serializeIntegrationIndicators = (integrations = {}) => {
  const output = {}
  const statuses = new Set([
    'connected',
    'disconnected',
    'disabled',
    'error',
    'warning',
    'checking',
    'not_configured',
    'bot_ready',
  ])
  for (const provider of ['avito', 'vk', 'novofon', 'telegramBusiness', 'ai']) {
    output[`${provider}Enabled`] = integrations[`${provider}Enabled`] === true
    const status = integrations[`${provider}Status`]
    output[`${provider}Status`] = statuses.has(status) ? status : ''
    output[`${provider}LastCheckedAt`] = date(
      integrations[`${provider}LastCheckedAt`]
    )
  }
  return output
}

export const serializePartyMembershipCompany = (company, role) => {
  if (!company) return null
  const settings = company.settings || {}
  const safe = {
    _id: id(company._id),
    tenantId: id(company.tenantId),
    title: text(company.title),
    status: text(company.status),
    settings: { timeZone: text(settings.timeZone) || 'Asia/Krasnoyarsk' },
  }
  if (!isManager(role)) return safe
  Object.assign(safe, {
    legalTitle: text(company.legalTitle),
    phone: text(company.phone),
    email: text(company.email),
    tariffId: id(company.tariffId),
    balance: number(company.balance),
    billingStatus: text(company.billingStatus),
    tariffActiveUntil: date(company.tariffActiveUntil),
    nextChargeAt: date(company.nextChargeAt),
    trialActivatedAt: date(company.trialActivatedAt),
    trialEndsAt: date(company.trialEndsAt),
    trialUsed: company.trialUsed === true,
  })
  safe.settings.defaultTown = text(settings.defaultTown)
  safe.settings.orderNumberFormat = text(settings.orderNumberFormat)
  safe.settings.defaultOrderDurationMinutes =
    number(settings.defaultOrderDurationMinutes) || 60
  for (const key of [
    'towns',
    'orderTypes',
    'eventTypes',
    'serviceTypes',
    'preparationStatuses',
    'leadSources',
    'paymentMethods',
    'expenseCategories',
  ]) {
    safe.settings[key] = Array.isArray(settings[key])
      ? settings[key].filter((value) => typeof value === 'string')
      : []
  }
  safe.settings.integrations = serializeIntegrationIndicators(
    settings.integrations
  )
  safe.settings.googleCalendar = {
    enabled: settings.googleCalendar?.enabled === true,
    connected: Boolean(
      settings.googleCalendar?.refreshToken ||
      settings.googleCalendar?.accessToken
    ),
    lastSyncAt: date(settings.googleCalendar?.lastSyncAt),
  }
  return safe
}

export const serializePartyMembershipStaff = (staff) => {
  if (!staff) return null
  const safe = { _id: id(staff._id), tenantId: id(staff.tenantId) }
  for (const key of [
    'authUserId',
    'linkedAuthUserId',
    'firstName',
    'secondName',
    'phone',
    'email',
    'specialization',
    'description',
    'role',
    'status',
    'linkStatus',
  ])
    safe[key] = text(staff[key])
  for (const key of [
    'linkRequestedAt',
    'linkConfirmedAt',
    'lastLoginAt',
    'createdAt',
    'updatedAt',
  ])
    safe[key] = date(staff[key])
  safe.visibleToPerformer = staff.visibleToPerformer !== false
  safe.isDeveloperAccess = staff.isDeveloperAccess === true
  safe.locationIds = Array.isArray(staff.locationIds)
    ? staff.locationIds
        .map(String)
        .filter((value) => /^[a-f\d]{24}$/i.test(value))
    : []
  return safe
}

export const serializePartyMembershipResponse = (membership) => {
  const role = text(membership.role)
  return {
    staffId: id(membership.staffId),
    tenantId: id(membership.tenantId),
    role,
    status: text(membership.status),
    isOwner: role === 'owner',
    isAdmin: isManager(role),
    isPerformer: role === 'performer',
    isDeveloperAccess: membership.isDeveloperAccess === true,
    isLocationOwner: role === 'location_owner',
    locationIds: Array.isArray(membership.staff?.locationIds)
      ? membership.staff.locationIds
          .map(String)
          .filter((value) => /^[a-f\d]{24}$/i.test(value))
      : [],
    staff: serializePartyMembershipStaff(membership.staff),
    company: serializePartyMembershipCompany(membership.company, role),
  }
}
