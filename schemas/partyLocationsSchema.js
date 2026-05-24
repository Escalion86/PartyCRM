import { Schema } from 'mongoose'

const partyLocationsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'PartyCompanies',
    required: true,
    index: true,
  },
  title: {
    type: String,
    trim: true,
    required: true,
    maxlength: 160,
  },
  address: {
    town: { type: String, trim: true, default: '', maxlength: 120 },
    street: { type: String, trim: true, default: '', maxlength: 180 },
    house: { type: String, trim: true, default: '', maxlength: 40 },
    room: { type: String, trim: true, default: '', maxlength: 80 },
    comment: { type: String, trim: true, default: '', maxlength: 500 },
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'archived'],
    default: 'active',
  },
  bookingEnabled: {
    type: Boolean,
    default: true,
  },
  capacity: {
    type: Number,
    default: null,
    min: 0,
  },
}

export default partyLocationsSchema
