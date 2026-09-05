import { Schema } from 'mongoose'

const partyInventoryHoldingsSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  resourceId: { type: Schema.Types.ObjectId, required: true },
  orderId: { type: Schema.Types.ObjectId, required: true },
  holderStaffId: { type: Schema.Types.ObjectId, required: true },
  quantity: { type: Number, required: true, min: 0 },
  issuedAt: { type: Date, required: true },
  expectedReturnAt: { type: Date, default: null },
}
export default partyInventoryHoldingsSchema
