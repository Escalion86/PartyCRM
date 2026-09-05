import { PRODUCTS } from './productContext'
import { getProductModel } from './productDbConnect'
import items from '@schemas/partyInventoryItemsSchema'
import requirements from '@schemas/partyInventoryRequirementsSchema'
import reservations from '@schemas/partyInventoryReservationsSchema'
import { Schema } from 'mongoose'
import holdings from '@schemas/partyInventoryHoldingsSchema'
import movements from '@schemas/partyInventoryMovementsSchema'

const model = (name, collectionName, schemaDefinition, configureSchema) =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name,
    collectionName,
    schemaDefinition,
    schemaOptions: { timestamps: true },
    configureSchema,
  })
export const getPartyInventoryItemModel = () =>
  model('InventoryItem', 'inventoryitems', items, (schema) =>
    schema.index({ tenantId: 1, status: 1, title: 1 })
  )
export const getPartyInventoryRequirementModel = () =>
  model(
    'InventoryRequirement',
    'inventoryrequirements',
    requirements,
    (schema) => schema.index({ tenantId: 1, serviceId: 1 }, { unique: true })
  )
export const getPartyInventoryReservationModel = () =>
  model(
    'InventoryReservation',
    'inventoryreservations',
    reservations,
    (schema) => {
      schema.index({ tenantId: 1, orderId: 1 }, { unique: true })
      schema.index({ tenantId: 1, status: 1, 'rows.resourceId': 1 })
    }
  )
// A shared document makes concurrent stock/reservation writes conflict and retry
// inside a MongoDB transaction, including disjoint orders using the same resource.
export const getPartyInventoryLockModel = () =>
  model(
    'InventoryLock',
    'inventorylocks',
    {
      tenantId: { type: Schema.Types.ObjectId, required: true },
      revision: { type: Number, default: 0 },
    },
    (schema) => schema.index({ tenantId: 1 }, { unique: true })
  )

export const getPartyInventoryHoldingModel = () =>
  model('InventoryHolding', 'inventoryholdings', holdings, (schema) => {
    schema.index(
      { tenantId: 1, resourceId: 1, orderId: 1, holderStaffId: 1 },
      { unique: true }
    )
    schema.index({ tenantId: 1, quantity: 1, expectedReturnAt: 1 })
  })
export const getPartyInventoryMovementModel = () =>
  model('InventoryMovement', 'inventorymovements', movements, (schema) => {
    schema.index({ tenantId: 1, idempotencyKey: 1 }, { unique: true })
    schema.index({ tenantId: 1, orderId: 1, createdAt: -1 })
  })
