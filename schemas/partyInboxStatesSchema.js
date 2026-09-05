import { Schema } from 'mongoose'

const partyInboxStatesSchema = {
  tenantId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
  channel: { type: String, enum: ['vk', 'avito', 'telegram', 'novofon'], required: true },
  sourceId: { type: Schema.Types.ObjectId, required: true },
  status: { type: String, enum: ['needs_reply', 'in_progress', 'waiting_client', 'follow_up', 'resolved'], default: 'needs_reply' },
  acknowledgedIncomingToken: { type: String, default: '' },
  slaIncomingToken: { type: String, default: '', maxlength: 160 },
  slaIncomingAt: { type: Date, default: null },
  responseDueAt: { type: Date, default: null },
  respondedAt: { type: Date, default: null },
  responseToken: { type: String, default: '', maxlength: 160 },
  assigneeStaffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
  proposedAssigneeStaffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
  handoffProposedAt: { type: Date, default: null },
  handoffProposedByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
  revision: { type: Number, default: 0, min: 0 },
  history: { type: [{
    type: { type: String, enum: ['sla_started', 'sla_answered', 'handoff_proposed', 'handoff_accepted', 'handoff_canceled'], required: true },
    at: { type: Date, required: true }, token: { type: String, default: '', maxlength: 160 },
    byStaffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
    fromStaffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
    toStaffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
  }, { _id: false }], default: [] },
  nextContactAt: { type: Date, default: null },
  clientId: { type: Schema.Types.ObjectId, ref: 'Client', default: null },
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', default: null },
  updatedByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
}

export default partyInboxStatesSchema
