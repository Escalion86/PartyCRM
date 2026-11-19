import { Schema } from 'mongoose'

const reference = (required = false) => ({
  type: Schema.Types.ObjectId,
  required,
  default: required ? undefined : null,
})
const money = () => ({
  type: Number,
  default: 0,
  min: 0,
  max: 1000000000000,
  validate: Number.isSafeInteger,
})
const quantity = () => ({
  type: Number,
  default: 0,
  min: 0,
  max: 100000,
  validate: Number.isSafeInteger,
})

export const partyTicketChannelRecordSchema = {
  tenantId: reference(true),
  sessionId: reference(true),
  programId: reference(true),
  locationId: reference(true),
  operationId: reference(true),
  channelKey: { type: String, required: true, maxlength: 80 },
  channelTitle: { type: String, required: true, maxlength: 120 },
  kind: { type: String, enum: ['sale', 'refund'], required: true },
  occurredAt: { type: Date, required: true },
  quantity: quantity(),
  amountKopecks: money(),
  externalReference: { type: String, default: '', maxlength: 180 },
  externalReferenceKey: { type: String, maxlength: 64 },
  comment: { type: String, default: '', maxlength: 1000 },
  saleRecordId: reference(),
  refundedQuantity: quantity(),
  refundedAmountKopecks: money(),
  recordedByStaffId: reference(true),
}
