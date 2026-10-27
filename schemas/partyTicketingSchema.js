import { Schema } from 'mongoose'

const ref = (required = false) => ({ type: Schema.Types.ObjectId, required, default: required ? undefined : null })
const money = (value = 0) => ({ type: Number, default: value, min: 0, max: 1000000000000, validate: Number.isSafeInteger })
const count = (value = 0) => ({ type: Number, default: value, min: 0, max: 100000, validate: Number.isSafeInteger })

export const partyTicketProgramSchema = {
  tenantId: ref(true), title: { type: String, required: true, trim: true, maxlength: 180 },
  admission: { type: String, enum: ['session', 'open'], required: true }, locationId: ref(),
  source: { type: String, enum: ['internal', 'external'], default: 'internal' },
  externalProvider: { type: String, enum: ['', 'ticketscloud', 'krasbilet', 'other'], default: '' },
  externalProgramId: { type: String, maxlength: 180, default: '' },
  unitPriceKopecks: money(), currency: { type: String, enum: ['RUB'], default: 'RUB' },
  groupDiscount: { minQuantity: count(), amountPerTicketKopecks: money() },
  status: { type: String, enum: ['active', 'archived'], default: 'active' }, revision: count(),
}
export const partyTicketSessionSchema = {
  tenantId: ref(true), programId: ref(true), locationId: ref(true),
  title: { type: String, required: true, maxlength: 180 }, startsAt: { type: Date, required: true }, endsAt: { type: Date, required: true },
  capacity: { ...count(), required: true, min: 1 }, soldCount: count(),
  status: { type: String, enum: ['scheduled', 'completed', 'canceled'], default: 'scheduled' }, revision: count(),
  completedAt: { type: Date, default: null },
}
export const partyTicketSaleSchema = {
  tenantId: ref(true), programId: ref(true), sessionId: ref(), locationId: ref(), clientId: ref(),
  programTitle: { type: String, required: true, maxlength: 180 }, admission: { type: String, enum: ['session', 'open'], required: true },
  contact: { name: { type: String, maxlength: 180, default: '' }, phone: { type: String, maxlength: 40, default: '' }, email: { type: String, maxlength: 180, default: '' } },
  quantity: { ...count(), required: true, min: 1 }, unitPriceKopecks: money(), groupDiscountKopecks: money(), discountKopecks: money(), totalAmountKopecks: money(),
  paidAmountKopecks: money(), refundedAmountKopecks: money(), refundedQuantity: count(), admittedQuantity: count(),
  canceledValueKopecks: money(), admittedValueKopecks: money(),
  validFrom: { type: Date, default: null }, validTo: { type: Date, default: null },
  fulfilledAt: { type: Date, default: null }, earnedAmountKopecks: money(),
  status: { type: String, enum: ['active', 'canceled'], default: 'active' }, revision: count(), createdByStaffId: ref(true),
}
export const partyTicketLedgerSchema = {
  tenantId: ref(true), saleId: ref(true), programId: ref(true), sessionId: ref(), locationId: ref(), operationId: ref(true),
  kind: { type: String, enum: ['payment', 'refund', 'admission'], required: true },
  amountKopecks: money(), quantity: count(), method: { type: String, enum: ['', 'cash', 'card'], default: '' },
  source: { type: String, enum: ['manual'], default: 'manual' },
  comment: { type: String, maxlength: 1000, default: '' }, recordedByStaffId: ref(true), occurredAt: { type: Date, required: true },
}
export const partyTicketOperationSchema = {
  tenantId: ref(true), actorStaffId: ref(true), requestKey: { type: String, required: true, maxlength: 100 },
  requestHash: { type: String, required: true }, action: { type: String, required: true },
  entity: { type: String, enum: ['program', 'session', 'sale'], required: true }, entityId: ref(true),
}
export const partyTicketLockSchema = { tenantId: ref(true), revision: count() }
