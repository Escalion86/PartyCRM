import { NextResponse } from 'next/server'
import {
  getPartyStaffInviteModel,
  getPartyStaffModel,
} from '@server/partyModels'
import {
  getPartyRequestContext,
  isValidObjectId,
  partyError,
} from '@server/partyApi'
import { normalizePartyPhone } from '@server/partyAuth'
import {
  createPartyStaffInviteToken,
  buildPartyStaffInviteUrl,
  buildPartyStaffInviteShareContent,
  getPartyStaffInviteEffectiveStatus,
  getPartyStaffInviteExpiry,
  hashPartyStaffInviteToken,
  isPartyStaffInviteTargetCurrent,
  isPartyStaffInviteRole,
} from '@helpers/partyStaffInvites'

const getId = async (params) => (await params)?.id

const serializeInvite = (invite) =>
  invite
    ? {
        _id: String(invite._id),
        status: getPartyStaffInviteEffectiveStatus(invite),
        role: invite.role,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
        acceptedAt: invite.acceptedAt || null,
        revokedAt: invite.revokedAt || null,
      }
    : null

const getStaff = async ({ id, tenantId }) => {
  const PartyStaff = await getPartyStaffModel()
  return PartyStaff.findOne({
    _id: id,
    tenantId,
    status: { $ne: 'archived' },
  }).lean()
}

export async function GET(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error
  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_staff_id', 'Некорректный id')
  }

  const staff = await getStaff({ id, tenantId: context.tenantId })
  if (!staff) return partyError(404, 'partycrm_staff_not_found', 'Сотрудник не найден')

  const PartyInvites = await getPartyStaffInviteModel()
  const invite = await PartyInvites.findOne({
    tenantId: context.tenantId,
    staffId: id,
  })
    .sort({ createdAt: -1 })
    .lean()
  if (invite && getPartyStaffInviteEffectiveStatus(invite) === 'expired') {
    await PartyInvites.updateOne(
      { _id: invite._id, status: 'active' },
      { $set: { status: 'expired' } }
    )
    invite.status = 'expired'
  } else if (
    invite?.status === 'active' &&
    !isPartyStaffInviteTargetCurrent({ invite, staff })
  ) {
    await PartyInvites.updateOne(
      { _id: invite._id, status: 'active' },
      { $set: { status: 'revoked', revokedAt: new Date() } }
    )
    invite.status = 'revoked'
  }

  return NextResponse.json({ success: true, data: serializeInvite(invite) })
}

export async function POST(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error
  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_staff_id', 'Некорректный id')
  }

  const staff = await getStaff({ id, tenantId: context.tenantId })
  if (!staff) return partyError(404, 'partycrm_staff_not_found', 'Сотрудник не найден')
  if (staff.authUserId || staff.linkStatus === 'linked') {
    return partyError(409, 'partycrm_staff_already_linked', 'Сотрудник уже подключён')
  }
  if (!isPartyStaffInviteRole(staff.role)) {
    return partyError(
      400,
      'partycrm_invite_role_invalid',
      'Пригласить можно только администратора или исполнителя',
      'validation'
    )
  }
  const phone = normalizePartyPhone(staff.phone)
  if (phone.length !== 11) {
    return partyError(
      400,
      'partycrm_invite_phone_required',
      'Укажите корректный телефон сотрудника',
      'validation'
    )
  }

  const PartyInvites = await getPartyStaffInviteModel()
  const now = new Date()
  await PartyInvites.updateMany(
    { tenantId: context.tenantId, staffId: id, status: 'active' },
    {
      $set: {
        status: 'revoked',
        revokedByUserId: String(context.sessionUser._id),
        revokedAt: now,
      },
    }
  )

  const token = createPartyStaffInviteToken()
  const invite = await PartyInvites.create({
    tenantId: context.tenantId,
    staffId: id,
    role: staff.role,
    phone,
    tokenHash: hashPartyStaffInviteToken(token),
    expiresAt: getPartyStaffInviteExpiry(now),
    createdByUserId: String(context.sessionUser._id),
  })

  const PartyStaff = await getPartyStaffModel()
  await PartyStaff.updateOne(
    { _id: id, tenantId: context.tenantId, authUserId: '' },
    { $set: { status: 'invited', linkStatus: 'unlinked' } }
  )

  const inviteUrl = buildPartyStaffInviteUrl({
    token,
    domain: process.env.DOMAIN,
    requestUrl: req.url,
  })
  const staffName = [staff.secondName, staff.firstName]
    .filter(Boolean)
    .join(' ')
    .trim()
  return NextResponse.json(
    {
      success: true,
      data: {
        ...serializeInvite(invite),
        inviteUrl,
        share: buildPartyStaffInviteShareContent({
          companyTitle: context.company?.title,
          staffName,
          role: staff.role,
          inviteUrl,
        }),
      },
    },
    { status: 201 }
  )
}

export async function DELETE(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error
  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_staff_id', 'Некорректный id')
  }
  const staff = await getStaff({ id, tenantId: context.tenantId })
  if (!staff) return partyError(404, 'partycrm_staff_not_found', 'Сотрудник не найден')

  const PartyInvites = await getPartyStaffInviteModel()
  const result = await PartyInvites.updateMany(
    { tenantId: context.tenantId, staffId: id, status: 'active' },
    {
      $set: {
        status: 'revoked',
        revokedByUserId: String(context.sessionUser._id),
        revokedAt: new Date(),
      },
    }
  )
  return NextResponse.json({ success: true, data: { revoked: result.modifiedCount } })
}
