import { Schema } from 'mongoose'

const partyServicesSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'PartyCompanies',
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
  status: {
    type: String,
    enum: ['active', 'archived'],
    default: 'active',
    index: true,
  },
}

export default partyServicesSchema
