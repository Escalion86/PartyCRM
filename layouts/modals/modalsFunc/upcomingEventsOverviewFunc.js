import AppButton from '@components/AppButton'
import DateTimeApplyControl from '@components/DateTimeApplyControl'
import ModalSection from '@components/ModalSection'
import QuickActionButtons from '@components/QuickActionButtons'
import StatusChip from '@components/StatusChip'
import formatDateTime from '@helpers/formatDateTime'
import {
  faCircleCheck,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  getAdditionalEventSegment,
  getAdditionalEventsListBySegments,
  getSoonNoDepositEvents,
  getUpcomingEventsByDays,
} from '@helpers/additionalEvents'
import { modalsFuncAtom } from '@state/atoms'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import { useAtomValue } from 'jotai'
import { useMemo, useState } from 'react'
import { useEventsQuery } from '@helpers/useEventsQuery'
import { useTransactionsQuery } from '@helpers/useTransactionsQuery'

const SEGMENT_META = {
  overdue: {
    title: 'Просрочено',
    emptyText: 'Просроченных доп. событий нет',
    tone: 'overdue',
  },
  today: {
    title: 'Сегодня',
    emptyText: 'На сегодня доп. событий нет',
    tone: 'today',
  },
  tomorrow: {
    title: 'Завтра',
    emptyText: 'На завтра доп. событий нет',
    tone: 'tomorrow',
  },
}

const normalizeText = (value, fallback = '') => {
  if (!value) return fallback
  return String(value).replace(/<[^>]+>/g, '').trim() || fallback
}

