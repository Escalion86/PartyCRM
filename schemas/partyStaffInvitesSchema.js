import { Schema } from 'mongoose'

const partyStaffInvitesSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  staffId: {
    type: Schema.Types.ObjectId,
    ref: 'Staff',
    required: true,
    index: true,
  },
  role: {
    type: String,
    enum: ['admin', 'performer'],
    required: true,
  },
  phone: { type: String, required: true, trim: true },
  tokenHash: { type: String, required: true, unique: true, index: true },
  status: {
    type: String,
    enum: ['active', 'accepted', 'revoked', 'expired'],
    default: 'active',
    index: true,
  },
  expiresAt: { type: Date, required: true, index: true },
  createdByUserId: { type: String, required: true, trim: true },
  acceptedByUserId: { type: String, default: '', trim: true },
  acceptedAt: { type: Date, default: null },
  revokedByUserId: { type: String, default: '', trim: true },
  revokedAt: { type: Date, default: null },
}

export default partyStaffInvitesSchema
