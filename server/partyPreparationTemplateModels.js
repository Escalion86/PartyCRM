import { Schema } from 'mongoose'
import { PRODUCTS } from './productContext'
import { getProductModel } from './productDbConnect'

export const partyPreparationTemplatesSchema = {
  tenantId: { type: Schema.Types.ObjectId, required: true },
  title: { type: String, required: true, maxlength: 180 },
  active: { type: Boolean, default: true },
  revision: { type: Number, default: 0 },
  applicationRevision: { type: Number, default: 0 },
  items: [
    new Schema(
      {
        id: { type: String, required: true, maxlength: 64 },
        title: { type: String, required: true, maxlength: 240 },
        descriptionHtml: { type: String, default: '', maxlength: 20000 },
        assigneeStaffIds: [{ type: Schema.Types.ObjectId }],
        assigneeRoleId: { type: Schema.Types.ObjectId, default: null },
        offsetMinutes: { type: Number, default: null },
      },
      { _id: false }
    ),
  ],
  createdByStaffId: { type: Schema.Types.ObjectId, default: null },
  updatedByStaffId: { type: Schema.Types.ObjectId, default: null },
}
export const getPartyPreparationTemplateModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'PreparationTemplate',
    collectionName: 'preparationTemplates',
    schemaDefinition: partyPreparationTemplatesSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) =>
      schema.index({ tenantId: 1, active: 1, title: 1 }),
  })
