import { Schema } from 'mongoose'

const partyRolesSchema = {
  tenantId: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  systemKey: { type: String, enum: ['owner', 'admin', 'performer', 'location_owner', null], default: null },
  baseRole: { type: String, enum: ['owner', 'admin', 'performer', 'location_owner'], default: 'performer' },
  permissions: { type: Schema.Types.Mixed, default: {} },
  orderScope: {
    stageIds: { type: [String], default: [] },
    statuses: { type: [String], enum: ['draft', 'active', 'canceled', 'closed'], default: [] },
    locationIds: { type: [Schema.Types.ObjectId], ref: 'Location', default: [] },
    includeUnlocated: { type: Boolean, default: true },
    assignedOnly: { type: Boolean, default: false },
  },
  revision: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true },
}

export default partyRolesSchema
