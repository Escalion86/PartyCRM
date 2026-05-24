import { NextResponse } from 'next/server'
import { getPartyStaffModel } from '@server/partyModels'
import { isValidObjectId, parseJsonBody, partyError } from '@server/partyApi'
import { getPartySessionUser } from '@server/partyAuth'

const getStaffId = async (params) => {
  const resolved = await params
  return resolved?.staffId
}

export async function PATCH(req, { params }) {
  const sessionUser = await getPartySessionUser()

  if (!sessionUser?._id) {
    return partyError(401, 'unauthorized', 'Не авторизован', 'auth')
  }

  const staffId = await getStaffId(params)
  if (!isValidObjectId(staffId)) {
    return partyError(400, 'partycrm_invalid_staff_id', 'Некорректный staffId')
  }

  const body = await parseJsonBody(req)
  const action = String(body.action || '').trim()
  if (!['confirm', 'reject'].includes(action)) {
    return partyError(
      400,
      'partycrm_invalid_link_request_action',
      'Некорректное действие',
      'validation'
    )
  }

  const PartyStaff = await getPartyStaffModel()
  const update =
    action === 'confirm'
      ? {
          authUserId: String(sessionUser._id),
          linkedAuthUserId: String(sessionUser._id),
          linkStatus: 'linked',
          linkConfirmedAt: new Date(),
        }
      : {
          linkedAuthUserId: '',
          linkStatus: 'rejected',
          linkConfirmedAt: null,
        }

  const staff = await PartyStaff.findOneAndUpdate(
    {
      _id: staffId,
      linkedAuthUserId: String(sessionUser._id),
      linkStatus: 'link_requested',
      status: { $ne: 'archived' },
    },
    { $set: update },
    { returnDocument: 'after' }
  ).lean()

  if (!staff) {
    return partyError(
      404,
      'partycrm_link_request_not_found',
      'Запрос на привязку не найден'
    )
  }

  return NextResponse.json({
    success: true,
    data: {
      _id: String(staff._id),
      linkStatus: staff.linkStatus,
      authUserId: staff.authUserId || '',
    },
  })
}
