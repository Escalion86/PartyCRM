import { Schema } from 'mongoose'

const partyPaymentExpectationsSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  orderId: { type: Schema.Types.ObjectId, required: true },
  staffId: { type: Schema.Types.ObjectId, default: null },
  createKey: { type: String, default: undefined },
  createActorId: { type: String, default: undefined },
  createFingerprint: { type: String, default: undefined },
  type: { type: String, enum: ['income', 'expense'], required: true },
  category: { type: String, required: true },
  amountKopecks: {
    type: Number,
    required: true,
    min: 1,
    validate: Number.isSafeInteger,
  },
  paidKopecks: {
    type: Number,
    default: 0,
    min: 0,
    validate: Number.isSafeInteger,
  },
  dueAt: { type: Date, required: true },
  paymentMethod: { type: String, required: true },
  comment: { type: String, default: '', maxlength: 1000 },
  status: {
    type: String,
    enum: ['pending', 'completed', 'canceled'],
    default: 'pending',
  },
  revision: { type: Number, default: 0 },
  createdByStaffId: { type: Schema.Types.ObjectId, required: true },
  fulfillments: {
    type: [
      new Schema(
        {
          transactionId: { type: Schema.Types.ObjectId, required: true },
          amountKopecks: { type: Number, required: true },
          key: { type: String, required: true },
          fingerprint: { type: String, required: true },
          date: { type: Date, required: true },
        },
        { _id: false }
      ),
    ],
    default: [],
  },
}
export default partyPaymentExpectationsSchema
