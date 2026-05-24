import { Schema } from "mongoose"

const partyUsersSchema = {
  phone: {
    type: String,
    trim: true,
    required: true,
    index: true,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: "",
    maxlength: 160,
  },
  password: {
    type: String,
    required: true,
    default: "",
  },
  firstName: {
    type: String,
    trim: true,
    default: "",
    maxlength: 100,
  },
  secondName: {
    type: String,
    trim: true,
    default: "",
    maxlength: 100,
  },
  role: {
    type: String,
    enum: ["user", "support", "admin"],
    default: "user",
  },
  interfaceRoles: {
    type: [String],
    enum: ["company", "performer"],
    default: ["company", "performer"],
  },
  status: {
    type: String,
    enum: ["active", "blocked", "archived"],
    default: "active",
  },
  consentPrivacyPolicyAccepted: {
    type: Boolean,
    default: false,
  },
  consentPersonalDataAccepted: {
    type: Boolean,
    default: false,
  },
  privacyPolicyAcceptedAt: {
    type: Date,
    default: null,
  },
  personalDataProcessingAcceptedAt: {
    type: Date,
    default: null,
  },
  lastLoginAt: {
    type: Date,
    default: null,
  },
  // Biллинг (PartyCRM subscription)
  tariffId: {
    type: Schema.Types.ObjectId,
    ref: "PartyTariffs",
    default: null,
  },
  balance: {
    type: Number,
    default: 0,
    min: 0,
  },
  billingStatus: {
    type: String,
    enum: ["active", "paused", "debt", "cancelled"],
    default: "active",
  },
  tariffActiveUntil: {
    type: Date,
    default: null,
  },
  nextChargeAt: {
    type: Date,
    default: null,
  },
  trialActivatedAt: {
    type: Date,
    default: null,
  },
  trialEndsAt: {
    type: Date,
    default: null,
  },
  trialUsed: {
    type: Boolean,
    default: false,
  },
}

export default partyUsersSchema
