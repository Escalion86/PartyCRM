import { Schema } from 'mongoose'
import { PRODUCTS } from './productContext'
import { getProductModel } from './productDbConnect'

// Append-only receipt: no update/delete API is exposed for migration snapshots.
export const getPartyLegacyLedgerMigrationModel = () => getProductModel({
  product: PRODUCTS.PARTYCRM,
  name: 'PartyLegacyLedgerMigration',
  collectionName: 'legacyLedgerMigrations',
  schemaDefinition: {
    tenantId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    orderId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    fingerprint: { type: String, required: true, immutable: true },
    sourceEntries: { type: [Schema.Types.Mixed], required: true, immutable: true },
    receipt: { type: Schema.Types.Mixed, required: true, immutable: true },
    actorStaffId: { type: Schema.Types.ObjectId, default: null, immutable: true },
    actorUserId: { type: Schema.Types.ObjectId, default: null, immutable: true },
  },
  schemaOptions: { timestamps: true },
  configureSchema: (schema) => schema.index({ tenantId: 1, orderId: 1 }, { unique: true }),
})
