import { Schema } from 'mongoose'

const partyAssignmentsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'PartyCompanies',
    required: true,
    index: true,
  },
  eventId: {
    type: Schema.Types.ObjectId,
    ref: 'Events',
    required: true,
    index: true,
  },
  staffId: {
    type: Schema.Types.ObjectId,
    ref: 'PartyStaff',
    required: true,
    index: true,
  },
  role: {
    type: String,
    enum: ['performer', 'admin', 'assistant'],
    default: 'performer',
  },
  payoutAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  payoutStatus: {
    type: String,
    enum: ['planned', 'ready', 'paid', 'canceled'],
    default: 'planned',
  },
  confirmationStatus: {
    type: String,
    enum: ['pending', 'confirmed', 'declined', 'done'],
    default: 'pending',
  },
}

export default partyAssignmentsSchema
