'use client'

import { faComments } from '@fortawesome/free-regular-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useQuery } from '@tanstack/react-query'
import { useAtomValue } from 'jotai'
import cn from 'classnames'
import { modalsFuncAtom } from '@state/atoms'

const fetchMessengerSummary = async (clientId) => {
  const response = await fetch(`/api/clients/${clientId}/messenger?summary=1`)
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result?.success === false) {
    throw new Error(result?.error?.message || 'Не удалось загрузить чаты')
  }
  return result?.data
}

const ClientChatButton = ({
  clientId,
  className,
  size = 'lg',
  withTitle = false,
}) => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const { data } = useQuery({
    queryKey: ['clientMessengerSummary', clientId],
    queryFn: () => fetchMessengerSummary(clientId),
    enabled: Boolean(clientId),
    staleTime: 60 * 1000,
  })

  const conversations = Array.isArray(data?.conversations)
    ? data.conversations
    : []
  if (!clientId || conversations.length === 0) return null

  const openChat = (event) => {
    event.stopPropagation()
    modalsFunc.client?.messenger(clientId)
  }

  if (withTitle) {
    return (
      <button
        type="button"
        className={cn(
          'group flex cursor-pointer items-center gap-x-2 text-left',
          className
        )}
        onClick={openChat}
      >
        <div className="flex w-6 items-center justify-center">
          <FontAwesomeIcon
            icon={faComments}
            className="h-6 text-general duration-300 group-hover:scale-115 group-hover:text-toxic"
            size={size}
          />
        </div>
        <span className="group-hover:text-toxic">Чат</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      className={cn(
        'flex h-6 w-6 cursor-pointer items-center justify-center text-general duration-300 hover:scale-110 hover:text-toxic',
        className
      )}
      onClick={openChat}
      title="Открыть чат с клиентом"
    >
      <FontAwesomeIcon icon={faComments} size={size} />
    </button>
  )
}

export default ClientChatButton
