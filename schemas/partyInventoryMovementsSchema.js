import { Schema } from 'mongoose'

const partyInventoryMovementsSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  idempotencyKey: { type: String, required: true },
  payloadHash: { type: String, required: true },
  operation: {
    type: String,
    enum: ['issue', 'transfer', 'return'],
    required: true,
  },
  resourceId: { type: Schema.Types.ObjectId, required: true },
  orderId: { type: Schema.Types.ObjectId, required: true },
  fromStaffId: { type: Schema.Types.ObjectId, default: null },
  toStaffId: { type: Schema.Types.ObjectId, default: null },
  actorStaffId: { type: Schema.Types.ObjectId, required: true },
  quantity: { type: Number, required: true, min: 1 },
  expectedReturnAt: { type: Date, default: null },
  condition: {
    type: String,
    enum: ['ok', 'needs_cleaning', 'damaged'],
    default: 'ok',
  },
  comment: { type: String, default: '', maxlength: 2000 },
  resourceTitle: { type: String, default: '' },
  orderTitle: { type: String, default: '' },
  fromStaffName: { type: String, default: '' },
  toStaffName: { type: String, default: '' },
  actorStaffName: { type: String, default: '' },
}
export default partyInventoryMovementsSchema
