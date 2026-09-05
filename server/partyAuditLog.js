import { getPartyAuditLogModel } from './partyModels.js'
import {
  buildPartyOrderAuditChanges,
  getPartyAuditActor,
  getPartyOrderAuditTitle,
  toPartyAuditId,
} from './partyAuditLogCore.js'

export {
  buildPartyOrderAuditChanges,
  getPartyAuditActor,
  getPartyOrderAuditTitle,
} from './partyAuditLogCore.js'

export const recordPartyOrderAudit = async ({
  context,
  orderId,
  order,
  previousOrder,
  action,
  summary,
  changes,
  metadata = {},
}) => {
  const entityId = toPartyAuditId(orderId || order || previousOrder)
  if (!context?.tenantId || !entityId || !action || !summary) return null

  try {
    const PartyAuditLogs = await getPartyAuditLogModel()
    return await PartyAuditLogs.create({
      tenantId: context.tenantId,
      ...getPartyAuditActor(context),
      action,
      entityType: 'order',
      entityId,
      entityTitle: getPartyOrderAuditTitle(order || previousOrder),
      summary,
      changes:
        changes ?? buildPartyOrderAuditChanges(previousOrder, order),
      metadata,
    })
  } catch (error) {
    console.error('PartyCRM audit log write failed', {
      tenantId: String(context.tenantId),
      entityId,
      action,
      error: error?.message || String(error),
    })
    return null
  }
}
