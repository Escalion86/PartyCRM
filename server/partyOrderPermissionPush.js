import { getPartyStaffModel, getPartyRoleModel, getPartyUserModel } from './partyModels'
import { canPartyAccess } from '../helpers/partyRolePermissions'
import { sendPushToTenant } from './pushNotifications'

export const sendPartyOrderScopedPush = async ({ tenantId, company, order, payload, source = 'party-order' }) => {
  if (!company?.settings?.notifications?.pushEnabled || !order) return { sent: 0 }
  const [Staff, Roles, Users] = await Promise.all([getPartyStaffModel(), getPartyRoleModel(), getPartyUserModel()])
  const [staff, roles] = await Promise.all([Staff.find({ tenantId, status: 'active', authUserId: { $ne: null } }).lean(), Roles.find({ tenantId }).lean()])
  const permitted = staff.filter((person) => {
    const position = roles.find((role) => person.positionId ? String(person.positionId) === String(role._id) : role.systemKey === person.role)
    return canPartyAccess({ tenantId, staff: person, role: person.role, position, company }, { resource: 'orders', order })
  })
  const users = await Users.find({ _id: { $in: permitted.map((person) => person.authUserId) }, status: 'active' }).select('_id performerSettings.notifications').lean()
  let sent = 0
  for (const user of users) {
    if (user.performerSettings?.notifications?.pushEnabled === false) continue
    const result = await sendPushToTenant({ tenantId, companyId: tenantId, product: 'partycrm', targetUserId: String(user._id), userId: String(user._id), source,
      // A title/name/phone from the raw payload may be hidden by field permissions.
      payload: { title: 'Обновление заявки', body: 'В компании есть заявка, доступная вашей должности.', icon: '/icons/icon-192.png', tag: `party-order-${order._id}`, data: { type: 'party_order', companyId: String(tenantId), orderId: String(order._id), url: '/performer/work' } },
    })
    sent += Number(result?.sent || 0)
  }
  return { sent }
}
