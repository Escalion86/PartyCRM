'use client'

import MessengerConversationsPanel from '@components/MessengerConversationsPanel'

const AvitoConversationsPanel = ({ clientId = '', eventId = '' }) => (
  <MessengerConversationsPanel
    clientId={clientId}
    eventId={eventId}
    provider="avito"
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
    getConversationMeta={(conversation) => `Chat ID: ${conversation.avitoChatId}`}
  />
)

export default AvitoConversationsPanel
