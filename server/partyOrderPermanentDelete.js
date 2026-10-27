// A create-request identity must outlive retries even if someone later removes
// the receipt. Embedded and separate financial history must remain attributable.
export const getPartyOrderPermanentDeleteBlocker = async ({
  tenantId,
  order,
  Transactions,
}) => {
  if (order.fulfillment?.performedAt)
    return {
      code: 'partycrm_order_fulfillment_history_readonly',
      message:
        'Заказ с отметкой проведения нельзя удалить безвозвратно. Сохраните историю оказанных услуг.',
    }
  if (order.createRequestKey)
    return {
      code: 'partycrm_order_create_history_readonly',
      message:
        'Заказ с историей первоначального платежа нельзя удалить безвозвратно. Можно отменить заказ.',
    }
  if (order.transactions?.length)
    return {
      code: 'partycrm_order_financial_history_readonly',
      message:
        'Заказ с финансовой историей нельзя удалить безвозвратно. Можно отменить заказ.',
    }
  if (!Transactions) return null
  const persisted = await Transactions.findOne({ tenantId, orderId: order._id })
    .select('_id')
    .lean()
  return persisted
    ? {
        code: 'partycrm_order_financial_history_readonly',
        message:
          'Заказ с финансовой историей нельзя удалить безвозвратно. Можно отменить заказ.',
      }
    : null
}
