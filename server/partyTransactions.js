import {
  getPartyOrderModel,
  getPartyTransactionModel,
} from './partyModels.js'
import { isValidObjectId, partyError } from './partyApi.js'
export {
  normalizePartyTransactionPayload,
  serializePartyTransaction,
} from './partyTransactionsCore.js'
import { serializePartyTransaction } from './partyTransactionsCore.js'

export const validatePartyTransactionOrder = async ({ tenantId, orderId }) => {
  if (!isValidObjectId(orderId)) {
    return {
      order: null,
      error: partyError(
        400,
        'partycrm_invalid_order_id',
        'Некорректный заказ',
        'validation'
      ),
    }
  }

  const PartyOrders = await getPartyOrderModel()
  const order = await PartyOrders.findOne({ _id: orderId, tenantId }).lean()
  if (!order) {
    return {
      order: null,
      error: partyError(
        404,
        'partycrm_order_not_found',
        'Заказ не найден',
        'validation'
      ),
    }
  }

  return { order, error: null }
}

export const validatePartyPayoutTransactionStaff = ({ order, payload }) => {
  if (payload.type !== 'expense' || payload.category !== 'payout') {
    return { error: null }
  }

  if (!isValidObjectId(payload.staffId)) {
    return {
      error: partyError(
        400,
        'partycrm_payout_staff_required',
        'Выберите исполнителя для выплаты',
        'validation'
      ),
    }
  }

  const assigned = (order.assignedStaff ?? []).some(
    (item) => String(item?.staffId) === String(payload.staffId)
  )
  if (!assigned) {
    return {
      error: partyError(
        400,
        'partycrm_payout_staff_not_assigned',
        'Выбранный исполнитель не назначен на заказ',
        'validation'
      ),
    }
  }

  return { error: null }
}

export const listPartyTransactions = async ({ tenantId, orderId }) => {
  const PartyTransactions = await getPartyTransactionModel()
  const query = { tenantId }
  if (orderId) query.orderId = orderId
  const transactions = await PartyTransactions.find(query)
    .sort({ date: -1, createdAt: -1 })
    .lean()
  return transactions.map(serializePartyTransaction)
}
