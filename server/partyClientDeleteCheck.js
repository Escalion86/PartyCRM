import {
  getPartyAvitoConversationModel,
  getPartyCallModel,
  getPartyOrderModel,
  getPartyTransactionModel,
  getPartyVkConversationModel,
} from '@server/partyModels'

export const getPartyClientDeleteRelations = async ({ tenantId, clientId }) => {
  const [
    PartyOrders,
    PartyTransactions,
    PartyCalls,
    PartyVkConversations,
    PartyAvitoConversations,
  ] = await Promise.all([
    getPartyOrderModel(),
    getPartyTransactionModel(),
    getPartyCallModel(),
    getPartyVkConversationModel(),
    getPartyAvitoConversationModel(),
  ])

  const [orders, transactions, calls, vkConversations, avitoConversations] =
    await Promise.all([
      PartyOrders.countDocuments({ tenantId, clientId }),
      PartyTransactions.countDocuments({ tenantId, clientId }),
      PartyCalls.countDocuments({ tenantId, linkedClientId: clientId }),
      PartyVkConversations.countDocuments({ tenantId, clientId }),
      PartyAvitoConversations.countDocuments({ tenantId, clientId }),
    ])

  return {
    orders,
    transactions,
    calls,
    vkConversations,
    avitoConversations,
  }
}

export const hasPartyClientDeleteRelations = (relations = {}) =>
  Object.values(relations).some((count) => Number(count || 0) > 0)
