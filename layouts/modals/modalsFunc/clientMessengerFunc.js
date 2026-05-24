import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { faRotateRight } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import formatDateTime from '@helpers/formatDateTime'
import getPersonFullName from '@helpers/getPersonFullName'
import useSnackbar from '@helpers/useSnackbar'
import { useClientQuery, useClientsQuery } from '@helpers/useClientsQuery'
import NovofonCallButton from '@components/NovofonCallButton'
import AudioPlayer from '@components/AudioPlayer'

const PROVIDER_LABELS = {
  avito: 'Avito',
  vk: 'VK',
  novofon: 'Novofon',
}

const getAudioAttachments = (message) => {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : []
  return attachments.filter((attachment) => attachment?.audioUrl)
}

const getPhotoAttachments = (message) => {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : []
  return attachments.filter((attachment) => attachment?.photoUrl)
}

const getVideoAttachments = (message) => {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : []
  return attachments.filter((attachment) => attachment?.videoUrl)
}

const getFileAttachments = (message) => {
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : []
  return attachments.filter((attachment) => attachment?.fileUrl)
}

const formatFileSize = (size) => {
  const bytes = Number(size)
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

const MessageBubble = ({ message }) => {
  const audioAttachments = getAudioAttachments(message)
  const photoAttachments = getPhotoAttachments(message)
  const videoAttachments = getVideoAttachments(message)
  const fileAttachments = getFileAttachments(message)
  const isOutgoing = message.direction === 'outgoing'

  return (
    <div className={`flex ${isOutgoing ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${
          isOutgoing ? 'bg-general text-white' : 'bg-gray-100 text-gray-800'
        }`}
      >
        <div
          className={`mb-1 text-[10px] font-semibold uppercase tracking-wide ${
            isOutgoing ? 'text-white/75' : 'text-gray-500'
          }`}
        >
          {message.providerLabel || PROVIDER_LABELS[message.provider] || 'Чат'}
        </div>
        <div className="whitespace-pre-wrap break-words">{message.text}</div>
        {photoAttachments.length > 0 ? (
          <div className="mt-2 grid grid-cols-1 gap-2">
            {photoAttachments.map((attachment, index) => (
              <a
                key={`${message._id}-photo-${index}`}
                href={attachment.photoUrl}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded border border-black/10 bg-white/20"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachment.photoUrl}
                  alt={attachment.title || 'Фото'}
                  className="max-h-72 w-full max-w-80 object-contain"
                  loading="lazy"
                />
              </a>
            ))}
          </div>
        ) : null}
        {videoAttachments.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            {videoAttachments.map((attachment, index) =>
              attachment.videoUrl.includes('.mp4') ? (
                <video
                  key={`${message._id}-video-${index}`}
                  className="max-h-72 w-full max-w-80 rounded bg-black"
                  controls
                  preload="metadata"
                  src={attachment.videoUrl}
                >
                  Ваш браузер не поддерживает видео.
                </video>
              ) : (
                <a
                  key={`${message._id}-video-${index}`}
                  href={attachment.videoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className={`inline-flex rounded border px-3 py-2 text-xs font-semibold ${
                    isOutgoing
                      ? 'border-white/30 text-white'
                      : 'border-gray-300 text-gray-700'
                  }`}
                >
                  Открыть видео
                </a>
              )
            )}
          </div>
        ) : null}
        {audioAttachments.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            {audioAttachments.map((attachment, index) => (
              <AudioPlayer
                key={`${message._id}-audio-${index}`}
                src={attachment.audioUrl}
                title={attachment.title || 'Голосовая запись'}
                compact
              />
            ))}
          </div>
        ) : null}
        {fileAttachments.length > 0 ? (
          <div className="mt-2 flex flex-col gap-2">
            {fileAttachments.map((attachment, index) => (
              <a
                key={`${message._id}-file-${index}`}
                href={attachment.fileUrl}
                target="_blank"
                rel="noreferrer"
                className={`flex max-w-80 items-center justify-between gap-3 rounded border px-3 py-2 text-xs ${
                  isOutgoing
                    ? 'border-white/30 text-white'
                    : 'border-gray-300 bg-white text-gray-700'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {attachment.fileName || 'Файл'}
                  </span>
                  <span className="block opacity-70">
                    {[attachment.fileExt, formatFileSize(attachment.fileSize)]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </span>
                <span className="shrink-0 font-semibold">Скачать</span>
              </a>
            ))}
          </div>
        ) : null}
        <div className="mt-1 text-[10px] opacity-70">
          {formatDateTime(message.sentAt || message.createdAt)}
          {message.status === 'failed' ? ' · ошибка отправки' : ''}
        </div>
      </div>
    </div>
  )
}

const clientMessengerFunc = (clientId) => {
  const ClientMessengerModal = () => {
    const snackbar = useSnackbar()
    const bottomRef = useRef(null)
    const { data: clients = [] } = useClientsQuery()
    const initialClient = useMemo(
      () => clients.find((item) => item._id === clientId) ?? null,
      [clients]
    )
    const { data: client = initialClient } = useClientQuery(
      clientId,
      initialClient
    )
    const [conversations, setConversations] = useState([])
    const [messages, setMessages] = useState([])
    const [selectedKey, setSelectedKey] = useState('')
    const [loading, setLoading] = useState(false)
    const [sending, setSending] = useState(false)
    const [text, setText] = useState('')

    const selectedConversation = useMemo(
      () =>
        conversations.find(
          (item) => `${item.provider}:${item._id}` === selectedKey
        ) ?? null,
      [conversations, selectedKey]
    )
    const replyConversations = useMemo(
      () =>
        conversations.filter((conversation) =>
          ['avito', 'vk'].includes(conversation.provider)
        ),
      [conversations]
    )
    const canReply = Boolean(
      selectedConversation &&
        ['avito', 'vk'].includes(selectedConversation.provider)
    )

    const applyPayload = useCallback((payload) => {
      const nextConversations = Array.isArray(payload?.conversations)
        ? payload.conversations
        : []
      const nextMessages = Array.isArray(payload?.messages)
        ? payload.messages
        : []
      setConversations(nextConversations)
      setMessages(nextMessages)
      setSelectedKey((current) => {
        if (
          current &&
          nextConversations.some(
            (item) => `${item.provider}:${item._id}` === current
          )
        ) {
          return current
        }
        if (payload?.defaultProvider && payload?.defaultConversationId) {
          return `${payload.defaultProvider}:${payload.defaultConversationId}`
        }
        const first = nextConversations[0]
        return first ? `${first.provider}:${first._id}` : ''
      })
    }, [])

    const load = useCallback(
      async ({ showSuccess = false } = {}) => {
        if (!clientId) return
        setLoading(true)
        try {
          const response = await fetch(`/api/clients/${clientId}/messenger`)
          const result = await response.json().catch(() => ({}))
          if (!response.ok || result?.success === false) {
            snackbar.error(
              result?.error?.message || 'Не удалось загрузить переписку'
            )
            return
          }
          applyPayload(result?.data)
          if (showSuccess) snackbar.success('Сообщения обновлены')
        } catch (error) {
          snackbar.error('Не удалось загрузить переписку')
        } finally {
          setLoading(false)
        }
      },
      [applyPayload, snackbar]
    )

    useEffect(() => {
      load()
    }, [load])

    useEffect(() => {
      bottomRef.current?.scrollIntoView({ block: 'end' })
    }, [loading, messages.length])

    useEffect(() => {
      if (
        selectedConversation &&
        ['avito', 'vk'].includes(selectedConversation.provider)
      ) {
        return
      }
      const firstReplyConversation = replyConversations[0]
      if (!firstReplyConversation) return
      setSelectedKey(
        `${firstReplyConversation.provider}:${firstReplyConversation._id}`
      )
    }, [replyConversations, selectedConversation])

    const sendMessage = async () => {
      const nextText = text.trim()
      if (!canReply || !nextText) return
      setSending(true)
      try {
        const response = await fetch(`/api/clients/${clientId}/messenger`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: selectedConversation.provider,
            conversationId: selectedConversation._id,
            text: nextText,
          }),
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || result?.success === false) {
          snackbar.error(
            result?.error?.message || 'Не удалось отправить сообщение'
          )
          return
        }
        applyPayload(result?.data)
        setText('')
      } catch (error) {
        snackbar.error('Не удалось отправить сообщение')
      } finally {
        setSending(false)
      }
    }

    const clientName = getPersonFullName(client, { fallback: 'Клиент' })

    if (loading && messages.length === 0) {
      return <div className="text-sm text-gray-500">Загрузка переписки...</div>
    }

    if (conversations.length === 0) {
      return (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-500">
          Переписок с клиентом пока нет.
        </div>
      )
    }

    return (
      <div className="flex h-[70dvh] min-h-[420px] flex-col gap-3 text-sm">
        <div className="flex items-start justify-between gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2">
          <div className="min-w-0">
            <div className="truncate font-semibold text-gray-900">
              {clientName}
            </div>
            <div className="text-xs text-gray-600">
              Каналов: {conversations.length}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <NovofonCallButton
              client={client}
              className="h-8 w-8 rounded border border-gray-200 bg-white"
              size="sm"
            />
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded border border-gray-200 bg-white text-gray-600 hover:border-general hover:text-general disabled:cursor-not-allowed disabled:opacity-60"
              onClick={() => load({ showSuccess: true })}
              disabled={loading}
              title="Обновить сообщения"
            >
              <FontAwesomeIcon
                icon={faRotateRight}
                className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded border border-gray-200 bg-white p-2">
          {messages.length === 0 ? (
            <div className="text-sm text-gray-500">Сообщений пока нет.</div>
          ) : (
            messages.map((message) => (
              <MessageBubble key={`${message.provider}-${message._id}`} message={message} />
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {replyConversations.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-2 tablet:flex-row tablet:items-center">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Ответить через
              </label>
              <select
                className="min-h-10 cursor-pointer rounded border border-gray-300 bg-white px-3 py-2 text-sm outline-none focus:border-general"
                value={
                  canReply
                    ? selectedKey
                    : `${replyConversations[0].provider}:${replyConversations[0]._id}`
                }
                onChange={(event) => setSelectedKey(event.target.value)}
              >
                {replyConversations.map((conversation) => (
                  <option
                    key={`${conversation.provider}:${conversation._id}`}
                    value={`${conversation.provider}:${conversation._id}`}
                  >
                    {PROVIDER_LABELS[conversation.provider] || conversation.provider}
                  </option>
                ))}
              </select>
            </div>
            <textarea
              className="min-h-20 w-full resize-y rounded border border-gray-300 px-3 py-2 text-sm outline-none focus:border-general"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="Написать клиенту"
              disabled={!canReply}
              maxLength={4000}
            />
            <button
              type="button"
              className="action-icon-button action-icon-button--success flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 tablet:w-auto tablet:self-end"
              onClick={sendMessage}
              disabled={sending || !canReply || !text.trim()}
            >
              {sending ? 'Отправка...' : 'Отправить'}
            </button>
          </div>
        ) : null}
      </div>
    )
  }

  return {
    title: 'Диалог с клиентом',
    confirmButtonName: 'Закрыть',
    showDecline: false,
    onConfirm: true,
    Children: ClientMessengerModal,
  }
}

export default clientMessengerFunc
