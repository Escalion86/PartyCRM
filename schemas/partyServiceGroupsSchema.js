import { Schema } from 'mongoose'

const partyServiceGroupsSchema = {
  tenantId: {
    type: Schema.Types.ObjectId,
    ref: 'Company',
    required: true,
    index: true,
  },
  title: {
    type: String,
    required: [true, 'Укажите название группы'],
    trim: true,
  },
  order: {
    type: Number,
    default: 0,
  },
}

export default partyServiceGroupsSchema
