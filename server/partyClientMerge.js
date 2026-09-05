import {
  getPartyAvitoConversationModel,
  getPartyAvitoMessageModel,
  getPartyCallModel,
  getPartyClientModel,
  getPartyOrderModel,
  getPartyTransactionModel,
  getPartyVkConversationModel,
  getPartyVkMessageModel,
  getPartyTelegramConversationModel,
  getPartyTelegramMessageModel,
} from '@server/partyModels'

export const buildPartyClientSnapshot = (client = {}) => ({
  name: [client.firstName, client.secondName, client.thirdName]
    .filter(Boolean)
    .join(' '),
  phone: client.phone || '',
  email: client.email || '',
})

export const mergePartyClients = async ({
  tenantId,
  targetClientId,
  sourceClientId,
}) => {
  const PartyClients = await getPartyClientModel()
  const [targetClient, sourceClient] = await Promise.all([
    PartyClients.findOne({
      _id: targetClientId,
      tenantId,
      status: { $ne: 'archived' },
    }).lean(),
    PartyClients.findOne({
      _id: sourceClientId,
      tenantId,
      status: { $ne: 'archived' },
    }).lean(),
  ])

  if (!targetClient || !sourceClient) {
    return { ok: false, reason: 'not_found' }
  }

  const [
    PartyOrders,
    PartyTransactions,
    PartyCalls,
    PartyVkConversations,
    PartyVkMessages,
    PartyAvitoConversations,
    PartyAvitoMessages,
    PartyTelegramConversations,
    PartyTelegramMessages,
  ] = await Promise.all([
    getPartyOrderModel(),
    getPartyTransactionModel(),
    getPartyCallModel(),
    getPartyVkConversationModel(),
    getPartyVkMessageModel(),
    getPartyAvitoConversationModel(),
    getPartyAvitoMessageModel(),
    getPartyTelegramConversationModel(),
    getPartyTelegramMessageModel(),
  ])

  const client = buildPartyClientSnapshot(targetClient)
  const [
    orders,
    transactions,
    calls,
    vkConversations,
    vkMessages,
    avitoConversations,
    avitoMessages,
    telegramConversations,
    telegramMessages,
  ] = await Promise.all([
    PartyOrders.updateMany(
      { tenantId, clientId: sourceClientId },
      { $set: { clientId: targetClientId, client } }
    ),
    PartyTransactions.updateMany(
      { tenantId, clientId: sourceClientId },
      { $set: { clientId: targetClientId } }
    ),
    PartyCalls.updateMany(
      { tenantId, linkedClientId: sourceClientId },
      { $set: { linkedClientId: targetClientId } }
    ),
    PartyVkConversations.updateMany(
      { tenantId, clientId: sourceClientId },
      { $set: { clientId: targetClientId } }
    ),
    PartyVkMessages.updateMany(
      { tenantId, clientId: sourceClientId },
      { $set: { clientId: targetClientId } }
    ),
    PartyAvitoConversations.updateMany(
      { tenantId, clientId: sourceClientId },
      { $set: { clientId: targetClientId } }
    ),
    PartyAvitoMessages.updateMany(
      { tenantId, clientId: sourceClientId },
      { $set: { clientId: targetClientId } }
    ),
    PartyTelegramConversations.updateMany(
      { tenantId, clientId: sourceClientId },
      { $set: { clientId: targetClientId } }
    ),
    PartyTelegramMessages.updateMany(
      { tenantId, clientId: sourceClientId },
      { $set: { clientId: targetClientId } }
    ),
  ])

  const archivedClient = await PartyClients.findOneAndUpdate(
    { _id: sourceClientId, tenantId },
    { $set: { status: 'archived' } },
    { returnDocument: 'after' }
  ).lean()

  return {
    ok: true,
    targetClient,
    archivedClient,
    counts: {
      orders: orders.modifiedCount || 0,
      transactions: transactions.modifiedCount || 0,
      calls: calls.modifiedCount || 0,
      vkConversations: vkConversations.modifiedCount || 0,
      vkMessages: vkMessages.modifiedCount || 0,
      avitoConversations: avitoConversations.modifiedCount || 0,
      avitoMessages: avitoMessages.modifiedCount || 0,
      telegramConversations: telegramConversations.modifiedCount || 0,
      telegramMessages: telegramMessages.modifiedCount || 0,
    },
  }
}
