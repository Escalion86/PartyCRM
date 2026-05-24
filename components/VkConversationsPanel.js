'use client'

import MessengerConversationsPanel from '@components/MessengerConversationsPanel'

const VkConversationsPanel = ({ clientId = '', eventId = '' }) => (
  <MessengerConversationsPanel
    clientId={clientId}
    eventId={eventId}
    provider="vk"
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

export default VkConversationsPanel
