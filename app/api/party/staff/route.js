import { NextResponse } from 'next/server'
import { getPartyStaffModel, getPartyUserModel } from '@server/partyModels'
import {
  getPartyRequestContext,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import { normalizePartyPhone } from '@server/partyAuth'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { validateStaffLocationScope } from '@server/partyLocationAccess'
import { canCreatePartyStaffByTariff } from '@helpers/partyTariffAccess'

const normalizePhone = (phone) => {
  if (!phone) return ''
  return String(phone).replace(/[^\d]/g, '')
}

const normalizeEmail = (email) => {
  if (!email) return ''
  return String(email).trim().toLowerCase()
}

const normalizeText = (value, maxLength = 160) =>
  typeof value === 'string' ? value.trim().slice(0, maxLength) : ''

const sanitizeLinkCandidate = (user) =>
  user
    ? {
        _id: String(user._id),
        firstName: user.firstName || '',
        secondName: user.secondName || '',
        phone: user.phone || '',
        email: user.email || '',
      }
    : null

const enrichStaffWithLinkCandidates = async (staff) => {
  const candidatePhones = [
    ...new Set(
      staff
        .filter((person) => !person.authUserId)
        .map((person) => normalizePartyPhone(person.phone))
        .filter(Boolean)
    ),
  ]

  if (candidatePhones.length === 0) return staff

  const PartyUsers = await getPartyUserModel()
  const users = await PartyUsers.find({
    phone: { $in: candidatePhones },
    status: { $ne: 'archived' },
  })
    .select('_id firstName secondName phone email')
    .lean()
  const usersByPhone = new Map(
    users.map((user) => [normalizePartyPhone(user.phone), user])
  )

  return staff.map((person) => {
    const candidate = usersByPhone.get(normalizePartyPhone(person.phone))
    if (!candidate || person.authUserId) return person

    return {
      ...person,
      hasLinkCandidate: true,
      linkCandidate: sanitizeLinkCandidate(candidate),
    }
  })
}

const normalizeStaffPayload = (body) => {
  const authUserId = normalizeText(body.authUserId)

  return {
    authUserId,
    firstName: normalizeText(body.firstName, 100),
    secondName: normalizeText(body.secondName, 100),
    phone: normalizePhone(body.phone),
    email: normalizeEmail(body.email),
    specialization: [
      '',
      'animator',
      'magician',
      'host',
      'photographer',
      'workshop',
      'other',
    ].includes(body.specialization)
      ? body.specialization
      : '',
    description: normalizeText(body.description, 1000),
    role: ['owner', 'admin', 'performer', 'location_owner'].includes(body.role)
      ? body.role
      : 'performer',
    status: ['active', 'invited', 'paused', 'archived'].includes(body.status)
      ? body.status
      : 'active',
    visibleToPerformer:
      typeof body.visibleToPerformer === 'boolean'
        ? body.visibleToPerformer
        : true,
    linkStatus: ['unlinked', 'link_requested', 'linked', 'rejected'].includes(
      body.linkStatus
    )
      ? body.linkStatus
      : authUserId
        ? 'linked'
        : 'unlinked',
  }
}

export async function GET(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const PartyStaff = await getPartyStaffModel()
  const staff = await PartyStaff.find({
    tenantId: context.tenantId,
    status: { $ne: 'archived' },
  })
    .sort({ role: 1, secondName: 1, firstName: 1, createdAt: 1 })
    .lean()

  const enrichedStaff = await enrichStaffWithLinkCandidates(staff)

  return NextResponse.json({ success: true, data: enrichedStaff })
}

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const payload = normalizeStaffPayload(body)
  if (payload.role === 'location_owner') {
    try {
      payload.locationIds = await validateStaffLocationScope(
        context.tenantId,
        body.locationIds
      )
    } catch (failure) {
      return partyError(
        failure.status || 400,
        'partycrm_invalid_location_scope',
        failure.status ? failure.message : 'Не удалось проверить площадки',
        'validation'
      )
    }
  }

  if (!payload.authUserId && (!payload.firstName || !payload.phone)) {
    return partyError(
      400,
      'partycrm_staff_contact_required',
      'Для подрядчика без аккаунта укажите имя и телефон',
      'validation'
    )
  }

  const PartyStaff = await getPartyStaffModel()
  const currentStaffCount = await PartyStaff.countDocuments({
    tenantId: context.tenantId,
    status: { $ne: 'archived' },
  })
  const { access } = await getPartyCompanyTariffAccessState(context.company)
  const limitState = canCreatePartyStaffByTariff({
    access,
    currentStaffCount,
  })
  if (!limitState.ok) {
    return partyError(403, limitState.code, limitState.message, 'permission')
  }

  const staff = await PartyStaff.create({
    ...payload,
    tenantId: context.tenantId,
  })

  return NextResponse.json({ success: true, data: staff }, { status: 201 })
}
