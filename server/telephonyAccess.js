import Users from '@models/Users'
import getTenantContext from '@server/getTenantContext'
import getUserTariffAccess from '@server/getUserTariffAccess'

const DEV_ONLY_ERROR = 'Функция IP-телефонии и AI-заявок доступна только разработчику'
const TARIFF_ERROR =
  'IP-телефония доступна только на тарифе с включенной опцией IP-телефония'
const AI_TARIFF_ERROR =
  'ИИ-возможности доступны только на тарифе с включенной опцией ИИ-возможности'

export const requireTelephonyDevAccess = async () => {
  const { tenantId, user } = await getTenantContext()
  if (!tenantId || !user?._id) {
    return {
      ok: false,
      status: 401,
      error: 'Не авторизован',
      tenantId: null,
      user: null,
    }
  }

  if (user?.role !== 'dev') {
    return {
      ok: false,
      status: 403,
      error: DEV_ONLY_ERROR,
      tenantId,
      user,
    }
  }

  return {
    ok: true,
    status: 200,
    error: '',
    tenantId,
    user,
  }
}

export const isTelephonyTenantAllowed = async (tenantId) => {
  if (!tenantId) return false
  const owner = await Users.findById(tenantId).select('role').lean()
  return owner?.role === 'dev'
}

export const requireTelephonyTariffAccess = async () => {
  const { tenantId, user } = await getTenantContext()
  if (!tenantId || !user?._id) {
    return {
      ok: false,
      status: 401,
      error: 'Не авторизован',
      tenantId: null,
      user: null,
    }
  }

  const access = await getUserTariffAccess(user._id)
  if (!access?.allowTelephony) {
    return {
      ok: false,
      status: 403,
      error: TARIFF_ERROR,
      tenantId,
      user,
    }
  }

  return {
    ok: true,
    status: 200,
    error: '',
    tenantId,
    user,
    access,
  }
}

export const requireAiTariffAccess = async () => {
  const baseAccess = await requireTelephonyTariffAccess()
  if (!baseAccess.ok) return baseAccess

  if (!baseAccess.access?.allowAi) {
    return {
      ...baseAccess,
      ok: false,
      status: 403,
      error: AI_TARIFF_ERROR,
    }
  }

  return baseAccess
}

export const isTelephonyTariffAllowedForTenant = async (tenantId) => {
  if (!tenantId) return false
  const access = await getUserTariffAccess(tenantId)
  return Boolean(access?.allowTelephony)
}
