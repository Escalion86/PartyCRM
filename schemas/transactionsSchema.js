import { Schema } from 'mongoose'

const transactionsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Users',
    default: null,
  },
  eventId: {
    type: Schema.Types.ObjectId,
    ref: 'Events',
    required: true,
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: 'Clients',
    required: true,
  },
  amount: {
    type: Number,
    required: [true, 'Укажите сумму транзакции'],
  },
  type: {
    type: String,
    enum: ['income', 'expense'],
    default: 'expense',
  },
  category: {
    type: String,
    default: 'other',
  },
  date: {
    type: Date,
    default: () => Date.now(),
  },
  comment: {
    type: String,
    default: '',
  },
  paymentMethod: {
    type: String,
    enum: ['transfer', 'account', 'cash', 'barter'],
    default: 'transfer',
  },
}

export default transactionsSchema
