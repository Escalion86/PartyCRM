'use client'

import loadingAtom from '@state/atoms/loadingAtom'
import errorAtom from '@state/atoms/errorAtom'
import PropTypes from 'prop-types'
import CardButtons from '@components/CardButtons'
import CardOverlay from '@components/CardOverlay'
import CardActions from '@components/CardActions'
import CardStatusBar from '@components/CardStatusBar'
import { TRANSACTION_CATEGORIES } from '@helpers/constants'
import formatDate from '@helpers/formatDate'
import formatAddress from '@helpers/formatAddress'
import getPersonFullName from '@helpers/getPersonFullName'
import { useAtomValue } from 'jotai'
import CardWrapper from '@components/CardWrapper'

const typeClassNames = {
  income: 'bg-green-500',
  expense: 'bg-red-500',
}

const formatTransactionDate = (value) => {
  if (!value) return '-'
  const date = new Date(value)
  const datePart = formatDate(date.toISOString(), false, true)
  const timePart = date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
  return `${datePart} ${timePart}`
}

const TransactionCard = ({
  transaction,
  client,
  event,
  type,
  style,
  onEdit,
  onDelete,
}) => {
  const loading = useAtomValue(loadingAtom('transaction' + transaction._id))
  const error = useAtomValue(errorAtom('transaction' + transaction._id))
  const clientName = client ? getPersonFullName(client, { fallback: '-' }) : '-'

  const eventTitle =
    formatAddress(event?.address, '') ||
    (event?.eventDate
      ? `Мероприятие ${formatDate(event.eventDate, false, true)}`
      : 'Мероприятие')

  const eventDateTime = event?.eventDate
    ? `${formatDate(event.eventDate, false, true)} ${new Date(
        event.eventDate
      ).toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : null

  const eventTitleWithDate = eventDateTime
    ? `${eventTitle} - ${eventDateTime}`
    : eventTitle

  const categoryLabel =
    TRANSACTION_CATEGORIES.find((item) => item.value === transaction.category)
      ?.name ?? null

  return (
    <CardWrapper
      style={style}
      onClick={() => !loading && onEdit?.()}
      className="card-body-pad flex h-full w-full cursor-pointer p-3 pr-4 text-left hover:border-gray-300"
    >
      <CardOverlay loading={loading} error={error} />
      <CardActions>
        <CardButtons
          item={transaction}
          typeOfItem="transaction"
          minimalActions
          alwaysCompact
          onEdit={onEdit}
          onDelete={onDelete}
        />
      </CardActions>
      <CardStatusBar
        className={
          typeClassNames[type?.value ?? transaction.type] || 'bg-gray-300'
        }
      />

      <div className="flex h-full w-full flex-col pl-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="card-title text-sm">
            {formatTransactionDate(transaction.date)}
          </div>
          {categoryLabel && (
            <div className="card-muted text-xs font-medium">
              {categoryLabel}
            </div>
          )}
        </div>
        <div className="card-meta tablet:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] grid text-sm">
          <div className="truncate">
            <div className="card-title truncate font-medium">
              {clientName || '-'}
            </div>
          </div>
          <div className="truncate">
            <div className="card-title truncate font-medium">
              {eventTitleWithDate}
            </div>
          </div>
        </div>
        {transaction.comment && (
          <div className="card-muted text-sm">{transaction.comment}</div>
        )}
      </div>
      <div className="card-title mt-auto self-end text-right text-lg font-semibold whitespace-nowrap">
        {transaction.amount
          ? `${transaction.amount.toLocaleString()} ₽`
          : '0 ₽'}
      </div>
    </CardWrapper>
  )
}

TransactionCard.propTypes = {
  transaction: PropTypes.shape({
    _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    date: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
      PropTypes.instanceOf(Date),
    ]),
    type: PropTypes.string,
    clientId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    eventId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    comment: PropTypes.string,
    amount: PropTypes.number,
    category: PropTypes.string,
  }).isRequired,
  client: PropTypes.shape({
    firstName: PropTypes.string,
    secondName: PropTypes.string,
  }),
  event: PropTypes.shape({
    eventDate: PropTypes.oneOfType([
      PropTypes.string,
      PropTypes.number,
      PropTypes.instanceOf(Date),
    ]),
    address: PropTypes.shape({
      town: PropTypes.string,
      street: PropTypes.string,
      house: PropTypes.string,
      entrance: PropTypes.string,
      floor: PropTypes.string,
      flat: PropTypes.string,
      comment: PropTypes.string,
      link2Gis: PropTypes.string,
      linkYandexNavigator: PropTypes.string,
      link2GisShow: PropTypes.bool,
      linkYandexShow: PropTypes.bool,
    }),
  }),
  type: PropTypes.shape({
    value: PropTypes.string,
  }),
  style: PropTypes.shape({}),
  onEdit: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
}

TransactionCard.defaultProps = {
  client: null,
  event: null,
  type: null,
  style: null,
}

export default TransactionCard
