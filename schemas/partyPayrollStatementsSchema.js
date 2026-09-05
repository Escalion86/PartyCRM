import { Schema } from 'mongoose'

const partyPayrollStatementsSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  periodKey: { type: String, required: true },
  timeZone: { type: String, required: true },
  workStart: { type: Date, required: true },
  workEndExclusive: { type: Date, required: true },
  reconciliationStart: { type: Date, required: true },
  reconciliationEndExclusive: { type: Date, required: true },
  paymentStart: { type: Date, required: true },
  paymentEndExclusive: { type: Date, required: true },
  status: {
    type: String,
    enum: ['draft', 'approved', 'paid'],
    default: 'draft',
  },
  lines: { type: Array, default: [] },
  generatedAt: { type: Date, required: true },
  generatedByStaffId: { type: Schema.Types.ObjectId, required: true },
  approvedAt: { type: Date, default: null },
  approvedByStaffId: { type: Schema.Types.ObjectId, default: null },
  paidAt: { type: Date, default: null },
  paidByStaffId: { type: Schema.Types.ObjectId, default: null },
}
export default partyPayrollStatementsSchema
