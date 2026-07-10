'use client'

import Modal from '@components/Modal'
import PartyAvitoConversationsPanel from '@components/party/integrations/PartyAvitoConversationsPanel'
import PartyVkConversationsPanel from '@components/party/integrations/PartyVkConversationsPanel'
import getPersonFullName from '@helpers/getPersonFullName'

const getOrderMessengerTitle = ({ order, client }) => {
  const orderTitle =
    typeof order?.title === 'string' && order.title.trim()
      ? order.title.trim()
      : 'Заказ'
  const clientName = getPersonFullName(client, { fallback: '' })
  return clientName ? `Переписки: ${orderTitle} · ${clientName}` : `Переписки: ${orderTitle}`
}

export default function OrderMessengerModal({
  open,
  order,
  clientsById,
  activeCompanyId,
  canManage = false,
  onClose,
}) {
  const client = order?.clientId
    ? (clientsById?.get(String(order.clientId)) ?? null)
    : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={getOrderMessengerTitle({ order, client })}
      tone="party"
      size="2xl"
    >
      {order?._id ? (
        <div className="grid gap-4">
          <PartyVkConversationsPanel
            clientId={order.clientId || ''}
            orderId={order._id || ''}
            companyId={activeCompanyId}
            canReply={canManage}
          />
          <PartyAvitoConversationsPanel
            clientId={order.clientId || ''}
            orderId={order._id || ''}
            companyId={activeCompanyId}
            canReply={canManage}
          />
        </div>
      ) : (
        <p className="text-sm text-gray-500">
          Переписки появятся после сохранения заказа.
        </p>
      )}
    </Modal>
  )
}
