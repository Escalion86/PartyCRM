import { PRODUCTS } from './productContext'
import { getProductModel } from './productDbConnect'
import {
  partyVenueBookingsSchema,
  partyVenueLocksSchema,
} from '../schemas/partyVenueBookingsSchema'

export const getPartyVenueBookingModel = ({ readOnly = false } = {}) =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: readOnly ? 'VenueBookingPreview' : 'VenueBooking',
    collectionName: 'venueBookings',
    schemaDefinition: partyVenueBookingsSchema,
    schemaOptions: {
      timestamps: true,
      ...(readOnly ? { autoCreate: false, autoIndex: false } : {}),
    },
    configureSchema: (schema) => {
      schema.index(
        { tenantId: 1, sourceType: 1, sourceId: 1 },
        { unique: true }
      )
      schema.index({
        tenantId: 1,
        locationId: 1,
        occupiedFrom: 1,
        occupiedUntil: 1,
      })
    },
  })

export const getPartyVenueLockModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'VenueLock',
    collectionName: 'venueLocks',
    schemaDefinition: partyVenueLocksSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) =>
      schema.index({ tenantId: 1, locationId: 1, day: 1 }, { unique: true }),
  })
