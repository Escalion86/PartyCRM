'use client'

import { useMemo } from 'react'
import MessengerConversationsPanel from '@components/MessengerConversationsPanel'

const PartyVkConversationsPanel = ({
  clientId = '',
  orderId = '',
  companyId = '',
  canReply = true,
}) => {
  const requestHeaders = useMemo(
    () => (companyId ? { 'x-partycrm-company-id': companyId } : {}),
    [companyId]
  )

  return (
    <MessengerConversationsPanel
      clientId={clientId}
      orderId={orderId}
      provider="vk"
      apiBasePath="/api/party/integrations"
      requestHeaders={requestHeaders}
      canReply={canReply}
      title="VK"
      loadingText="Загрузка переписок VK..."
      emptyText="Переписок VK пока нет."
      replyPlaceholder="Ответить в VK"
      sendButtonText="Отправить в VK"
      getConversationTitle={(conversation) =>
        conversation.clientName || 'Чат VK'
      }
      getConversationSubtitle={(conversation) =>
        conversation.lastMessageText || conversation.vkPeerId
      }
      getConversationMeta={(conversation) => `Peer ID: ${conversation.vkPeerId}`}
    />
  )
}

export default PartyVkConversationsPanel
