import { Schema } from 'mongoose'
import { PRODUCTS } from './productContext'
import { getProductModel } from './productDbConnect'

export const getPartyEventGroupModel = () => getProductModel({
  product: PRODUCTS.PARTYCRM,
  name: 'PartyEventGroup',
  collectionName: 'eventGroups',
  schemaDefinition: {
    tenantId: { type: Schema.Types.ObjectId, required: true, index: true },
    title: { type: String, trim: true, maxlength: 180, default: '' },
    revision: { type: Number, default: 1, min: 1 },
    sharedLocationBooking: { type: Boolean, default: false },
  },
  schemaOptions: { timestamps: true },
})
