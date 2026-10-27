import { PRODUCTS } from './productContext'
import { getProductModel } from './productDbConnect'
import { partyTicketProgramSchema, partyTicketSessionSchema, partyTicketSaleSchema, partyTicketLedgerSchema, partyTicketOperationSchema, partyTicketLockSchema } from '../schemas/partyTicketingSchema'

const model = (name, collectionName, schemaDefinition, configureSchema) => getProductModel({ product: PRODUCTS.PARTYCRM, name, collectionName, schemaDefinition, schemaOptions: { timestamps: true }, configureSchema })
export const getPartyTicketProgramModel = () => model('PartyTicketProgram', 'ticketPrograms', partyTicketProgramSchema, (schema) => schema.index({ tenantId: 1, _id: -1 }))
export const getPartyTicketSessionModel = () => model('PartyTicketSession', 'ticketSessions', partyTicketSessionSchema, (schema) => { schema.index({ tenantId: 1, _id: -1 }); schema.index({ tenantId: 1, programId: 1, startsAt: 1 }) })
export const getPartyTicketSaleModel = () => model('PartyTicketSale', 'ticketSales', partyTicketSaleSchema, (schema) => { schema.index({ tenantId: 1, _id: -1 }); schema.index({ tenantId: 1, sessionId: 1 }); schema.index({ tenantId: 1, clientId: 1 }) })
export const getPartyTicketLedgerModel = () => model('PartyTicketLedger', 'ticketLedger', partyTicketLedgerSchema, (schema) => { schema.index({ tenantId: 1, saleId: 1, _id: -1 }); schema.index({ tenantId: 1, operationId: 1 }, { unique: true }) })
export const getPartyTicketOperationModel = () => model('PartyTicketOperation', 'ticketOperations', partyTicketOperationSchema, (schema) => schema.index({ tenantId: 1, actorStaffId: 1, requestKey: 1 }, { unique: true }))
export const getPartyTicketLockModel = () => model('PartyTicketLock', 'ticketLocks', partyTicketLockSchema, (schema) => schema.index({ tenantId: 1 }, { unique: true }))
export const loadPartyTicketModels = async () => ({ Programs: await getPartyTicketProgramModel(), Sessions: await getPartyTicketSessionModel(), Sales: await getPartyTicketSaleModel(), Ledger: await getPartyTicketLedgerModel(), Operations: await getPartyTicketOperationModel(), Locks: await getPartyTicketLockModel() })
