'use client'

// import cn from 'classnames'
import { useAtomValue } from 'jotai'
import { useMemo } from 'react'
import Image from 'next/image'
import { EVENT_STATUSES, EVENT_STATUSES_SIMPLE } from '@helpers/constants'
import formatDate from '@helpers/formatDate'
import formatAddress from '@helpers/formatAddress'
import { modalsFuncAtom } from '@state/atoms'
import servicesAtom from '@state/atoms/servicesAtom'
import loadingAtom from '@state/atoms/loadingAtom'
import errorAtom from '@state/atoms/errorAtom'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faShare,
  faTriangleExclamation,
  faCircleCheck,
  faBan,
  faUserSlash,
  faCalendarXmark,
  faClock,
} from '@fortawesome/free-solid-svg-icons'
import CardButtons from '@components/CardButtons'
import ContactsIconsButtons from '@components/ContactsIconsButtons'
import CardOverlay from '@components/CardOverlay'
import CardActions from '@components/CardActions'
import CardWrapper from '@components/CardWrapper'
import StatusChip from '@components/StatusChip'
import {
  getSoonNoDepositEvents,
  getEventOverdueAdditionalCount,
} from '@helpers/additionalEvents'
import getGoogleCalendarLinkFromText from '@helpers/getGoogleCalendarLinkFromText'
import getPersonFullName from '@helpers/getPersonFullName'
import {
  getEventPublicApiSourceLabel,
  isEventCreatedViaPublicApi,
} from '@helpers/eventSource'
import { useClientsQuery } from '@helpers/useClientsQuery'
import { useEventQuery } from '@helpers/useEventsQuery'
import { useTransactionsQuery } from '@helpers/useTransactionsQuery'

const CALENDAR_RESPONSE_MARKER = '--- Google Calendar Response ---'

