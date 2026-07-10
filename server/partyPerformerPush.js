import { getPartyStaffModel, getPartyUserModel } from './partyModels'
import { collectPartyPerformerAssignmentPushTargets } from './partyPerformerPushCore'
import {
  buildPartyPerformerAssignmentPushPayload,
  buildPartyPerformerLinkRequestPushPayload,
} from './partyPushCore'
import { sendPushToTenant } from './pushNotifications'

const idOf = (value) => String(value?._id ?? value?.id ?? value ?? '').trim()

const uniqueAssignmentStaffIds = (order) => [
  ...new Set(
    (Array.isArray(order?.assignedStaff) ? order.assignedStaff : [])
      .map((item) => idOf(item?.staffId))
      .filter(Boolean)
  ),
]

const getStaffName = (staff) =>
  [staff?.secondName, staff?.firstName].filter(Boolean).join(' ').trim()

const loadStaffByIds = async ({ tenantId, staffIds }) => {
  if (!tenantId || staffIds.length === 0) return new Map()
  const PartyStaff = await getPartyStaffModel()
  const staff = await PartyStaff.find({
    _id: { $in: staffIds },
    tenantId,
    status: { $ne: 'archived' },
  })
    .select('_id authUserId linkedAuthUserId firstName secondName')
    .lean()

  return new Map(staff.map((item) => [idOf(item), item]))
}

const loadPerformerPushEnabledByUserId = async (userIds = []) => {
  const ids = [...new Set(userIds.map(idOf).filter(Boolean))]
  if (ids.length === 0) return new Map()

  const PartyUsers = await getPartyUserModel()
  const users = await PartyUsers.find({
    _id: { $in: ids },
    status: { $ne: 'archived' },
  })
    .select('_id performerSettings.notifications')
    .lean()

  return new Map(
    users.map((user) => [
      idOf(user),
      user?.performerSettings?.notifications?.pushEnabled !== false,
    ])
  )
}

export const sendPartyPerformerAssignmentPushes = async ({
  tenantId,
  company = null,
  previousOrder = null,
  nextOrder = null,
  source = 'party-performer-assignment',
} = {}) => {
  if (!tenantId || !nextOrder) return { attempted: 0, sent: 0, failed: 0 }
  if (company?.settings?.notifications?.pushEnabled !== true) {
    return { attempted: 0, sent: 0, failed: 0, skipped: 'push_disabled' }
  }

  try {
    const staffById = await loadStaffByIds({
      tenantId,
      staffIds: uniqueAssignmentStaffIds(nextOrder),
    })
    const targets = collectPartyPerformerAssignmentPushTargets({
      previousOrder,
      nextOrder,
      staffById,
    })
    const pushEnabledByUserId = await loadPerformerPushEnabledByUserId(
      targets.map((target) => target.userId)
    )
    const enabledTargets = targets.filter(
      (target) => pushEnabledByUserId.get(idOf(target.userId)) !== false
    )
    let sent = 0
    let failed = 0

    for (const target of enabledTargets) {
      try {
        const result = await sendPushToTenant({
          tenantId,
          product: 'partycrm',
          companyId: tenantId,
          userId: target.userId,
          targetUserId: target.userId,
          source,
          payload: buildPartyPerformerAssignmentPushPayload({
            companyId: tenantId,
            companyTitle: company?.title || '',
            orderId: idOf(nextOrder),
            orderTitle: nextOrder.title || nextOrder.serviceTitle || 'Заказ',
            staffId: target.staffId,
            eventDate: nextOrder.eventDate,
            changeType: target.changeType,
          }),
        })
        if (result?.ok) sent += 1
      } catch (error) {
        failed += 1
        console.warn('party performer assignment push failed', {
          companyId: String(tenantId),
          orderId: idOf(nextOrder),
          staffId: target.staffId,
          error: error?.message,
        })
      }
    }

    return { attempted: enabledTargets.length, sent, failed }
  } catch (error) {
    console.warn('party performer assignment push lookup failed', {
      companyId: String(tenantId),
      orderId: idOf(nextOrder),
      error: error?.message,
    })
    return {
      attempted: 0,
      sent: 0,
      failed: 1,
      error: 'party_performer_push_lookup_failed',
    }
  }
}

export const sendPartyPerformerLinkRequestPush = async ({
  tenantId,
  company = null,
  staff = null,
  targetUserId = '',
  source = 'party-performer-link-request',
} = {}) => {
  const userId = String(targetUserId || '').trim()
  if (!tenantId || !staff || !userId) {
    return { attempted: 0, sent: 0, failed: 0 }
  }
  if (company?.settings?.notifications?.pushEnabled !== true) {
    return { attempted: 0, sent: 0, failed: 0, skipped: 'push_disabled' }
  }

  try {
    const pushEnabledByUserId = await loadPerformerPushEnabledByUserId([userId])
    if (pushEnabledByUserId.get(userId) === false) {
      return {
        attempted: 0,
        sent: 0,
        failed: 0,
        skipped: 'performer_push_disabled',
      }
    }

    const result = await sendPushToTenant({
      tenantId,
      product: 'partycrm',
      companyId: tenantId,
      userId,
      targetUserId: userId,
      allowCrossTenantUserTarget: true,
      source,
      payload: buildPartyPerformerLinkRequestPushPayload({
        companyId: tenantId,
        companyTitle: company?.title || '',
        staffId: idOf(staff),
        staffName: getStaffName(staff),
      }),
    })
    return { attempted: 1, sent: result?.ok ? 1 : 0, failed: 0 }
  } catch (error) {
    console.warn('party performer link request push failed', {
      companyId: String(tenantId),
      staffId: idOf(staff),
      error: error?.message,
    })
    return { attempted: 1, sent: 0, failed: 1 }
  }
}
