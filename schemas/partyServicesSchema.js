import { Schema } from 'mongoose'

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
