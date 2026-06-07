import { PRODUCTS } from "./productContext"
import { getProductModel } from "./productDbConnect"
import partyAssignmentsSchema from "@schemas/partyAssignmentsSchema"
import partyClientsSchema from "@schemas/partyClientsSchema"
import partyCompaniesSchema from "@schemas/partyCompaniesSchema"
import partyLocationsSchema from "@schemas/partyLocationsSchema"
import partyOrdersSchema from "@schemas/partyOrdersSchema"
import partyServicesSchema from "@schemas/partyServicesSchema"
import partyStaffSchema from "@schemas/partyStaffSchema"
import partyUsersSchema from "@schemas/partyUsersSchema"
import partyTariffsSchema from "@schemas/partyTariffsSchema"
import partyPaymentsSchema from "@schemas/partyPaymentsSchema"
import partyTransactionsSchema from "@schemas/partyTransactionsSchema"

export const PARTY_STAFF_ROLES = Object.freeze({
  OWNER: "owner",
  ADMIN: "admin",
  PERFORMER: "performer",
  CONTRACTOR: "contractor",
})

export const PARTY_STAFF_ROLE_VALUES = Object.freeze([
  PARTY_STAFF_ROLES.OWNER,
  PARTY_STAFF_ROLES.ADMIN,
  PARTY_STAFF_ROLES.PERFORMER,
])

export const PARTY_CONTRACTOR_RULE =
  "contractor is stored as performer staff without authUserId until linking"

export const getPartyCompanyModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: "Company",
    collectionName: "companies",
    schemaDefinition: partyCompaniesSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, status: 1 })
      schema.index({ title: 1 })
    },
  })

export const getPartyUserModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: "User",
    collectionName: "users",
    schemaDefinition: partyUsersSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ phone: 1 }, { unique: true })
      schema.index({ email: 1 })
      schema.index({ status: 1 })
    },
  })

export const getPartyStaffModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: "Staff",
    collectionName: "staff",
    schemaDefinition: partyStaffSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, role: 1, status: 1 })
      schema.index({ tenantId: 1, phone: 1 })
      schema.index({ tenantId: 1, email: 1 })
      schema.index({ tenantId: 1, specialization: 1, status: 1 })
      schema.index({ tenantId: 1, linkStatus: 1 })
    },
  })

export const getPartyLocationModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: "Location",
    collectionName: "locations",
    schemaDefinition: partyLocationsSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, status: 1, title: 1 })
    },
  })

export const getPartyClientModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: "Client",
    collectionName: "clients",
    schemaDefinition: partyClientsSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, status: 1, firstName: 1, secondName: 1 })
      schema.index({ tenantId: 1, phone: 1 })
      schema.index({ tenantId: 1, whatsapp: 1 })
      schema.index({ tenantId: 1, telegram: 1 })
      schema.index({ tenantId: 1, vk: 1 })
      schema.index({ tenantId: 1, email: 1 })
    },
  })

export const getPartyAssignmentModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: "Assignment",
    collectionName: "assignments",
    schemaDefinition: partyAssignmentsSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, eventId: 1 })
      schema.index({ tenantId: 1, staffId: 1 })
      schema.index({ tenantId: 1, eventId: 1, staffId: 1 }, { unique: true })
    },
  })

export const getPartyServiceModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: "Service",
    collectionName: "services",
    schemaDefinition: partyServicesSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, status: 1, title: 1 })
      schema.index({ tenantId: 1, specialization: 1, status: 1 })
    },
  })

export const getPartyOrderModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: "Order",
    collectionName: "orders",
    schemaDefinition: partyOrdersSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, eventDate: -1 })
      schema.index({ tenantId: 1, status: 1, eventDate: -1 })
      schema.index({ tenantId: 1, locationId: 1, eventDate: 1 })
      schema.index({ tenantId: 1, "assignedStaff.staffId": 1, eventDate: 1 })
    },
  })

export const getPartyTariffModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: "Tariff",
    collectionName: "tariffs",
    schemaDefinition: partyTariffsSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ hidden: 1 })
      schema.index({ price: 1 })
    },
  })

export const getPartyPaymentModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: "Payment",
    collectionName: "payments",
    schemaDefinition: partyPaymentsSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ providerPaymentId: 1 })
      schema.index({ userId: 1, status: 1 })
      schema.index({ userId: 1, createdAt: -1 })
    },
  })

export const getPartyTransactionModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: "Transaction",
    collectionName: "transactions",
    schemaDefinition: partyTransactionsSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, date: -1 })
      schema.index({ tenantId: 1, orderId: 1, date: -1 })
      schema.index({ tenantId: 1, clientId: 1, date: -1 })
      schema.index({ tenantId: 1, type: 1, date: -1 })
    },
  })
