'use client'

import { useMemo } from 'react'
import MessengerConversationsPanel from '@components/MessengerConversationsPanel'

export default function PartyTelegramConversationsPanel({
  clientId = '',
  orderId = '',
  companyId = '',
  canReply = true,
}) {
  const requestHeaders = useMemo(
    () => (companyId ? { 'x-partycrm-company-id': companyId } : {}),
    [companyId]
  )

  return (
    <MessengerConversationsPanel
      clientId={clientId}
      orderId={orderId}
      provider="telegram"
      apiBasePath="/api/party/integrations"
      requestHeaders={requestHeaders}
      canReply={canReply}
      title="Telegram"
      loadingText="Загрузка переписок Telegram..."
      emptyText="Переписок Telegram пока нет."
      replyPlaceholder="Ответить в Telegram"
      sendButtonText="Отправить в Telegram"
      getConversationTitle={(conversation) =>
        conversation.clientName || conversation.telegramUsername || 'Чат Telegram'
      }
      getConversationSubtitle={(conversation) =>
        conversation.lastMessageText || conversation.telegramChatId
      }
      getConversationMeta={(conversation) =>
        conversation.telegramUsername
          ? `@${conversation.telegramUsername}`
          : `Chat ID: ${conversation.telegramChatId}`
      }
      canReplyToConversation={(conversation) => conversation?.canReply !== false}
      replyUnavailableText="24-часовое окно ответа Telegram истекло. Клиенту нужно сначала написать снова."
    />
  )
}
