import { NextResponse } from 'next/server'
import {
  getPartyCompanyModel,
  getPartyStaffInviteModel,
  getPartyStaffModel,
  getPartyUserModel,
} from '@server/partyModels'
import { getPartySessionUser, normalizePartyInterfaceRoles } from '@server/partyAuth'
import { partyError } from '@server/partyApi'
import { sendPushToTenant } from '@server/pushNotifications'
import { buildPartyInviteAcceptedPushPayload } from '@server/partyPushCore'
import {
  getPartyStaffInviteAcceptanceDecision,
  getPartyStaffInviteEffectiveStatus,
  getPartyStaffInviteRoleLabel,
  hashPartyStaffInviteToken,
} from '@helpers/partyStaffInvites'

const getToken = async (params) => String((await params)?.token || '').trim()

export async function POST(req, { params }) {
  const sessionUser = await getPartySessionUser()
  if (!sessionUser?._id) {
    return partyError(401, 'unauthorized', 'Войдите в PartyCRM', 'auth')
  }

  const token = await getToken(params)
  const PartyInvites = await getPartyStaffInviteModel()
  const invite = token
    ? await PartyInvites.findOne({
        tokenHash: hashPartyStaffInviteToken(token),
      }).lean()
    : null
  if (!invite) {
    return partyError(404, 'partycrm_invite_invalid', 'Приглашение не найдено')
  }

  const effectiveStatus = getPartyStaffInviteEffectiveStatus(invite)
  if (effectiveStatus === 'expired') {
    await PartyInvites.updateOne(
      { _id: invite._id, status: 'active' },
      { $set: { status: 'expired' } }
    )
    invite.status = 'expired'
  }

  const [PartyCompanies, PartyStaff] = await Promise.all([
    getPartyCompanyModel(),
    getPartyStaffModel(),
  ])
  const [company, staff, existingCompanyStaff] = await Promise.all([
    PartyCompanies.findOne({
      _id: invite.tenantId,
      status: { $ne: 'archived' },
    })
      .select('_id title status settings.notifications')
      .lean(),
    PartyStaff.findOne({
      _id: invite.staffId,
      tenantId: invite.tenantId,
      status: { $ne: 'archived' },
    }).lean(),
    PartyStaff.findOne({
      tenantId: invite.tenantId,
      authUserId: String(sessionUser._id),
      status: { $ne: 'archived' },
    })
      .select('_id')
      .lean(),
  ])
  if (!company || !staff) {
    return partyError(410, 'partycrm_invite_target_unavailable', 'Компания или сотрудник недоступны')
  }

  const decision = getPartyStaffInviteAcceptanceDecision({
    invite,
    sessionUser,
    staff,
    existingCompanyStaff,
  })
  if (!decision.ok) {
    if (decision.code === 'partycrm_invite_staff_changed') {
      await PartyInvites.updateOne(
        { _id: invite._id, status: 'active' },
        { $set: { status: 'revoked', revokedAt: new Date() } }
      )
    }
    const status = decision.code === 'partycrm_invite_phone_mismatch' ? 403 : 409
    return partyError(status, decision.code, decision.message, 'validation')
  }

  if (!decision.idempotent) {
    const acceptedInvite = await PartyInvites.findOneAndUpdate(
      {
        _id: invite._id,
        status: 'active',
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          status: 'accepted',
          acceptedByUserId: String(sessionUser._id),
          acceptedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    ).lean()
    if (!acceptedInvite) {
      const latest = await PartyInvites.findById(invite._id).lean()
      if (
        latest?.status !== 'accepted' ||
        String(latest.acceptedByUserId) !== String(sessionUser._id)
      ) {
        return partyError(409, 'partycrm_invite_not_active', 'Приглашение уже недействительно')
      }
    }

    const linkedStaff = await PartyStaff.findOneAndUpdate(
      {
        _id: invite.staffId,
        tenantId: invite.tenantId,
        status: { $ne: 'archived' },
        $or: [
          { authUserId: '' },
          { authUserId: { $exists: false } },
          { authUserId: String(sessionUser._id) },
        ],
      },
      {
        $set: {
          authUserId: String(sessionUser._id),
          linkedAuthUserId: String(sessionUser._id),
          role: invite.role,
          status: 'active',
          linkStatus: 'linked',
          linkConfirmedAt: new Date(),
        },
      },
      { returnDocument: 'after' }
    ).lean()
    if (!linkedStaff) {
      await PartyInvites.updateOne(
        {
          _id: invite._id,
          status: 'accepted',
          acceptedByUserId: String(sessionUser._id),
        },
        {
          $set: {
            status: 'revoked',
            revokedByUserId: String(sessionUser._id),
            revokedAt: new Date(),
          },
          $unset: { acceptedByUserId: '', acceptedAt: '' },
        }
      )
      return partyError(
        409,
        'partycrm_invite_staff_already_linked',
        'Карточка сотрудника уже привязана к другому аккаунту'
      )
    }
  }

  const PartyUsers = await getPartyUserModel()
  const currentRoles = normalizePartyInterfaceRoles(sessionUser.interfaceRoles)
  const interfaceRoles = [...new Set([...currentRoles, decision.interfaceRole])]
  const userUpdate = {
    interfaceRoles,
    lastWorkspace: decision.interfaceRole,
  }
  if (decision.interfaceRole === 'performer') {
    userUpdate.performerOnboardingCompletedAt =
      sessionUser.performerOnboardingCompletedAt || new Date()
  }
  await PartyUsers.updateOne({ _id: sessionUser._id }, { $set: userUpdate })

  if (
    !decision.idempotent &&
    company?.settings?.notifications?.pushEnabled === true
  ) {
    const staffName = [staff.secondName, staff.firstName]
      .filter(Boolean)
      .join(' ')
      .trim()
    try {
      await sendPushToTenant({
        tenantId: invite.tenantId,
        product: 'partycrm',
        companyId: invite.tenantId,
        source: 'party-staff-invite-accepted',
        payload: buildPartyInviteAcceptedPushPayload({
          companyId: invite.tenantId,
          companyTitle: company.title,
          staffId: invite.staffId,
          staffName,
          roleLabel: getPartyStaffInviteRoleLabel(invite.role),
        }),
      })
    } catch (pushError) {
      console.warn('party staff invite accepted push failed', {
        companyId: String(invite.tenantId),
        staffId: String(invite.staffId),
        error: pushError?.message,
      })
    }
  }

  return NextResponse.json({
    success: true,
    data: {
      accepted: true,
      idempotent: decision.idempotent,
      redirectTo: decision.redirectTo,
    },
  })
}
