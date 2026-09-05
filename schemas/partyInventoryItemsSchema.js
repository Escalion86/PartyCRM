import { Schema } from 'mongoose'

const partyInventoryItemsSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  category: { type: String, default: '', maxlength: 100 },
  unit: { type: String, default: 'шт.', maxlength: 30 },
  quantity: { type: Number, required: true, min: 0 },
  unavailableQuantity: { type: Number, default: 0, min: 0 },
  unavailableReason: { type: String, default: '', maxlength: 500 },
  storageLocation: { type: String, default: '', maxlength: 240 },
  status: { type: String, enum: ['active', 'archived'], default: 'active' },
}

export default partyInventoryItemsSchema
