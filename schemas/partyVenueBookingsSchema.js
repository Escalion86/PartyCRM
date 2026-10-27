import { Schema } from 'mongoose'

export const partyVenueBookingsSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  sourceType: {
    type: String,
    enum: ['order', 'ticket_session'],
    required: true,
  },
  sourceId: { type: Schema.Types.ObjectId, required: true },
  locationId: { type: Schema.Types.ObjectId, ref: 'Location', required: true },
  startsAt: { type: Date, required: true },
  endsAt: { type: Date, required: true },
  occupiedFrom: { type: Date, required: true },
  occupiedUntil: { type: Date, required: true },
  exclusive: { type: Boolean, default: true },
  capacity: { type: Number, default: null, min: 1 },
}

export const partyVenueLocksSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  locationId: { type: Schema.Types.ObjectId, required: true },
  day: { type: String, required: true },
  revision: { type: Number, default: 0 },
}
