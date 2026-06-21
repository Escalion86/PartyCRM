import { NextResponse } from 'next/server'
import { getPartyStaffModel, getPartyUserModel } from '@server/partyModels'
import {
  getPartyRequestContext,
  isValidObjectId,
  partyError,
} from '@server/partyApi'
import { normalizePartyPhone } from '@server/partyAuth'
import { sendPartyPerformerLinkRequestPush } from '@server/partyPerformerPush'

const getId = async (params) => {
  const resolved = await params
  return resolved?.id
}

const sanitizeUser = (user) => ({
  _id: String(user._id),
  firstName: user.firstName || '',
  secondName: user.secondName || '',
  phone: user.phone || '',
  email: user.email || '',
})

const findLinkCandidate = async (staff) => {
  const phone = normalizePartyPhone(staff?.phone)
  if (!phone) return null

  const PartyUsers = await getPartyUserModel()
  return PartyUsers.findOne({
    phone,
    status: { $ne: 'archived' },
  })
    .select('_id firstName secondName phone email')
    .lean()
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

  const PartyStaff = await getPartyStaffModel()
  const staff = await PartyStaff.findOne({
    _id: id,
    tenantId: context.tenantId,
    status: { $ne: 'archived' },
  }).lean()

  if (!staff) {
    return partyError(404, 'partycrm_staff_not_found', 'Сотрудник не найден')
  }

  if (staff.authUserId || staff.linkStatus === 'linked') {
    return partyError(
      400,
      'partycrm_staff_already_linked',
      'Карточка сотрудника уже привязана к аккаунту',
      'validation'
    )
  }

  const candidate = await findLinkCandidate(staff)
  if (!candidate) {
    return partyError(
      404,
      'partycrm_link_candidate_not_found',
      'Аккаунт с таким телефоном не найден',
      'validation'
    )
  }

  const updatedStaff = await PartyStaff.findOneAndUpdate(
    { _id: id, tenantId: context.tenantId },
    {
      $set: {
        linkedAuthUserId: String(candidate._id),
        linkStatus: 'link_requested',
        linkRequestedAt: new Date(),
        linkConfirmedAt: null,
      },
    },
    { returnDocument: 'after' }
  ).lean()

  await sendPartyPerformerLinkRequestPush({
    tenantId: context.tenantId,
    company: context.company,
    staff: updatedStaff,
    targetUserId: String(candidate._id),
  })

  return NextResponse.json({
    success: true,
    data: {
      ...updatedStaff,
      hasLinkCandidate: true,
      linkCandidate: sanitizeUser(candidate),
    },
  })
}
