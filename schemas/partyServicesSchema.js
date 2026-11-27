import { Schema } from 'mongoose'

const participantTierSchema = new Schema(
  {
    min: { type: Number, required: true },
    max: { type: Number, default: null },
    price: { type: Number, default: null },
    durationMinutes: { type: Number, default: null },
    includedParticipants: { type: Number, default: null },
    pricePerParticipant: { type: Number, default: 0 },
    maxPrice: { type: Number, default: null },
  },
  { _id: false }
)

const serviceAdjustmentSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    priceDelta: { type: Number, default: 0 },
    durationDelta: { type: Number, default: 0 },
  },
  { _id: false }
)

const optionGroupSchema = new Schema(
  {
    id: { type: String, required: true },
    title: { type: String, required: true },
    required: { type: Boolean, default: false },
    options: { type: [serviceAdjustmentSchema], default: [] },
  },
  { _id: false }
)

const serviceConfigurationSchema = new Schema(
  {
    participantTiers: { type: [participantTierSchema], default: [] },
    addons: { type: [serviceAdjustmentSchema], default: [] },
    optionGroups: { type: [optionGroupSchema], default: [] },
  },
  { _id: false }
)

const partyServicesSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: [true, 'Укажите название услуги'],
    trim: true,
    maxlength: 180,
  },
  description: {
    type: String,
    default: '',
    maxlength: 2000,
  },
  images: {
    type: Array,
    default: [],
  },
  duration: {
    type: Number,
    default: 0,
    min: 0,
  },
  specialization: {
    type: String,
    enum: ['animator', 'magician', 'host', 'photographer', 'workshop', 'other'],
    default: 'other',
  },
  price: {
    type: Number,
    default: 0,
    min: 0,
  },
  configuration: { type: serviceConfigurationSchema, default: null },
  groupId: {
    type: Schema.Types.ObjectId,
    ref: 'ServiceGroup',
    default: null,
  },
  availabilityConfigured: { type: Boolean, default: false },
  orderTypeIds: { type: [Schema.Types.ObjectId], default: [] },
  locationIds: { type: [Schema.Types.ObjectId], default: [] },
  offsiteAllowed: { type: Boolean, default: true },
  repeatable: { type: Boolean, default: false },
  maxQuantity: { type: Number, default: null, min: 1, max: 100000 },
  includedRentalMinutes: { type: Number, default: 0, min: 0, max: 10080 },
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active',
    index: true,
  },
}

export default partyServicesSchema
