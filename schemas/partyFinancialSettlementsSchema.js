import { Schema } from 'mongoose'

const partyFinancialSettlementsSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  orderId: { type: Schema.Types.ObjectId, required: true },
  staffId: { type: Schema.Types.ObjectId, required: true },
  eventDate: { type: Date, required: true },
  periodKey: { type: String, required: true },
  sourceReportReconciliationId: { type: Schema.Types.ObjectId },
  accrualKopecks: { type: Number, min: 0, default: 0 },
  deductionKopecks: { type: Number, min: 0, default: 0 },
  transportKopecks: { type: Number, min: 0, default: 0 },
  otherExpenseKopecks: { type: Number, min: 0, default: 0 },
  importedReceivedOnSiteKopecks: { type: Number, min: 0, default: 0 },
  comment: { type: String, default: '', maxlength: 2000 },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'revision'],
    default: 'draft',
  },
  submittedAt: { type: Date, default: null },
  submittedByStaffId: { type: Schema.Types.ObjectId, default: null },
  reviewedAt: { type: Date, default: null },
  reviewedByStaffId: { type: Schema.Types.ObjectId, default: null },
  reviewComment: { type: String, default: '', maxlength: 1000 },
}
export default partyFinancialSettlementsSchema
