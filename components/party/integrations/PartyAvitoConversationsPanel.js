'use client'

import { useMemo } from 'react'
import MessengerConversationsPanel from '@components/MessengerConversationsPanel'

const PartyAvitoConversationsPanel = ({
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
      provider="avito"
      apiBasePath="/api/party/integrations"
      requestHeaders={requestHeaders}
      canReply={canReply}
      title="Avito"
      loadingText="Загрузка переписок Avito..."
      emptyText="Переписок Avito пока нет."
      replyPlaceholder="Ответить в Avito"
      sendButtonText="Отправить в Avito"
      getConversationTitle={(conversation) =>
        conversation.avitoItemTitle || 'Чат Avito'
      }
      getConversationSubtitle={(conversation) =>
        conversation.lastMessageText || conversation.avitoChatId
      }
      getConversationMeta={(conversation) =>
        `Chat ID: ${conversation.avitoChatId}`
      }
    />
  )
}

export default PartyAvitoConversationsPanel
