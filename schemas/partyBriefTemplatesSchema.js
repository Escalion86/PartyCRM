import { Schema } from 'mongoose'

const partyBriefTemplatesSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  revision: { type: Number, required: true, min: 1 },
  // Each field may include serviceIds; publication validates their tenant and shape.
  fields: { type: [Schema.Types.Mixed], default: [] },
  retiredFields: { type: [Schema.Types.Mixed], default: [] },
  publishedByStaffId: {
    type: Schema.Types.ObjectId,
    ref: 'Staff',
    default: null,
  },
}

export default partyBriefTemplatesSchema
