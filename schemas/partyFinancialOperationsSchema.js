import { Schema } from 'mongoose'

const partyFinancialOperationsSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  settlementId: { type: Schema.Types.ObjectId, default: null },
  moneyTaskId: { type: Schema.Types.ObjectId, default: null },
  orderId: { type: Schema.Types.ObjectId, required: true },
  staffId: { type: Schema.Types.ObjectId, required: true },
  type: {
    type: String,
    enum: [
      'received_on_site',
      'payment',
      'correction',
      'custody_received_from_client',
      'custody_transferred_to_company',
    ],
    required: true,
  },
  amountKopecks: { type: Number, required: true },
  comment: { type: String, default: '', maxlength: 1000 },
  idempotencyKey: { type: String, required: true },
  payloadHash: { type: String, required: true },
  createdByStaffId: { type: Schema.Types.ObjectId, required: true },
}
export default partyFinancialOperationsSchema
