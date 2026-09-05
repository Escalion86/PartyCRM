import { PRODUCTS } from './productContext'
import { getProductModel } from './productDbConnect'
import schemaDefinition from '@schemas/partyInboxStatesSchema'

export const getPartyInboxStateModel = () => getProductModel({
  product: PRODUCTS.PARTYCRM,
  name: 'PartyInboxState',
  collectionName: 'inboxStates',
  schemaDefinition,
  schemaOptions: { timestamps: true },
  configureSchema: (schema) => {
    schema.index({ tenantId: 1, channel: 1, sourceId: 1 }, { unique: true })
    schema.index({ tenantId: 1, nextContactAt: 1 })
    schema.index({ tenantId: 1, responseDueAt: 1 })
    schema.index({ tenantId: 1, proposedAssigneeStaffId: 1 })
  },
})
