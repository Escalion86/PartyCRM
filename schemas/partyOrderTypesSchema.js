import { Schema } from 'mongoose'

const partyOrderTypesSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  normalizedTitle: { type: String, required: true },
  active: { type: Boolean, default: true },
  invitationTemplateId: { type: Schema.Types.ObjectId, default: null },
  revision: { type: Number, default: 0 },
}
export default partyOrderTypesSchema
