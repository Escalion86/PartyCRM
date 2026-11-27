import { Schema } from 'mongoose'
import { PRODUCTS } from './productContext.js'
import { getProductModel } from './productDbConnect.js'

export const getPartyContractTemplateModel = () => getProductModel({
  product: PRODUCTS.PARTYCRM,
  name: 'ContractTemplate',
  collectionName: 'contractTemplates',
  schemaDefinition: {
    tenantId: { type: Schema.Types.ObjectId, required: true },
    name: { type: String, required: true, maxlength: 120 },
    normalizedName: { type: String, required: true },
    source: { type: String, required: true, enum: ['upload', 'built_in'] },
    builtInId: { type: String, default: '' },
    fileName: { type: String, required: true },
    templateBase64: { type: String, required: true, select: false },
  },
  schemaOptions: { timestamps: true },
  configureSchema: (schema) => schema.index(
    { tenantId: 1, normalizedName: 1 },
    { unique: true, name: 'party_contract_template_name' }
  ),
})
