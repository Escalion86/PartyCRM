import { Schema } from 'mongoose'

const partyInventoryRequirementsSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
  serviceId: { type: Schema.Types.ObjectId, required: true },
  items: {
    type: [
      {
        resourceId: { type: Schema.Types.ObjectId, required: true },
        quantity: { type: Number, required: true, min: 1 },
      },
    ],
    default: [],
  },
}

export default partyInventoryRequirementsSchema
