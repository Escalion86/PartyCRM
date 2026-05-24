import { NextResponse } from 'next/server'
import { getPartyOrderModel } from '@server/partyModels'
import {
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import getPartyMembershipContext from '@server/getPartyMembershipContext'

const ALLOWED_STATUSES = new Set(['confirmed', 'declined', 'done'])

const getId = async (params) => {
  const resolved = await params
  return resolved?.id
}

export async function PATCH(req, { params }) {
  const { sessionUser, memberships } = await getPartyMembershipContext()

  if (!sessionUser?._id) {
    return partyError(401, 'unauthorized', 'Не авторизован', 'auth')
  }

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(400, 'partycrm_invalid_order_id', 'Некорректный id')
  }

  const body = await parseJsonBody(req)
  const confirmationStatus = String(body.confirmationStatus || '').trim()
  const staffId = String(body.staffId || '').trim()

  if (!ALLOWED_STATUSES.has(confirmationStatus)) {
    return partyError(
      400,
      'partycrm_invalid_confirmation_status',
      'Некорректный статус участия',
      'validation'
    )
  }

  if (!isValidObjectId(staffId)) {
    return partyError(400, 'partycrm_invalid_staff_id', 'Некорректный staffId')
  }

  const membership = memberships.find(
    (item) => String(item.staffId) === staffId && item.status !== 'archived'
  )

  if (!membership) {
    return partyError(
      403,
      'partycrm_performer_staff_access_denied',
      'Нет доступа к этой карточке исполнителя',
      'auth'
    )
  }

  const PartyOrders = await getPartyOrderModel()
  const order = await PartyOrders.findOneAndUpdate(
    {
      _id: id,
      tenantId: membership.tenantId,
      status: { $nin: ['canceled', 'closed'] },
      'assignedStaff.staffId': staffId,
    },
    {
      $set: {
        'assignedStaff.$.confirmationStatus': confirmationStatus,
      },
    },
    { returnDocument: 'after' }
  ).lean()

  if (!order) {
    return partyError(
      404,
      'partycrm_performer_order_not_found',
      'Назначенный заказ не найден'
    )
  }

  const assignment = (order.assignedStaff ?? []).find(
    (item) => String(item.staffId) === staffId
  )

  return NextResponse.json({
    success: true,
    data: {
      orderId: String(order._id),
      staffId,
      confirmationStatus: assignment?.confirmationStatus || confirmationStatus,
    },
  })
}
