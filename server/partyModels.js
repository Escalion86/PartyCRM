import { PRODUCTS } from './productContext'
import { getProductModel } from './productDbConnect'
import partyAssignmentsSchema from '@schemas/partyAssignmentsSchema'
import partyClientsSchema from '@schemas/partyClientsSchema'
import partyCompaniesSchema from '@schemas/partyCompaniesSchema'
import partyLocationsSchema from '@schemas/partyLocationsSchema'
import partyOrdersSchema from '@schemas/partyOrdersSchema'
import partyServicesSchema from '@schemas/partyServicesSchema'
import partyServiceGroupsSchema from '@schemas/partyServiceGroupsSchema'
import partyStaffSchema from '@schemas/partyStaffSchema'
import partyStaffInvitesSchema from '@schemas/partyStaffInvitesSchema'
import partyUsersSchema from '@schemas/partyUsersSchema'
import partyTariffsSchema from '@schemas/partyTariffsSchema'
import partyPaymentsSchema from '@schemas/partyPaymentsSchema'
import partyTransactionsSchema from '@schemas/partyTransactionsSchema'
import partyCallsSchema from '@schemas/partyCallsSchema'
import partyAvitoConversationsSchema from '@schemas/partyAvitoConversationsSchema'
import partyAvitoMessagesSchema from '@schemas/partyAvitoMessagesSchema'
import partyVkConversationsSchema from '@schemas/partyVkConversationsSchema'
import partyVkMessagesSchema from '@schemas/partyVkMessagesSchema'
import partyTelegramConversationsSchema from '@schemas/partyTelegramConversationsSchema'
import partyTelegramMessagesSchema from '@schemas/partyTelegramMessagesSchema'
import partyAuditLogsSchema from '@schemas/partyAuditLogsSchema'
import partyProposalsSchema from '@schemas/partyProposalsSchema'

export const PARTY_STAFF_ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  PERFORMER: 'performer',
  LOCATION_OWNER: 'location_owner',
  CONTRACTOR: 'contractor',
})

export const PARTY_STAFF_ROLE_VALUES = Object.freeze([
  PARTY_STAFF_ROLES.OWNER,
  PARTY_STAFF_ROLES.ADMIN,
  PARTY_STAFF_ROLES.PERFORMER,
  PARTY_STAFF_ROLES.LOCATION_OWNER,
])

export const PARTY_CONTRACTOR_RULE =
  'contractor is stored as performer staff without authUserId until linking'

export const getPartyCompanyModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'Company',
    collectionName: 'companies',
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
    name: 'User',
    collectionName: 'users',
    schemaDefinition: partyUsersSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ phone: 1 }, { unique: true })
      schema.index({ vkId: 1 }, { unique: true, sparse: true })
      schema.index({ email: 1 })
      schema.index({ status: 1 })
    },
  })

export const getPartyStaffModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'Staff',
    collectionName: 'staff',
    schemaDefinition: partyStaffSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, role: 1, status: 1 })
      schema.index({ tenantId: 1, phone: 1 })
      schema.index({ tenantId: 1, email: 1 })
      schema.index({ tenantId: 1, specialization: 1, status: 1 })
      schema.index({ tenantId: 1, linkStatus: 1 })
      schema.index({ authUserId: 1, status: 1, role: 1, createdAt: 1 })
      schema.index({ linkedAuthUserId: 1, status: 1 })
    },
  })

export const getPartyLocationModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'Location',
    collectionName: 'locations',
    schemaDefinition: partyLocationsSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, status: 1, title: 1 })
    },
  })

export const getPartyClientModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'Client',
    collectionName: 'clients',
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
    name: 'Assignment',
    collectionName: 'assignments',
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
    name: 'Service',
    collectionName: 'services',
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
    name: 'Order',
    collectionName: 'orders',
    schemaDefinition: partyOrdersSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, eventDate: -1 })
      schema.index({ tenantId: 1, status: 1, eventDate: -1 })
      schema.index({ tenantId: 1, locationId: 1, eventDate: 1 })
      schema.index({ tenantId: 1, 'assignedStaff.staffId': 1, eventDate: 1 })
      schema.index({ tenantId: 1, status: 1, 'additionalEvents.date': 1 })
      schema.index({ tenantId: 1, status: 1, 'preparation.enabled': 1, 'preparation.items.status': 1 })
    },
  })

export const getPartyProposalModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'Proposal',
    collectionName: 'proposals',
    schemaDefinition: partyProposalsSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, orderId: 1, createdAt: -1 })
      schema.index({ tenantId: 1, number: 1, version: 1 }, { unique: true })
      schema.index({ tenantId: 1, status: 1, validUntil: 1 })
    },
  })

export const getPartyAuditLogModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'AuditLog',
    collectionName: 'auditLogs',
    schemaDefinition: partyAuditLogsSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, createdAt: -1 })
      schema.index({ tenantId: 1, entityType: 1, entityId: 1, createdAt: -1 })
      schema.index({ tenantId: 1, actorStaffId: 1, createdAt: -1 })
    },
  })

