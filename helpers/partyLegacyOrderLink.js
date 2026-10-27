const idPattern = /^[a-f\d]{24}$/i
const failure = (message, code = 'partycrm_invalid_order_link') => Object.assign(new Error(message), { code })

export const readPartyLegacyOrderLink = (url) => {
  const params = new URL(url).searchParams
  if (!params.has('order')) return null
  const orderId = params.get('order') || ''
  const companyId = params.get('company') || ''
  if (!idPattern.test(orderId) || companyId && !idPattern.test(companyId)) throw failure('Некорректная ссылка на заказ.')
  return { orderId, companyId }
}

export const loadPartyLegacyLinkedOrder = async ({ link, companyId, orders, loadOrder }) => {
  if (link.companyId && String(link.companyId) !== String(companyId)) throw failure('Нет доступа к компании заказа по этой ссылке.', 'partycrm_order_link_company_denied')
  const order = orders.find((item) => String(item._id) === link.orderId) || await loadOrder(link.orderId)
  if (!order || String(order._id) !== link.orderId || String(order.tenantId) !== String(companyId)) throw failure('Заказ по этой ссылке не найден или недоступен.', 'partycrm_order_link_not_found')
  return order
}
