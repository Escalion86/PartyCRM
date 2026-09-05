import { Schema } from 'mongoose'

export const reconciliationFieldSchema = new Schema({
  fieldId: { type: String, required: true },
  label: { type: String, required: true, maxlength: 240 },
  key: { type: String, required: true, maxlength: 64 },
  valueType: { type: String, enum: ['money', 'date', 'payment_method', 'text'], required: true },
  required: { type: Boolean, default: false },
  reviewerStaffId: { type: Schema.Types.ObjectId, default: null },
}, { _id: false })

export const reconciliationValueSchema = new Schema({
  fieldId: { type: String, required: true },
  key: { type: String, required: true },
  valueType: { type: String, enum: ['money', 'date', 'payment_method', 'text'], required: true },
  hasValue: { type: Boolean, default: false },
  moneyMinor: { type: Number, default: null },
  dateValue: { type: Date, default: null },
  choiceValue: { type: String, default: '' },
  textValue: { type: String, default: '', maxlength: 500 },
  status: { type: String, enum: ['draft', 'submitted', 'accepted', 'revision_requested', 'not_required'], default: 'draft' },
  reviewComment: { type: String, default: '', maxlength: 2000 },
  reviewedByStaffId: { type: String, default: '' },
  reviewedAt: { type: Date, default: null },
}, { _id: false })

const partyReportReconciliationsSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  reportId: { type: Schema.Types.ObjectId, required: true },
  orderId: { type: Schema.Types.ObjectId, required: true },
  staffId: { type: Schema.Types.ObjectId, required: true },
  reportTemplateVersion: { type: Number, required: true },
  fields: { type: [reconciliationFieldSchema], default: [] },
  values: { type: [reconciliationValueSchema], default: [] },
  status: { type: String, enum: ['draft', 'submitted', 'accepted', 'revision_requested'], default: 'draft' },
  revision: { type: Number, default: 0 },
  submittedAt: { type: Date, default: null },
}

export default partyReportReconciliationsSchema

export const partyReportReconciliationRevisionSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  reconciliationId: { type: Schema.Types.ObjectId, required: true },
  revision: { type: Number, required: true },
  snapshot: { type: Schema.Types.Mixed, required: true },
}
