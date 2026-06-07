import { Schema } from "mongoose"

const partyPaymentsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: "Company",
    required: true,
    index: true,
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  tariffId: {
    type: Schema.Types.ObjectId,
    ref: "Tariff",
    default: null,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  type: {
    type: String,
    required: true,
    enum: ["topup", "charge", "refund"],
  },
  source: {
    type: String,
    required: true,
    enum: ["manual", "system", "yookassa", "tochka"],
  },
  status: {
    type: String,
    default: "succeeded",
    enum: ["pending", "succeeded", "canceled", "failed"],
  },
  purpose: {
    type: String,
    default: "balance",
    enum: ["balance", "tariff", "system"],
  },
  provider: {
    type: String,
    default: "",
  },
  providerPaymentId: {
    type: String,
    default: "",
    trim: true,
    index: true,
  },
  idempotenceKey: {
    type: String,
    default: "",
    trim: true,
  },
  paidAt: {
    type: Date,
    default: null,
  },
  rawProviderStatus: {
    type: String,
    default: "",
  },
  paymentMethodType: {
    type: String,
    default: "",
    trim: true,
  },
  paymentMethodTitle: {
    type: String,
    default: "",
    trim: true,
  },
  paymentMethodDetails: {
    type: Schema.Types.Mixed,
    default: undefined,
  },
  comment: {
    type: String,
    default: "",
  },
}

export default partyPaymentsSchema
