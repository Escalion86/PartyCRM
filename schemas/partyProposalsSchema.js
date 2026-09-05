import { Schema } from 'mongoose'

const proposalPartySchema = new Schema(
  {
    displayName: { type: String, trim: true, default: '', maxlength: 240 },
    fullName: { type: String, trim: true, default: '', maxlength: 240 },
    position: { type: String, trim: true, default: '', maxlength: 180 },
    inn: { type: String, trim: true, default: '', maxlength: 40 },
    ogrn: { type: String, trim: true, default: '', maxlength: 40 },
    legalAddress: { type: String, trim: true, default: '', maxlength: 400 },
    phone: { type: String, trim: true, default: '', maxlength: 40 },
    email: { type: String, trim: true, default: '', maxlength: 160 },
  },
  { _id: false }
)

const proposalEventSchema = new Schema(
  {
    title: { type: String, trim: true, default: '', maxlength: 240 },
    date: { type: Date, default: null },
    address: { type: String, trim: true, default: '', maxlength: 500 },
  },
  { _id: false }
)

const proposalItemSchema = new Schema(
  {
    serviceId: { type: Schema.Types.ObjectId, ref: 'Service', default: null },
    title: { type: String, trim: true, required: true, maxlength: 240 },
    description: { type: String, trim: true, default: '', maxlength: 1000 },
    quantity: { type: Number, default: 1, min: 0.01, max: 100000 },
    unit: { type: String, trim: true, default: 'услуга', maxlength: 40 },
    unitPrice: { type: Number, default: 0, min: 0 },
    discount: { type: Number, default: 0, min: 0 },
    total: { type: Number, default: 0, min: 0 },
  },
  { _id: true }
)

const partyProposalsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true,
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: 'Client',
    default: null,
    index: true,
  },
  number: { type: String, trim: true, required: true, maxlength: 80 },
  version: { type: Number, required: true, min: 1 },
  status: {
    type: String,
    enum: ['draft', 'sent', 'accepted', 'rejected', 'expired'],
    default: 'draft',
    index: true,
  },
  createdByStaffId: {
    type: Schema.Types.ObjectId,
    ref: 'Staff',
    default: null,
  },
  proposalDate: { type: Date, default: Date.now },
  validUntil: { type: Date, default: null },
  requestNumber: { type: String, trim: true, default: '', maxlength: 120 },
  requestDate: { type: Date, default: null },
  senderSnapshot: { type: proposalPartySchema, default: () => ({}) },
  recipientSnapshot: { type: proposalPartySchema, default: () => ({}) },
  eventSnapshot: { type: proposalEventSchema, default: () => ({}) },
  items: { type: [proposalItemSchema], default: [] },
  subtotal: { type: Number, default: 0, min: 0 },
  discount: { type: Number, default: 0, min: 0 },
  total: { type: Number, default: 0, min: 0 },
  taxText: { type: String, trim: true, default: '', maxlength: 500 },
  paymentTerms: { type: String, trim: true, default: '', maxlength: 2000 },
  includedText: { type: String, trim: true, default: '', maxlength: 3000 },
  additionalTerms: { type: String, trim: true, default: '', maxlength: 3000 },
  sentAt: { type: Date, default: null },
  acceptedAt: { type: Date, default: null },
  rejectedAt: { type: Date, default: null },
}

export default partyProposalsSchema
