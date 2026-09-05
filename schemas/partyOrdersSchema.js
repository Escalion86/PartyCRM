import { Schema } from 'mongoose'

const partyPerformerReportFileSchema = new Schema(
  {
    name: { type: String, trim: true, default: '', maxlength: 240 },
    url: { type: String, trim: true, default: '', maxlength: 1000 },
    comment: { type: String, trim: true, default: '', maxlength: 500 },
  },
  { _id: true }
)

const partyPerformerReportSchema = new Schema(
  {
    status: {
      type: String,
      enum: ['draft', 'submitted', 'accepted', 'revision_requested'],
      default: 'draft',
    },
    text: {
      type: String,
      trim: true,
      default: '',
      maxlength: 4000,
    },
    files: {
      type: [partyPerformerReportFileSchema],
      default: [],
    },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedByStaffId: {
      type: Schema.Types.ObjectId,
      ref: 'Staff',
      default: null,
    },
    reviewComment: {
      type: String,
      trim: true,
      default: '',
      maxlength: 1000,
    },
  },
  { _id: false }
)

const assignedStaffSchema = new Schema(
  {
    staffId: {
      type: Schema.Types.ObjectId,
      ref: 'Staff',
      required: true,
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
    report: {
      type: partyPerformerReportSchema,
      default: () => ({}),
    },
    performerGoogleCalendarEventId: { type: String, default: '' },
    performerGoogleCalendarCalendarId: { type: String, default: '' },
    performerCalendarSyncedAt: { type: Date, default: null },
    performerCalendarSyncError: {
      type: String,
      enum: ['', 'calendar_sync_unavailable', 'calendar_sync_failed'],
      default: '',
    },
  },
  { _id: false }
)

const partyOrderTransactionSchema = new Schema(
  {
    amount: {
      type: Number,
      default: 0,
      min: 0,
    },
    type: {
      type: String,
      enum: ['income', 'expense'],
      default: 'income',
    },
    category: {
      type: String,
      enum: [
        'deposit',
        'final_payment',
        'client_payment',
        'payout',
        'refund',
        'taxes',
        'materials',
        'travel',
        'other',
      ],
      default: 'deposit',
    },
    staffId: {
      type: Schema.Types.ObjectId,
      ref: 'Staff',
      default: null,
    },
    date: {
      type: Date,
      default: null,
    },
    comment: {
      type: String,
      trim: true,
      default: '',
      maxlength: 1000,
    },
    paymentMethod: {
      type: String,
      enum: ['transfer', 'account', 'cash', 'barter'],
      default: 'transfer',
    },
  },
  { _id: true }
)

const partyOrderAdditionalEventSchema = new Schema(
  {
    title: { type: String, trim: true, default: '', maxlength: 180 },
    description: { type: String, trim: true, default: '', maxlength: 1000 },
    date: { type: Date, default: null },
    done: { type: Boolean, default: false },
    doneAt: { type: Date, default: null },
    responsibleStaffId: {
      type: Schema.Types.ObjectId,
      ref: 'Staff',
      default: null,
    },
    googleCalendarEventId: { type: String, default: '' },
  },
  { _id: true }
)

const partyOrderOtherContactSchema = new Schema(
  {
    clientId: {
      type: Schema.Types.ObjectId,
      ref: 'Client',
      default: null,
    },
    comment: { type: String, trim: true, default: '', maxlength: 180 },
  },
  { _id: false }
)

const partyOrderPreparationItemSchema = new Schema({
  title: { type: String, trim: true, required: true, maxlength: 240 },
  status: { type: String, enum: ['pending', 'done'], default: 'pending' },
  responsibleStaffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
  dueAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  completedByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
  note: { type: String, trim: true, default: '', maxlength: 1000 },
}, { _id: true })

const partyOrderAddressAcknowledgementSchema = new Schema({
  staffId: { type: Schema.Types.ObjectId, ref: 'Staff', required: true },
  acknowledgedAt: { type: Date, required: true },
}, { _id: false })

const partyOrderPreparationSchema = new Schema({
  enabled: { type: Boolean, default: false },
  revision: { type: Number, default: 0, min: 0 },
  items: { type: [partyOrderPreparationItemSchema], default: [] },
  clientCheck: {
    status: { type: String, enum: ['waiting', 'message_received', 'call_completed', 'not_required'], default: 'waiting' },
    checkedAt: { type: Date, default: null },
    checkedByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
    note: { type: String, trim: true, default: '', maxlength: 1000 },
  },
  assembly: {
    status: { type: String, enum: ['not_started', 'planned', 'in_progress', 'ready'], default: 'not_started' },
    plannedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
    completedByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
    note: { type: String, trim: true, default: '', maxlength: 1000 },
  },
  addressChange: {
    before: { type: String, trim: true, default: '', maxlength: 1000 },
    after: { type: String, trim: true, default: '', maxlength: 1000 },
    changedAt: { type: Date, default: null },
    changedByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
    acknowledgements: { type: [partyOrderAddressAcknowledgementSchema], default: [] },
  },
  updatedAt: { type: Date, default: null },
  updatedByStaffId: { type: Schema.Types.ObjectId, ref: 'Staff', default: null },
}, { _id: false })

const partyOrdersSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  title: {
    type: String,
    trim: true,
    default: '',
    maxlength: 180,
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'canceled', 'closed'],
    default: 'draft',
    index: true,
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: 'Client',
    default: null,
    index: true,
  },
  client: {
    name: { type: String, trim: true, default: '', maxlength: 160 },
    phone: { type: String, trim: true, default: '', maxlength: 40 },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: '',
      maxlength: 160,
    },
  },
  eventDate: {
    type: Date,
    default: null,
    index: true,
  },
  dateEnd: {
    type: Date,
    default: null,
  },
  durationMinutes: {
    type: Number,
    default: 60,
    min: 1,
  },
  placeType: {
    type: String,
    enum: ['company_location', 'client_address'],
    default: 'company_location',
  },
  locationId: {
    type: Schema.Types.ObjectId,
    ref: 'Location',
    default: null,
    index: true,
  },
  customAddress: {
    type: String,
    trim: true,
    default: '',
    maxlength: 500,
  },
  clientAddress: {
    town: { type: String, trim: true, default: '', maxlength: 120 },
    street: { type: String, trim: true, default: '', maxlength: 180 },
    house: { type: String, trim: true, default: '', maxlength: 60 },
    room: { type: String, trim: true, default: '', maxlength: 120 },
    comment: { type: String, trim: true, default: '', maxlength: 500 },
  },
  servicesIds: {
    type: [Schema.Types.ObjectId],
    default: [],
    index: true,
  },
  serviceTitle: {
    type: String,
    trim: true,
    default: '',
    maxlength: 180,
  },
  inventoryHasShortage: { type: Boolean, default: false },
  locationFinanceRevision: { type: Number, default: 0 },
  inventorySyncError: { type: String, default: '', maxlength: 500 },
  inventoryCheckedAt: { type: Date, default: null },
  contractAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  transactions: {
    type: [partyOrderTransactionSchema],
    default: [],
  },
  additionalEvents: {
    type: [partyOrderAdditionalEventSchema],
    default: [],
  },
  preparation: { type: partyOrderPreparationSchema, default: () => ({}) },
  otherContacts: {
    type: [partyOrderOtherContactSchema],
    default: [],
  },
  googleCalendarEventId: { type: String, default: '' },
  googleCalendarCalendarId: { type: String, default: '' },
  calendarSyncError: {
    type: String,
    enum: ['', 'calendar_sync_unavailable', 'calendar_sync_failed'],
    default: '',
  },
  calendarSyncedAt: { type: Date, default: null },
  // Legacy field kept for backward-compatible reads of early PartyCRM orders.
  clientPayment: {
    totalAmount: { type: Number, default: 0, min: 0 },
    prepaidAmount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['none', 'wait_prepayment', 'prepaid', 'paid'],
      default: 'none',
    },
  },
  assignedStaff: {
    type: [assignedStaffSchema],
    default: [],
  },
  responsibleStaffId: {
    type: Schema.Types.ObjectId,
    ref: 'Staff',
    default: null,
    index: true,
  },
  adminComment: {
    type: String,
    trim: true,
    default: '',
    maxlength: 2000,
  },
  performerComment: {
    type: String,
    trim: true,
    default: '',
    maxlength: 2000,
  },
  leadSource: {
    type: String,
    trim: true,
    default: '',
    maxlength: 120,
    index: true,
  },
  leadSourceLabel: {
    type: String,
    trim: true,
    default: '',
    maxlength: 120,
  },
  leadMeta: {
    type: Schema.Types.Mixed,
    default: {},
  },
}

export default partyOrdersSchema
