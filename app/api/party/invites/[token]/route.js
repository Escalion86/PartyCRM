import { NextResponse } from 'next/server'
import {
  getPartyCompanyModel,
  getPartyStaffInviteModel,
  getPartyStaffModel,
} from '@server/partyModels'
import {
  buildPartyStaffInvitePublicView,
  getPartyStaffInviteEffectiveStatus,
  hashPartyStaffInviteToken,
  isPartyStaffInviteTargetCurrent,
} from '@helpers/partyStaffInvites'

const getToken = async (params) => String((await params)?.token || '').trim()

export async function GET(req, { params }) {
  const token = await getToken(params)
  if (!token) {
    return NextResponse.json(
      { success: false, error: { code: 'partycrm_invite_invalid', message: 'Приглашение не найдено' } },
      { status: 404 }
    )
  }

  const PartyInvites = await getPartyStaffInviteModel()
  const invite = await PartyInvites.findOne({
    tokenHash: hashPartyStaffInviteToken(token),
  }).lean()
  if (!invite) {
    return NextResponse.json(
      { success: false, error: { code: 'partycrm_invite_invalid', message: 'Приглашение не найдено' } },
      { status: 404 }
    )
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
  const [company, staff] = await Promise.all([
    PartyCompanies.findOne({
      _id: invite.tenantId,
      status: { $ne: 'archived' },
    })
      .select('_id title status')
      .lean(),
    PartyStaff.findOne({
      _id: invite.staffId,
      tenantId: invite.tenantId,
      status: { $ne: 'archived' },
    })
      .select('_id firstName secondName phone role status authUserId linkStatus')
      .lean(),
  ])

  if (!company || !staff) {
    return NextResponse.json({
      success: true,
      data: buildPartyStaffInvitePublicView({
        invite: { ...invite, status: 'revoked' },
        company: null,
        staff: null,
      }),
    })
  }


  if (
    invite.status === 'active' &&
    !isPartyStaffInviteTargetCurrent({ invite, staff })
  ) {
    await PartyInvites.updateOne(
      { _id: invite._id, status: 'active' },
      { $set: { status: 'revoked', revokedAt: new Date() } }
    )
    invite.status = 'revoked'
  }

  return NextResponse.json({
    success: true,
    data: buildPartyStaffInvitePublicView({ invite, company, staff }),
  })
}
