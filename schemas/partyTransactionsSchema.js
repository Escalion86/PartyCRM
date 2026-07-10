import { Schema } from 'mongoose'

const partyTransactionsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
  },
  clientId: {
    type: Schema.Types.ObjectId,
    ref: 'Client',
    default: null,
  },
  staffId: {
    type: Schema.Types.ObjectId,
    ref: 'Staff',
    default: null,
  },
  amount: {
    type: Number,
    required: [true, 'Укажите сумму транзакции'],
    min: 1,
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
  date: {
    type: Date,
    default: () => Date.now(),
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
}

export default partyTransactionsSchema
