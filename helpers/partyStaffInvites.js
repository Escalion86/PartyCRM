import crypto from 'node:crypto'

export const PARTY_STAFF_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

const INVITE_ROLE_LABELS = Object.freeze({
  admin: 'Администратор',
  performer: 'Исполнитель',
})

const normalizePhone = (value) => {
  const digits = String(value ?? '').replace(/\D/g, '')
  if (digits.length === 10) return `7${digits}`
  if (digits.length === 11 && digits.startsWith('8')) return `7${digits.slice(1)}`
  return digits
}

const normalizeId = (value) => String(value ?? '').trim()

export const createPartyStaffInviteToken = () =>
  crypto.randomBytes(32).toString('base64url')

export const hashPartyStaffInviteToken = (token) =>
  crypto.createHash('sha256').update(String(token ?? '')).digest('hex')

export const getPartyStaffInviteExpiry = (now = new Date()) =>
  new Date(new Date(now).getTime() + PARTY_STAFF_INVITE_TTL_MS)

export const isPartyStaffInviteRole = (role) =>
  Object.hasOwn(INVITE_ROLE_LABELS, String(role ?? '').trim())

export const getPartyStaffInviteRoleLabel = (role) =>
  INVITE_ROLE_LABELS[String(role ?? '').trim()] || 'Сотрудник'

export const buildPartyStaffInviteUrl = ({
  token = '',
  domain = '',
  requestUrl = '',
} = {}) => {
  const configuredDomain = String(domain || '').trim()
  const baseUrl = configuredDomain
    ? configuredDomain.replace(/\/+$/, '')
    : new URL(requestUrl).origin
  return `${baseUrl}/party/invite/${encodeURIComponent(String(token || '').trim())}`
}

export const buildPartyStaffInviteShareContent = ({
  companyTitle = '',
  staffName = '',
  role = '',
  inviteUrl = '',
} = {}) => {
  const safeCompanyTitle = String(companyTitle || '').trim() || 'компанию PartyCRM'
  const safeStaffName = String(staffName || '').trim()
  const safeInviteUrl = String(inviteUrl || '').trim()
  const roleLabel = getPartyStaffInviteRoleLabel(role)
  const greeting = safeStaffName ? `${safeStaffName}, вас` : 'Вас'
  const text = `${greeting} пригласили в ${safeCompanyTitle} в роли «${roleLabel}». Для подключения откройте ссылку: ${safeInviteUrl}`
  const subject = `Приглашение в ${safeCompanyTitle}`

  return {
    text,
    smsUrl: `sms:?body=${encodeURIComponent(text)}`,
    emailUrl: `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`,
    telegramUrl: `https://t.me/share/url?url=${encodeURIComponent(safeInviteUrl)}&text=${encodeURIComponent(text)}`,
    whatsappUrl: `https://wa.me/?text=${encodeURIComponent(text)}`,
  }
}

export const maskPartyStaffInvitePhone = (value) => {
  const phone = normalizePhone(value)
  if (phone.length !== 11) return ''
  return `+7 (***) ***-**-${phone.slice(-2)}`
}

export const getPartyStaffInviteEffectiveStatus = (
  invite,
  now = new Date()
) => {
  const status = String(invite?.status ?? '')
  if (status !== 'active') return status || 'invalid'
  const expiresAt = new Date(invite?.expiresAt)
  if (Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime()) {
    return 'expired'
  }
  return 'active'
}

export const isPartyStaffInviteTargetCurrent = ({ invite, staff }) => {
  const inviteRole = String(invite?.role ?? '').trim()
  const staffRole = String(staff?.role ?? '').trim()
  const invitePhone = normalizePhone(invite?.phone)
  const staffPhone = normalizePhone(staff?.phone)

  if (staffRole && staffRole !== inviteRole) return false
  if (staffPhone && staffPhone !== invitePhone) return false
  if (staff?.authUserId || staff?.linkStatus === 'linked') return false
  return true
}

export const buildPartyStaffInvitePublicView = ({ invite, company, staff }) => {
  const status = String(invite?.status ?? 'invalid')
  const role = String(invite?.role ?? '')
  const firstName = String(staff?.firstName ?? '').trim()
  const secondName = String(staff?.secondName ?? '').trim()

  return {
    status,
    role,
    roleLabel: getPartyStaffInviteRoleLabel(role),
    maskedPhone: maskPartyStaffInvitePhone(invite?.phone),
    expiresAt: invite?.expiresAt
      ? new Date(invite.expiresAt).toISOString()
      : null,
    companyTitle: String(company?.title ?? 'Компания'),
    staffName:
      [secondName, firstName].filter(Boolean).join(' ').trim() || 'Сотрудник',
    registrationPrefill:
      status === 'active'
        ? {
            phone: normalizePhone(invite?.phone),
            firstName,
            secondName,
            interfaceRoleMode: role === 'admin' ? 'company' : 'performer',
          }
        : null,
  }
}

const rejection = (code, message) => ({ ok: false, code, message })

export const getPartyStaffInviteAcceptanceDecision = ({
  invite,
  sessionUser,
  staff,
  existingCompanyStaff,
}) => {
  const role = String(invite?.role ?? '')
  const interfaceRole = role === 'admin' ? 'company' : 'performer'
  const redirectTo = role === 'admin' ? '/company' : '/performer'
  const userId = normalizeId(sessionUser?._id)
  const staffUserId = normalizeId(staff?.authUserId)

  if (!isPartyStaffInviteRole(role)) {
    return rejection('partycrm_invite_role_invalid', 'Роль приглашения недоступна')
  }

  if (staffUserId && staffUserId === userId) {
    return { ok: true, idempotent: true, interfaceRole, redirectTo }
  }

  if (!isPartyStaffInviteTargetCurrent({ invite, staff })) {
    return rejection(
      'partycrm_invite_staff_changed',
      'Данные сотрудника изменились. Попросите администратора перевыпустить приглашение'
    )
  }

  if (String(invite?.status ?? '') !== 'active') {
    return rejection('partycrm_invite_not_active', 'Приглашение недействительно')
  }
  if (!userId) {
    return rejection('unauthorized', 'Не авторизован')
  }
  if (normalizePhone(invite?.phone) !== normalizePhone(sessionUser?.phone)) {
    return rejection(
      'partycrm_invite_phone_mismatch',
      'Телефон аккаунта не совпадает с телефоном приглашения'
    )
  }
  if (staffUserId && staffUserId !== userId) {
    return rejection(
      'partycrm_invite_staff_already_linked',
      'Карточка сотрудника уже привязана к другому аккаунту'
    )
  }
  if (
    existingCompanyStaff &&
    normalizeId(existingCompanyStaff._id) !== normalizeId(staff?._id)
  ) {
    return rejection(
      'partycrm_invite_membership_exists',
      'Аккаунт уже подключён к этой компании'
    )
  }
  if (String(staff?.status ?? '') === 'archived') {
    return rejection('partycrm_invite_staff_archived', 'Карточка сотрудника архивирована')
  }

  return { ok: true, idempotent: false, interfaceRole, redirectTo }
}