const formatCardDateTime = (value) => {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return `${formatDate(date, false, true)} ${date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

const getEventStatusMarkerClassName = ({
  isCanceled,
  isClosed,
  isDraft,
  isFinished,
}) => {
  if (isCanceled) return 'bg-red-500'
  if (isClosed) return 'bg-emerald-500'
  if (isFinished) return 'bg-gray-400'
  if (isDraft) return 'bg-amber-500'
  return 'bg-blue-500'
}

// const stripCalendarResponse = (text = '') => {
//   const marker = `\n\n${CALENDAR_RESPONSE_MARKER}\n`
//   const markerIndex = text.indexOf(marker)
//   if (markerIndex === -1) return text.trim()
//   return text.slice(0, markerIndex).trim()
// }

const EventCard = ({
  eventId,
  style,
  event: eventProp,
  transactions: transactionsProp,
}) => {
  const { data: cachedEvent } = useEventQuery(eventId, eventProp)
  const event = eventProp ?? cachedEvent
  const { data: clients = [] } = useClientsQuery()
  const client = useMemo(
    () => clients.find((item) => item._id === event?.clientId) ?? null,
    [clients, event?.clientId]
  )
  const { data: cachedTransactions = [] } = useTransactionsQuery(undefined, {
    enabled: false,
  })
  const transactions = transactionsProp ?? cachedTransactions
  const services = useAtomValue(servicesAtom)
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const loading = useAtomValue(loadingAtom('event' + eventId))
  const error = useAtomValue(errorAtom('event' + eventId))
  const siteSettings = useAtomValue(siteSettingsAtom)

  const calendarLink = useMemo(() => {
    return getGoogleCalendarLinkFromText(event?.description)
  }, [event?.description])

  const eventTitle = useMemo(() => {
    const title =
      typeof event?.eventType === 'string' ? event.eventType.trim() : ''
    return title || 'Событие не указано'
  }, [event?.eventType])

  const servicesTitle = useMemo(() => {
    const servicesIds = event?.servicesIds ?? []
    if (!servicesIds.length) return 'Услуга не указана'
    const titles = services
      .filter((service) => servicesIds.includes(service._id))
      .map((service) => service.title)
      .filter(Boolean)
    return titles.length > 0 ? titles.join(', ') : 'Услуга не указана'
  }, [event?.servicesIds, services])

  const { contractSum, paid, leftToPay, status, expense, net, canClose } =
    useMemo(() => {
      if (!event)
        return {
          contractSum: 0,
          paid: 0,
          leftToPay: 0,
          expense: 0,
          net: 0,
          status: null,
          canClose: false,
        }

      const eventTransactions = transactions
        .filter((transaction) => transaction.eventId === event._id)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

      const totals = eventTransactions.reduce(
        (acc, transaction) => {
          if (transaction.type === 'income') acc.income += transaction.amount
          else acc.expense += transaction.amount
          return acc
        },
        { income: 0, expense: 0 }
      )

      const contractSumValue = Number(event.contractSum ?? 0)
      const paidValue = totals.income
      const leftToPayValue = Math.max(contractSumValue - paidValue, 0)
      const statusValue =
        EVENT_STATUSES_SIMPLE.find((item) => item.value === event.status) ??
        EVENT_STATUSES.find((item) => item.value === event.status)
      const hasTaxes = eventTransactions.some(
        (transaction) => transaction.category === 'taxes'
      )
      const canCloseValue =
        contractSumValue <= paidValue && (!event?.isByContract || hasTaxes)

      return {
        contractSum: contractSumValue,
        paid: paidValue,
        leftToPay: leftToPayValue,
        expense: totals.expense,
        net: totals.income - totals.expense,
        status: statusValue,
        canClose: canCloseValue,
      }
    }, [event, transactions])

  const eventStart = event?.eventDate ? new Date(event.eventDate) : null
  const eventEnd = event?.dateEnd ? new Date(event.dateEnd) : eventStart
  const now = new Date()
  const eventDateTimeLabel = formatCardDateTime(event?.eventDate)
  const createdDateTimeLabel = formatCardDateTime(
    event?.requestCreatedAt ?? event?.createdAt
  )
  const eventDateLabel =
    eventDateTimeLabel ??
    (createdDateTimeLabel ? `Создано: ${createdDateTimeLabel}` : '-')

  const rawStatus = status?.value ?? event.status
  const needsCheck = event?.calendarImportChecked === false
  const hasCalendarError = Boolean(event?.calendarSyncError)
  const isCanceled = rawStatus === 'canceled'
  const isClosed = rawStatus === 'closed'
  const isDraft = rawStatus === 'draft'
  const isActive = rawStatus === 'active'
  const isFinished =
    !isCanceled && !isClosed && eventEnd && eventEnd.getTime() < now.getTime()
  const statusMarkerClassName = getEventStatusMarkerClassName({
    isCanceled,
    isClosed,
    isDraft,
    isFinished,
  })
  const coordsLink =
    event?.address?.latitude && event?.address?.longitude
      ? `dgis://2gis.ru/geo/${event.address.longitude},${event.address.latitude}`
      : null
  const searchAddress =
    event?.address?.town && event?.address?.street && event?.address?.house
      ? `${event.address.town}, ${event.address.street}, ${event.address.house}`
      : null
  const searchLink = searchAddress
    ? `https://2gis.ru/search/${encodeURIComponent(searchAddress).replaceAll(
        '%20',
        ''
      )}`
    : null
  const mapLink = event?.address?.link2Gis || coordsLink || searchLink
  const displayAddress = useMemo(() => {
    const address = event?.address
    if (!address) return address
    const defaultTown = siteSettings?.defaultTown
    if (!defaultTown || !address?.town) return address
    const normalizedTown = String(address.town).trim().toLowerCase()
    const normalizedDefaultTown = String(defaultTown).trim().toLowerCase()
    if (normalizedTown !== normalizedDefaultTown) return address
    return { ...address, town: '' }
  }, [event?.address, siteSettings?.defaultTown])

  const hasSoonNoDepositWarning = useMemo(() => {
    if (!event?._id) return false
    const items = getSoonNoDepositEvents([event], transactions, new Date(), 3)
    return items.length > 0
  }, [event, transactions])

  const overdueAdditionalCount = useMemo(() => {
    if (!event?._id) return 0
    return getEventOverdueAdditionalCount(event, new Date())
  }, [event])

  const isCreatedViaApi = isEventCreatedViaPublicApi(event)
  const apiSourceLabel = getEventPublicApiSourceLabel(event)

  const nearestAdditionalEventInfo = useMemo(() => {
    const additionalEvents = Array.isArray(event?.additionalEvents)
      ? event.additionalEvents
      : []
    if (additionalEvents.length === 0) return null

    const nowDate = new Date()
    const prepared = additionalEvents
      .map((item) => {
        if (item?.done) return null
        const date = item?.date ? new Date(item.date) : null
        if (!date || Number.isNaN(date.getTime())) return null
        return {
          title: item?.title || 'Доп. событие',
          date,
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
    if (prepared.length === 0) return null

    const overdueItems = prepared.filter(
      (item) => item.date.getTime() < nowDate.getTime()
    )
    if (overdueItems.length > 0) {
      const overdue = overdueItems[overdueItems.length - 1]
      const timeLabel = overdue.date.toLocaleTimeString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
      })
      return {
        title: overdue.title,
        label: `${formatDate(overdue.date)} ${timeLabel}`,
        isToday: false,
        isTomorrow: false,
        isLater: false,
        isOverdue: true,
        totalCount: prepared.length,
        remainingCount: prepared.length - 1,
      }
    }

    const nearest = prepared.find(
      (item) => item.date.getTime() >= nowDate.getTime()
    )
    if (!nearest) return null

    const isToday =
      nearest.date.getFullYear() === nowDate.getFullYear() &&
      nearest.date.getMonth() === nowDate.getMonth() &&
      nearest.date.getDate() === nowDate.getDate()

    const tomorrow = new Date(nowDate)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const isTomorrow =
      nearest.date.getFullYear() === tomorrow.getFullYear() &&
      nearest.date.getMonth() === tomorrow.getMonth() &&
      nearest.date.getDate() === tomorrow.getDate()

    const timeLabel = nearest.date.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    })
    const prefix = isToday
      ? 'Сегодня'
      : isTomorrow
        ? 'Завтра'
        : formatDate(nearest.date)
    return {
      title: nearest.title,
      label: `${prefix} ${timeLabel}`,
      isToday,
      isTomorrow,
      isLater: !isToday && !isTomorrow,
      isOverdue: false,
      totalCount: prepared.length,
      remainingCount: prepared.length - 1,
    }
  }, [event?.additionalEvents])

  const hiddenAdditionalCount = hasSoonNoDepositWarning
    ? (nearestAdditionalEventInfo?.totalCount ?? 0)
    : (nearestAdditionalEventInfo?.remainingCount ?? 0)

  const getAdditionalStatusTone = () => {
    if (hasSoonNoDepositWarning || nearestAdditionalEventInfo?.isOverdue)
      return 'overdue'
    if (nearestAdditionalEventInfo?.isToday) return 'today'
    if (nearestAdditionalEventInfo?.isTomorrow) return 'tomorrow'
    if (nearestAdditionalEventInfo?.isLater) return 'upcoming'
    return 'neutral'
  }

  const additionalStatusTone = getAdditionalStatusTone()

  if (!event) return null

  return (
    <CardWrapper
      style={style}
      outerClassName="px-2 py-1"
      onClick={() => !loading && modalsFunc.event?.view(event._id)}
      className="event-card-shell card-body-pad laptop:flex-row laptop:items-start laptop:gap-4 flex h-[160px] cursor-pointer flex-col gap-x-3 gap-y-1 overflow-hidden rounded-lg py-3 pr-3 pl-4"
    >
      <CardOverlay loading={loading} error={error} />
      <div
        className={`absolute top-3 bottom-3 left-0 w-1 rounded-r-full ${statusMarkerClassName}`}
        aria-hidden="true"
      />
      <div className="flex w-full items-center justify-between gap-x-1">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {event.isTransferred && (
            <FontAwesomeIcon
              icon={faShare}
              className="h-4 w-4 text-amber-500"
              aria-label="Передано коллеге"
            />
          )}
          {needsCheck && (
            <FontAwesomeIcon
              icon={faTriangleExclamation}
              className="h-4 w-4 text-amber-500"
              aria-label="Проверка мероприятия не завершена"
            />
          )}
          {hasCalendarError && (
            <FontAwesomeIcon
              icon={faCalendarXmark}
              className="h-4 w-4 text-red-500"
              aria-label="Синхронизация с календарем не выполнена"
            />
          )}
          {isClosed && (
            <FontAwesomeIcon
              icon={faCircleCheck}
              className="h-4 w-4 text-green-600"
              aria-label="Мероприятие закрыто"
            />
          )}
          {isCanceled && (
            <FontAwesomeIcon
              icon={faBan}
              className="h-4 w-4 text-red-500"
              aria-label="Мероприятие отменено"
            />
          )}
          {isFinished && (
            <FontAwesomeIcon
              icon={faCircleCheck}
              className="h-4 w-4 text-gray-400"
              aria-label="Мероприятие завершено"
            />
          )}
          {isDraft && (
            <FontAwesomeIcon
              icon={faClock}
              className="h-4 w-4 text-gray-500"
              aria-label="Заявка"
            />
          )}
          {isActive && (
            <FontAwesomeIcon
              icon={faCircleCheck}
              className="h-4 w-4 text-blue-500"
              aria-label="Мероприятие"
            />
          )}
          {overdueAdditionalCount > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">
              {overdueAdditionalCount}
            </span>
          )}
          {!client && (
            <FontAwesomeIcon
              icon={faUserSlash}
              className="h-4 w-4 text-red-500"
              aria-label="Клиент не указан"
            />
          )}
          <div className="card-title tablet:text-lg mr-8 flex-1 truncate text-base">
            {[eventTitle, servicesTitle].join(' • ')}
          </div>
          <CardActions className="z-10 -mt-2 -mr-2">
            <CardButtons
              item={event}
              typeOfItem="event"
              minimalActions
              alwaysCompact
              compactTriggerClassName="event-card-menu-trigger h-10 min-h-10 w-10 rounded-full"
              calendarLink={calendarLink}
              onEdit={() => modalsFunc.event?.edit(event._id)}
              onEditClientContacts={() =>
                modalsFunc.event?.edit(event._id, {
                  initialTab: 'Клиент и Контакты',
                })
              }
              onEditFinanceDocs={() =>
                modalsFunc.event?.edit(event._id, {
                  initialTab: 'Финансы и Документы',
                })
              }
              showEditButton={!isClosed}
            />
          </CardActions>
        </div>
      </div>
      <div className="flex gap-x-1 py-0.5">
        <div className="card-meta flex min-w-0 flex-1 flex-col gap-0.5 pr-2 text-sm">
          <div className="card-title text-general">{eventDateLabel}</div>
          <div className="flex h-6 items-center gap-1 overflow-hidden">
            {hasSoonNoDepositWarning ? (
              <StatusChip tone="overdue">
                <span className="truncate">Просрочен задаток</span>
              </StatusChip>
            ) : nearestAdditionalEventInfo ? (
              <StatusChip tone={additionalStatusTone}>
                <span className="truncate">{`${nearestAdditionalEventInfo.title}: ${nearestAdditionalEventInfo.label}`}</span>
              </StatusChip>
            ) : null}
            {hiddenAdditionalCount > 0 ? (
              <StatusChip
                tone={additionalStatusTone}
                className="max-w-max shrink-0"
              >
                +{hiddenAdditionalCount}
              </StatusChip>
            ) : null}
          </div>
          <div className="flex h-[25px] flex-nowrap items-center gap-x-3">
            <span className="phoneH:block hidden font-medium">Место:</span>
            <span className="flex min-w-0 items-center gap-2 truncate">
              <span className="truncate">
                {formatAddress(displayAddress, '-')}
              </span>
              {mapLink && (
                <a
                  href={mapLink}
                  target="_blank"
                  rel="noreferrer"
                  title="Открыть в 2ГИС"
                  onClick={(event) => event.stopPropagation()}
                  className="flex h-7 w-7 items-center justify-center transition-transform hover:scale-110"
                >
                  <Image
                    src="/img/navigators/2gis.webp"
                    alt="2gis"
                    width={16}
                    height={16}
                    className="h-4 w-4"
                  />
                </a>
              )}
            </span>
          </div>
          <div className="flex min-h-[25px] flex-nowrap items-center gap-x-2">
            <span className="phoneH:block hidden font-medium">Клиент:</span>
            <span className="min-w-0 truncate">
              {client
                ? getPersonFullName(client, { fallback: client._id })
                : '-'}
            </span>
            {client && <ContactsIconsButtons user={client} showChat />}
            {isClosed || isCanceled ? (
              <div
                className={`event-profit-badge -mr-4 ml-auto flex min-w-[92px] shrink-0 items-center justify-center rounded-full border px-3 py-1.5 text-sm font-semibold ${
                  net === 0 ? 'event-profit-card--zero' : 'event-profit-card'
                }`}
              >
                <span
                  className={
                    net === 0 ? 'event-profit-text--zero' : 'event-profit-text'
                  }
                >
                  {net.toLocaleString()}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        {isClosed || isCanceled ? null : (
          <div className="laptop:min-w-[240px] laptop:self-start flex shrink-0 items-end">
            <div className="flex min-w-[112px] flex-col items-end justify-end gap-1 text-sm font-semibold">
              {isCreatedViaApi && (
                <StatusChip tone="neutral" className="max-w-max shrink-0">
                  {apiSourceLabel}
                </StatusChip>
              )}
              <div className="flex min-h-6 min-w-[112px] items-end justify-end gap-3 whitespace-nowrap">
                {paid > 0 && contractSum > 0 && paid >= contractSum ? (
                  <span className="text-green-700">
                    {paid.toLocaleString()}
                  </span>
                ) : (
                  <span>
                    {paid > 0 || contractSum > 0 ? (
                      <>
                        {paid > 0 ? (
                          <span className="text-green-700">
                            {paid.toLocaleString()}
                          </span>
                        ) : null}
                        {paid > 0 && contractSum > 0 ? ' / ' : null}
                        {contractSum > 0 ? (
                          <span className="text-blue-700">
                            {contractSum.toLocaleString()}
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </CardWrapper>
  )
}

export default EventCard
