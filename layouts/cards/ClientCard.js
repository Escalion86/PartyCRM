'use client'

import loadingAtom from '@state/atoms/loadingAtom'
import errorAtom from '@state/atoms/errorAtom'
import PropTypes from 'prop-types'
import CardButtons from '@components/CardButtons'
import CardOverlay from '@components/CardOverlay'
import CardActions from '@components/CardActions'
import ClientChatButton from '@components/ClientChatButton'
import formatDate from '@helpers/formatDate'
import getPersonFullName from '@helpers/getPersonFullName'
import { useAtomValue } from 'jotai'
import CardWrapper from '@components/CardWrapper'

const CONTACT_CHANNEL_LABELS = {
  phone: 'Телефон',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  max: 'MAX',
  vk: 'VK',
  other: 'Другое',
}

const getPreferredContactChannelLabel = (client) => {
  if (!client?.preferredContactChannel) return ''
  if (client.preferredContactChannel === 'other')
    return client.preferredContactChannelOther?.trim() || 'Другое'
  return CONTACT_CHANNEL_LABELS[client.preferredContactChannel] || ''
}

const formatSignificantDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
  })
}

const getFirstSignificantDateLabel = (client) => {
  const item = Array.isArray(client?.significantDates)
    ? client.significantDates.find((dateItem) => dateItem?.title || dateItem?.date)
    : null
  if (!item) return ''
  const title = item.title || 'Дата'
  const date = formatSignificantDate(item.date)
  return date ? `${title}: ${date}` : title
}

const ClientCard = ({ client, style, onEdit, onView }) => {
  const loading = useAtomValue(loadingAtom('client' + client._id))
  const error = useAtomValue(errorAtom('client' + client._id))
  const lastRequestLabel = client.lastRequest
    ? formatDate(client.lastRequest.toISOString(), false, true)
    : '-'
  const preferredContactChannelLabel = getPreferredContactChannelLabel(client)
  const significantDateLabel = getFirstSignificantDateLabel(client)

  return (
    <CardWrapper
      style={style}
      onClick={() => !loading && onView?.()}
      className="card-body-pad group flex h-full w-full cursor-pointer p-4 text-left hover:border-gray-300"
    >
      <CardOverlay loading={loading} error={error} />
      <CardActions>
        <CardButtons
          item={client}
          typeOfItem="client"
          minimalActions
          alwaysCompact
          onEdit={onEdit}
        />
      </CardActions>

      <div className="flex h-full w-full gap-3">
        <div className="flex flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="card-title text-base">
              {getPersonFullName(client, { fallback: '-' })}
            </div>
            <div className="card-muted text-sm">
              Последняя заявка: {lastRequestLabel}
            </div>
          </div>
          <div className="card-meta grid gap-2 text-sm">
            <div className="card-title truncate font-medium">
              {client.phone ? `+${client.phone}` : 'Телефон не указан'}
            </div>
            {preferredContactChannelLabel && (
              <div className="truncate text-gray-600">
                Приоритетная связь: {preferredContactChannelLabel}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <ClientChatButton clientId={client._id} />
            </div>
            {significantDateLabel && (
              <div className="truncate text-gray-600">
                Значимая дата: {significantDateLabel}
              </div>
            )}
            {client.comment && (
              <div className="line-clamp-2 break-words text-gray-600">
                {client.comment}
              </div>
            )}
          </div>
        </div>
        <div className="card-meta mt-auto self-end text-right text-sm font-semibold whitespace-nowrap">
          <div>Заявки: {client.requestsCount}</div>
          <div>Мероприятия: {client.eventsCount}</div>
          <div>Отмененные: {client.canceledEventsCount}</div>
        </div>
      </div>
    </CardWrapper>
  )
}

ClientCard.propTypes = {
  client: PropTypes.shape({
    _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    firstName: PropTypes.string,
    secondName: PropTypes.string,
    thirdName: PropTypes.string,
    phone: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    preferredContactChannel: PropTypes.string,
    preferredContactChannelOther: PropTypes.string,
    significantDates: PropTypes.arrayOf(
      PropTypes.shape({
        title: PropTypes.string,
        date: PropTypes.oneOfType([
          PropTypes.string,
          PropTypes.instanceOf(Date),
        ]),
        comment: PropTypes.string,
      })
    ),
    comment: PropTypes.string,
    requestsCount: PropTypes.number,
    eventsCount: PropTypes.number,
    canceledEventsCount: PropTypes.number,
    lastRequest: PropTypes.instanceOf(Date),
  }).isRequired,
  style: PropTypes.shape({}),
  onEdit: PropTypes.func.isRequired,
  onView: PropTypes.func.isRequired,
}

ClientCard.defaultProps = {
  style: null,
}

export default ClientCard