const parseDateSafe = (value) => {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const isSameDay = (a, b) => {
  const dateA = parseDateSafe(a)
  const dateB = parseDateSafe(b)
  if (!dateA || !dateB) return false
  return (
    dateA.getFullYear() === dateB.getFullYear() &&
    dateA.getMonth() === dateB.getMonth() &&
    dateA.getDate() === dateB.getDate()
  )
}

const toDateTimeLocalValue = (value) => {
  const date = parseDateSafe(value)
  if (!date) return ''
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

const upcomingEventsOverviewFunc = () => {
  const UpcomingEventsOverviewModal = ({ closeModal }) => {
    const { data: eventsPayload } = useEventsQuery({
      scope: 'upcoming',
      enabled: false,
    })
    const events = useMemo(() => eventsPayload?.data ?? [], [eventsPayload?.data])
    const { data: transactions = [] } = useTransactionsQuery(undefined, {
      enabled: false,
    })
    const modalsFunc = useAtomValue(modalsFuncAtom)
    const itemsFunc = useAtomValue(itemsFuncAtom)
    const [customDates, setCustomDates] = useState({})
    const [savingKey, setSavingKey] = useState('')

    const now = useMemo(() => new Date(), [])
    const segmentedAdditional = useMemo(
      () => getAdditionalEventsListBySegments(events, now),
      [events, now]
    )
    const overdueNoDepositEvents = useMemo(
      () => getSoonNoDepositEvents(events, transactions, now, 3),
      [events, transactions, now]
    )
    const upcomingEvents = useMemo(
      () => getUpcomingEventsByDays(events, 3, now),
      [events, now]
    )
    const segmentedItems = useMemo(() => {
      const withType = (items) =>
        (Array.isArray(items) ? items : []).map((item) => ({
          ...item,
          reminderType: 'additional',
        }))
      const overdueNoDepositItems = overdueNoDepositEvents.map((event) => ({
        eventId: event?._id,
        eventDate: event?.eventDate ?? null,
        eventStatus: event?.status ?? '',
        eventTown: event?.address?.town ?? '',
        eventDescription: event?.description ?? '',
        title: 'Просрочен задаток',
        description:
          Number(event?.depositExpectedAmount ?? 0) > 0
            ? `Ожидается: ${Number(event.depositExpectedAmount).toLocaleString('ru-RU')} ₽`
            : '',
        date: event?.depositDueAt ?? null,
        index: -1,
        reminderType: 'depositOverdue',
      }))

      const parseTime = (value) => {
        const date = parseDateSafe(value)
        return date ? date.getTime() : 0
      }

      const overdue = withType(segmentedAdditional.overdue)
        .concat(overdueNoDepositItems)
        .sort((a, b) => parseTime(a?.date) - parseTime(b?.date))

      const doneBySegment = {
        overdue: [],
        today: [],
        tomorrow: [],
      }
      ;(Array.isArray(events) ? events : []).forEach((event) => {
        ;(Array.isArray(event?.additionalEvents) ? event.additionalEvents : []).forEach(
          (item, index) => {
            if (!item?.done) return
            const segment = getAdditionalEventSegment(item?.date, now)
            if (!segment || !(segment in doneBySegment)) return
            if (segment === 'overdue' && !isSameDay(item?.doneAt, now)) return
            doneBySegment[segment].push({
              eventId: event?._id,
              eventDate: event?.eventDate ?? null,
              eventStatus: event?.status ?? '',
              eventTown: event?.address?.town ?? '',
              eventDescription: event?.description ?? '',
              title: item?.title ?? '',
              description: item?.description ?? '',
              date: item?.date ?? null,
              doneAt: item?.doneAt ?? null,
              index,
              done: true,
              reminderType: 'additional_done',
            })
          }
        )
      })

      Object.keys(doneBySegment).forEach((key) => {
        doneBySegment[key].sort((a, b) => parseTime(a?.date) - parseTime(b?.date))
      })

      return {
        overdue: overdue.concat(doneBySegment.overdue),
        today: withType(segmentedAdditional.today).concat(doneBySegment.today),
        tomorrow: withType(segmentedAdditional.tomorrow).concat(doneBySegment.tomorrow),
      }
    }, [events, now, overdueNoDepositEvents, segmentedAdditional])

    const openEvent = (eventId) => {
      closeModal?.()
      setTimeout(() => modalsFunc.event?.view(eventId), 150)
    }

    const updateAdditionalEventDate = async (eventId, additionalEventIndex, date) => {
      if (!eventId || !date) return
      const event = (events ?? []).find((item) => String(item?._id) === String(eventId))
      if (!event) return
      const additionalEvents = Array.isArray(event.additionalEvents)
        ? event.additionalEvents
        : []
      const nextAdditionalEvents = additionalEvents.map((item, idx) =>
        idx === additionalEventIndex ? { ...item, date: date.toISOString() } : item
      )
      const actionKey = `${eventId}-${additionalEventIndex}`
      try {
        setSavingKey(actionKey)
        await itemsFunc?.event?.set(
          {
            _id: event._id,
            additionalEvents: nextAdditionalEvents,
          },
          false,
          true
        )
      } finally {
        setSavingKey('')
      }
    }

    const shiftAdditionalEventDate = async (
      eventId,
      additionalEventIndex,
      days
    ) => {
      const source = segmentedAdditional.overdue
        .concat(segmentedAdditional.today)
        .concat(segmentedAdditional.tomorrow)
        .find(
          (item) =>
            String(item.eventId) === String(eventId) &&
            item.index === additionalEventIndex
        )
      const baseDate = parseDateSafe(source?.date) || new Date()
      const nextDate = new Date(baseDate)
      nextDate.setDate(nextDate.getDate() + days)
      await updateAdditionalEventDate(eventId, additionalEventIndex, nextDate)
    }

    const applyCustomDate = async (eventId, additionalEventIndex) => {
      const key = `${eventId}-${additionalEventIndex}`
      const rawValue = customDates[key]
      if (!rawValue) return
      const nextDate = parseDateSafe(rawValue)
      if (!nextDate) return
      await updateAdditionalEventDate(eventId, additionalEventIndex, nextDate)
    }

    const toggleAdditionalEventDone = async (eventId, additionalEventIndex) => {
      const event = (events ?? []).find((item) => String(item?._id) === String(eventId))
      if (!event) return
      const additionalEvents = Array.isArray(event.additionalEvents)
        ? event.additionalEvents
        : []
      const target = additionalEvents[additionalEventIndex]
      if (!target) return

      const nextAdditionalEvents = additionalEvents.map((item, idx) =>
        idx === additionalEventIndex
          ? {
              ...item,
              done: !Boolean(item?.done),
              doneAt: !Boolean(item?.done) ? new Date().toISOString() : null,
            }
          : item
      )
      const actionKey = `${eventId}-${additionalEventIndex}`
      try {
        setSavingKey(actionKey)
        await itemsFunc?.event?.set(
          {
            _id: event._id,
            additionalEvents: nextAdditionalEvents,
          },
          false,
          true
        )
      } finally {
        setSavingKey('')
      }
    }

    return (
      <div className="flex flex-col gap-3 pb-2">
        {Object.keys(SEGMENT_META).map((key) => {
          const meta = SEGMENT_META[key]
          const items = segmentedItems[key] ?? []
          return (
            <ModalSection
              key={key}
              title={meta.title}
              titleClassName="card-title"
              titleRight={<StatusChip tone={meta.tone}>{items.length}</StatusChip>}
            >
              {items.length === 0 ? (
                <div className="mt-2 text-sm text-gray-500">{meta.emptyText}</div>
              ) : (
                <div className="mt-2 flex flex-col gap-2">
                  {items.slice(0, 12).map((item, idx) => (
                    <div
                      key={`${item.eventId}-${item.index}-${idx}`}
                      className="rounded border border-gray-200 px-3 py-2"
                    >
                      <div className="flex items-start gap-2">
                        {item.reminderType === 'additional' ? (
                          <button
                            type="button"
                            onClick={() =>
                              toggleAdditionalEventDone(item.eventId, item.index)
                            }
                            title={
                              item?.done
                                ? 'Отметить как не выполнено'
                                : 'Отметить как выполнено'
                            }
                            aria-label={
                              item?.done
                                ? 'Отметить как не выполнено'
                                : 'Отметить как выполнено'
                            }
                            disabled={savingKey === `${item.eventId}-${item.index}`}
                            className={`mt-0.5 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border transition ${
                              item?.done || item.reminderType === 'additional_done'
                                ? 'border-emerald-500 bg-emerald-500 text-white'
                                : 'border-gray-300 bg-white text-gray-400 hover:border-emerald-400 hover:text-emerald-500'
                            } ${
                              savingKey === `${item.eventId}-${item.index}`
                                ? 'cursor-not-allowed opacity-60'
                                : ''
                            }`}
                          >
                            <FontAwesomeIcon icon={faCircleCheck} />
                          </button>
                        ) : item.reminderType === 'additional_done' ? (
                          <button
                            type="button"
                            onClick={() =>
                              toggleAdditionalEventDone(item.eventId, item.index)
                            }
                            title="Снять отметку выполнения"
                            aria-label="Снять отметку выполнения"
                            disabled={savingKey === `${item.eventId}-${item.index}`}
                            className={`mt-0.5 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border border-emerald-500 bg-emerald-500 text-white transition ${
                              savingKey === `${item.eventId}-${item.index}`
                                ? 'cursor-not-allowed opacity-60'
                                : ''
                            }`}
                          >
                            <FontAwesomeIcon icon={faCircleCheck} />
                          </button>
                        ) : null}
                        <div className="min-w-0 flex-1">
                          {item.reminderType === 'additional_done' ? (
                            <div className="mb-0.5 text-[11px] font-semibold text-emerald-600">
                              Выполнено:{' '}
                              {item.doneAt
                                ? formatDateTime(item.doneAt, true, false, true, false)
                                : 'время не указано'}
                            </div>
                          ) : null}
                          <div className="text-sm font-semibold text-gray-900">
                            {normalizeText(item.title, 'Доп. событие')}
                          </div>
                          <div className="text-xs text-gray-600">
                            {item.date
                              ? formatDateTime(item.date, true, false, true, false)
                              : 'Дата не указана'}
                          </div>
                          {item?.description ? (
                            <div className="text-xs text-gray-600">
                              {normalizeText(item.description)}
                            </div>
                          ) : null}
                          {item.eventTown ? (
                            <div className="mt-1 text-xs text-gray-500">
                              {item.eventTown}
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <QuickActionButtons
                        wrapperClassName="mt-2"
                        actions={[
                          {
                            key: 'open-event',
                            label: 'Открыть мероприятие',
                            variant: 'secondary',
                            className: 'w-full tablet:w-auto',
                            onClick: () => openEvent(item.eventId),
                          },
                        ]}
                      />
                      {item.reminderType === 'additional' ? (
                        <div className="mt-2 grid grid-cols-2 items-center gap-2 tablet:flex tablet:flex-wrap">
                          <QuickActionButtons
                            wrapperClassName="col-span-2"
                            actions={[
                              {
                                key: 'plus-1-day',
                                label: '+1 день',
                                variant: 'secondary',
                                className: 'w-full tablet:w-auto',
                                disabled:
                                  savingKey === `${item.eventId}-${item.index}`,
                                onClick: () =>
                                  shiftAdditionalEventDate(
                                    item.eventId,
                                    item.index,
                                    1
                                  ),
                              },
                              {
                                key: 'plus-3-day',
                                label: '+3 дня',
                                variant: 'secondary',
                                className: 'w-full tablet:w-auto',
                                disabled:
                                  savingKey === `${item.eventId}-${item.index}`,
                                onClick: () =>
                                  shiftAdditionalEventDate(
                                    item.eventId,
                                    item.index,
                                    3
                                  ),
                              },
                            ]}
                          />
                          <DateTimeApplyControl
                            value={
                              customDates[`${item.eventId}-${item.index}`] ??
                              toDateTimeLocalValue(item.date)
                            }
                            onChange={(value) =>
                              setCustomDates((prev) => ({
                                ...prev,
                                [`${item.eventId}-${item.index}`]: value,
                              }))
                            }
                            disabled={savingKey === `${item.eventId}-${item.index}`}
                            onClick={() => applyCustomDate(item.eventId, item.index)}
                          />
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </ModalSection>
          )
        })}

        <ModalSection
          title="Мероприятия на 3 дня"
          titleClassName="card-title"
          titleRight={<StatusChip tone="upcoming">{upcomingEvents.length}</StatusChip>}
        >
          {upcomingEvents.length === 0 ? (
            <div className="mt-2 text-sm text-gray-500">
              В ближайшие 3 дня мероприятий нет
            </div>
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              {upcomingEvents.slice(0, 12).map((event) => (
                <div
                  key={event._id}
                  className="rounded border border-gray-200 px-3 py-2"
                >
                  <div className="text-sm font-semibold text-gray-900">
                    {event?.eventDate
                      ? formatDateTime(event.eventDate, true, false, true, false)
                      : 'Дата не указана'}
                  </div>
                  <div className="text-xs text-gray-600">
                    {event?.address?.town ? `${event.address.town} • ` : ''}
                    {event?.status === 'draft'
                      ? 'Заявка'
                      : event?.status === 'closed'
                        ? 'Закрыто'
                        : event?.status === 'canceled'
                          ? 'Отменено'
                          : 'Активно'}
                  </div>
                  <div className="text-xs text-gray-600">
                    {normalizeText(event?.description, 'Описание не указано')}
                  </div>
                  <QuickActionButtons
                    wrapperClassName="mt-2"
                    actions={[
                      {
                        key: 'open-event',
                        label: 'Открыть мероприятие',
                        variant: 'secondary',
                        className: 'w-full tablet:w-auto',
                        onClick: () => openEvent(event._id),
                      },
                    ]}
                  />
                </div>
              ))}
            </div>
          )}
        </ModalSection>
      </div>
    )
  }

  return {
    title: 'Ближайшие события',
    confirmButtonName: 'Закрыть',
    showDecline: false,
    onConfirm: true,
    Children: UpcomingEventsOverviewModal,
  }
}

export default upcomingEventsOverviewFunc
