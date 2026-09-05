import { Schema } from 'mongoose'

export const reportFieldSchema = new Schema({
  id: { type: String, required: true },
  label: { type: String, required: true, maxlength: 240 },
  instruction: { type: String, default: '', maxlength: 4000 },
  required: { type: Boolean, default: false },
  requiredMedia: { type: Boolean, default: false },
  allowNotApplicable: { type: Boolean, default: false },
  applyWhenBound: { type: Boolean, default: false },
  section: { type: String, enum: ['general', 'creative', 'inventory', 'finance'], default: 'general' },
  reviewerStaffId: { type: Schema.Types.ObjectId, default: null },
  resourceId: { type: Schema.Types.ObjectId, default: null },
  serviceId: { type: Schema.Types.ObjectId, default: null },
  locationId: { type: Schema.Types.ObjectId, default: null },
  shareCreative: { type: Boolean, default: false },
  reconciliationKey: { type: String, default: '', maxlength: 64 },
  reconciliationValueType: { type: String, enum: ['', 'money', 'date', 'payment_method', 'text'], default: '' },
  reconciliationRequired: { type: Boolean, default: false },
}, { _id: false })

export const templateSnapshotSchema = new Schema({
  title: { type: String, required: true, maxlength: 180 },
  stage: { type: String, enum: ['before', 'after'], required: true },
  version: { type: Number, required: true },
  fields: { type: [reportFieldSchema], default: [] },
}, { _id: false })

export const partyReportTemplatesSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  familyId: { type: Schema.Types.ObjectId, required: true },
  title: { type: String, required: true, maxlength: 180 },
  stage: { type: String, enum: ['before', 'after'], required: true },
  version: { type: Number, required: true },
  active: { type: Boolean, default: true },
  fields: { type: [reportFieldSchema], default: [] },
}

const answerSchema = new Schema({
  fieldId: { type: String, required: true },
  html: { type: String, default: '', maxlength: 100000 },
  notApplicable: { type: Boolean, default: false },
  notApplicableReason: { type: String, default: '', maxlength: 2000 },
  status: { type: String, enum: ['draft', 'submitted', 'accepted', 'revision_requested'], default: 'draft' },
  reviewComment: { type: String, default: '', maxlength: 2000 },
  reviewedByStaffId: { type: String, default: '' },
  reviewedAt: { type: Date, default: null },
}, { _id: false })

const partyReportsSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  orderId: { type: Schema.Types.ObjectId, required: true },
  staffId: { type: Schema.Types.ObjectId, required: true },
  templateId: { type: Schema.Types.ObjectId, required: true },
  templateFamilyId: { type: Schema.Types.ObjectId, required: true },
  templateSnapshot: { type: templateSnapshotSchema, required: true },
  stage: { type: String, enum: ['before', 'after'], required: true },
  revision: { type: Number, default: 0 },
  status: { type: String, enum: ['draft', 'submitted', 'accepted', 'revision_requested'], default: 'draft' },
  answers: { type: [answerSchema], default: [] },
  submittedAt: { type: Date, default: null },
}

export default partyReportsSchema

export const partyReportRevisionSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  reportId: { type: Schema.Types.ObjectId, required: true },
  revision: { type: Number, required: true },
  snapshot: { type: Schema.Types.Mixed, required: true },
}

export const partyReportMediaSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  reportId: { type: Schema.Types.ObjectId, required: true },
  fieldId: { type: String, required: true },
  mimeType: { type: String, required: true },
  bytes: { type: Buffer, required: true, select: false },
  size: { type: Number, required: true },
}
