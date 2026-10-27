import { PRODUCTS } from './productContext'
import { getProductModel } from './productDbConnect'
import { partyTicketProviderSchema } from '../schemas/partyTicketProviderSchema'

export const getPartyTicketProviderModel = () => getProductModel({
  product: PRODUCTS.PARTYCRM, name: 'PartyTicketProvider', collectionName: 'ticketProviderConnections',
  schemaDefinition: partyTicketProviderSchema, schemaOptions: { timestamps: true },
  configureSchema: (schema) => schema.index({ tenantId: 1, provider: 1 }, { unique: true }),
})