export const getPartyTariffModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'Tariff',
    collectionName: 'tariffs',
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
    name: 'Payment',
    collectionName: 'payments',
    schemaDefinition: partyPaymentsSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ providerPaymentId: 1 })
      schema.index({ userId: 1, status: 1 })
      schema.index({ userId: 1, createdAt: -1 })
    },
  })

export const getPartyStaffInviteModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'StaffInvite',
    collectionName: 'staffInvites',
    schemaDefinition: partyStaffInvitesSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tokenHash: 1 }, { unique: true })
      schema.index({ tenantId: 1, staffId: 1, status: 1, createdAt: -1 })
      schema.index({ status: 1, expiresAt: 1 })
    },
  })

export const getPartyTransactionModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'Transaction',
    collectionName: 'transactions',
    schemaDefinition: partyTransactionsSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, date: -1 })
      schema.index({ tenantId: 1, orderId: 1, date: -1 })
      schema.index({ tenantId: 1, clientId: 1, date: -1 })
      schema.index({ tenantId: 1, staffId: 1, date: -1 })
      schema.index({ tenantId: 1, type: 1, date: -1 })
    },
  })

export const getPartyServiceGroupModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'ServiceGroup',
    collectionName: 'servicegroups',
    schemaDefinition: partyServiceGroupsSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, order: 1 })
      schema.index({ tenantId: 1, title: 1 })
    },
  })

export const getPartyCallModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'PartyCall',
    collectionName: 'calls',
    schemaDefinition: partyCallsSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, provider: 1, providerCallId: 1 })
      schema.index({ tenantId: 1, startedAt: -1 })
      schema.index({ tenantId: 1, linkedClientId: 1, startedAt: -1 })
      schema.index({ tenantId: 1, status: 1, startedAt: -1 })
    },
  })

export const getPartyAvitoConversationModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'PartyAvitoConversation',
    collectionName: 'avitoConversations',
    schemaDefinition: partyAvitoConversationsSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, avitoChatId: 1 }, { unique: true })
      schema.index({ tenantId: 1, clientId: 1, lastMessageAt: -1 })
      schema.index({ tenantId: 1, orderId: 1, lastMessageAt: -1 })
    },
  })

export const getPartyAvitoMessageModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'PartyAvitoMessage',
    collectionName: 'avitoMessages',
    schemaDefinition: partyAvitoMessagesSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, conversationId: 1, sentAt: 1 })
      schema.index({ tenantId: 1, avitoChatId: 1, avitoMessageId: 1 })
      schema.index({ tenantId: 1, avitoChatId: 1, avitoMessageId: 1, direction: 1 }, { name: 'party_avito_incoming_idempotency', unique: true, partialFilterExpression: { avitoMessageId: { $gt: '' }, direction: 'incoming' } })
      schema.index({ tenantId: 1, clientId: 1, sentAt: -1 })
      schema.index({ tenantId: 1, orderId: 1, sentAt: -1 })
    },
  })

export const getPartyVkConversationModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'PartyVkConversation',
    collectionName: 'vkConversations',
    schemaDefinition: partyVkConversationsSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, vkGroupId: 1, vkPeerId: 1 }, { unique: true })
      schema.index({ tenantId: 1, clientId: 1, lastMessageAt: -1 })
      schema.index({ tenantId: 1, orderId: 1, lastMessageAt: -1 })
    },
  })

export const getPartyVkMessageModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'PartyVkMessage',
    collectionName: 'vkMessages',
    schemaDefinition: partyVkMessagesSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, conversationId: 1, sentAt: 1 })
      schema.index({ tenantId: 1, vkGroupId: 1, vkPeerId: 1, vkMessageId: 1 })
      schema.index({ tenantId: 1, vkGroupId: 1, vkPeerId: 1, vkMessageId: 1, direction: 1 }, { name: 'party_vk_incoming_idempotency', unique: true, partialFilterExpression: { vkMessageId: { $gt: '' }, direction: 'incoming' } })
      schema.index({ tenantId: 1, clientId: 1, sentAt: -1 })
      schema.index({ tenantId: 1, orderId: 1, sentAt: -1 })
    },
  })

export const getPartyTelegramConversationModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'PartyTelegramConversation',
    collectionName: 'telegramConversations',
    schemaDefinition: partyTelegramConversationsSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index({ tenantId: 1, telegramChatId: 1 }, { unique: true })
      schema.index({ tenantId: 1, clientId: 1, lastMessageAt: -1 })
      schema.index({ tenantId: 1, orderId: 1, lastMessageAt: -1 })
    },
  })

export const getPartyTelegramMessageModel = () =>
  getProductModel({
    product: PRODUCTS.PARTYCRM,
    name: 'PartyTelegramMessage',
    collectionName: 'telegramMessages',
    schemaDefinition: partyTelegramMessagesSchema,
    schemaOptions: { timestamps: true },
    configureSchema: (schema) => {
      schema.index(
        { tenantId: 1, telegramChatId: 1, telegramMessageId: 1 },
        { unique: true }
      )
      schema.index({ tenantId: 1, conversationId: 1, sentAt: 1 })
      schema.index({ tenantId: 1, clientId: 1, sentAt: -1 })
      schema.index({ tenantId: 1, orderId: 1, sentAt: -1 })
    },
  })
