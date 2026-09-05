import { Schema } from 'mongoose'

const auditChangeSchema = new Schema(
  {
    field: { type: String, required: true, trim: true, maxlength: 120 },
    label: { type: String, required: true, trim: true, maxlength: 160 },
    before: { type: String, default: '', maxlength: 4000 },
    after: { type: String, default: '', maxlength: 4000 },
  },
  { _id: false }
)

const partyAuditLogsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  actorUserId: {
    type: String,
    trim: true,
    default: '',
    index: true,
  },
  actorStaffId: {
    type: Schema.Types.ObjectId,
    ref: 'Staff',
    default: null,
    index: true,
  },
  actorName: {
    type: String,
    trim: true,
    default: 'Система',
    maxlength: 240,
  },
  actorRole: {
    type: String,
    trim: true,
    default: 'system',
    maxlength: 40,
  },
  action: {
    type: String,
    required: true,
    trim: true,
    maxlength: 80,
    index: true,
  },
  entityType: {
    type: String,
    required: true,
    enum: ['order'],
    default: 'order',
    index: true,
  },
  entityId: {
    type: Schema.Types.ObjectId,
    required: true,
    index: true,
  },
  entityTitle: {
    type: String,
    trim: true,
    default: '',
    maxlength: 500,
  },
  summary: {
    type: String,
    trim: true,
    required: true,
    maxlength: 1000,
  },
  changes: {
    type: [auditChangeSchema],
    default: [],
  },
  metadata: {
    type: Schema.Types.Mixed,
    default: {},
  },
}

export default partyAuditLogsSchema
