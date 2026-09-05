import { Schema } from 'mongoose'

const partyInventoryReservationsSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
  orderId: { type: Schema.Types.ObjectId, required: true },
  serviceItems: { type: Array, default: [] },
  selectionMode: {
    type: String,
    enum: ['automatic', 'manual'],
    default: 'automatic',
  },
  orderSnapshot: { type: Schema.Types.Mixed, default: null },
  releasedReason: { type: String, enum: ['', 'manual', 'order'], default: '' },
  rows: {
    type: [
      {
        resourceId: { type: Schema.Types.ObjectId, required: true },
        serviceId: { type: Schema.Types.ObjectId, required: true },
        serviceLineId: { type: String, required: true },
        quantity: { type: Number, required: true, min: 1 },
        startAt: { type: Date, required: true },
        endAt: { type: Date, required: true },
      },
    ],
    default: [],
  },
  status: { type: String, enum: ['active', 'released'], default: 'active' },
  shortageConfirmedAt: { type: Date, default: null },
  shortageConfirmedBy: { type: Schema.Types.ObjectId, default: null },
  warnings: { type: Array, default: [] },
}

export default partyInventoryReservationsSchema
