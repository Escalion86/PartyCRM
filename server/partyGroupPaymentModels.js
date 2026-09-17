import { Schema } from 'mongoose'
import { PRODUCTS } from './productContext'
import { getProductModel } from './productDbConnect'

export const getPartyGroupPaymentModel = () => getProductModel({
  product: PRODUCTS.PARTYCRM,
  name: 'PartyGroupPayment',
  collectionName: 'groupPayments',
  schemaDefinition: {
    tenantId: { type: Schema.Types.ObjectId, required: true },
    groupId: { type: Schema.Types.ObjectId, required: true, index: true },
    idempotencyKey: { type: String, required: true },
    requestHash: { type: String, required: true },
    revision: { type: Number, default: 1 },
    history: { type: [Schema.Types.Mixed], default: [] },
    amount: { type: Number, required: true, min: 1 },
    date: { type: Date, required: true },
    paymentMethod: { type: String, required: true },
    category: { type: String, required: true },
    comment: { type: String, maxlength: 1000, default: '' },
    allocations: [{
      _id: false,
      orderId: { type: Schema.Types.ObjectId, required: true },
      orderTitle: { type: String, default: '' },
      amount: { type: Number, required: true, min: 1 },
      transactionId: { type: Schema.Types.ObjectId, required: true },
    }],
  },
  schemaOptions: { timestamps: true },
  configureSchema: (schema) => schema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true }),
})

export const getPartyGroupPaymentCorrectionModel = () => getProductModel({
  product: PRODUCTS.PARTYCRM,
  name: 'PartyGroupPaymentCorrection',
  collectionName: 'groupPaymentCorrections',
  schemaDefinition: {
    tenantId: { type: Schema.Types.ObjectId, required: true },
    paymentId: { type: Schema.Types.ObjectId, required: true },
    idempotencyKey: { type: String, required: true },
    requestHash: { type: String, required: true },
    receipt: { type: Schema.Types.Mixed, required: true },
  },
  schemaOptions: { timestamps: true },
  configureSchema: (schema) => schema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true }),
})
