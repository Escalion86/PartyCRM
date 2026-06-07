import { formatMoney } from './formatMoney.js'

const ROLE_LABELS = {
  dev: 'Разработчик',
  admin: 'Администратор',
  support: 'Поддержка',
  user: 'Пользователь',
}

const BILLING_STATUSES = new Set(['active', 'paused', 'debt', 'cancelled'])

export const getPartyUserDisplayName = (user) => {
  const fullName = [user?.firstName, user?.secondName]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' ')
  return (
    fullName ||
    String(user?.phone || '').trim() ||
    String(user?.email || '').trim() ||
    'Без имени'
  )
}

export const getPartyUserRoleLabel = (role) =>
  ROLE_LABELS[String(role || '').trim()] || String(role || '')

export const getPartyCompanyBillingLabel = ({ company, tariff }) => {
  if (!tariff?.title) return 'Тариф не выбран'
  return `${tariff.title} · ${formatMoney(company?.balance ?? 0)}`
}

export const buildPartyCompanyTariffAdminPatch = (body = {}) => {
  const tariffId = String(body?.tariffId || '').trim()
  const patch = {
    tariffId: tariffId || null,
  }

  const billingStatus = String(body?.billingStatus || '').trim()
  if (BILLING_STATUSES.has(billingStatus)) {
    patch.billingStatus = billingStatus
  }

  const tariffActiveUntil = body?.tariffActiveUntil
    ? new Date(body.tariffActiveUntil)
    : null
  if (tariffActiveUntil && !Number.isNaN(tariffActiveUntil.getTime())) {
    patch.tariffActiveUntil = tariffActiveUntil
  }

  return patch
}
