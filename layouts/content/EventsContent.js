'use client'

import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { List, useListRef } from 'react-window'
import CalendarMonthIcon from '@mui/icons-material/CalendarMonth'
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft'
import ChevronRightIcon from '@mui/icons-material/ChevronRight'
import EventAvailableIcon from '@mui/icons-material/EventAvailable'
import FilterAltIcon from '@mui/icons-material/FilterAlt'
import MicIcon from '@mui/icons-material/Mic'
import NoteAddIcon from '@mui/icons-material/NoteAdd'
import ViewListIcon from '@mui/icons-material/ViewList'
import ContentHeader from '@components/ContentHeader'
import AddIconButton from '@components/AddIconButton'
import ComboBox from '@components/ComboBox'
import DropDown from '@components/DropDown'
import EmptyState from '@components/EmptyState'
import CabinetFilterChip from '@components/CabinetFilterChip'
import HeaderActions from '@components/HeaderActions'
import MutedText from '@components/MutedText'
import SectionCard from '@components/SectionCard'
import VoiceDraftOverlay from '@components/VoiceDraftOverlay'
// import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom, modalsAtom } from '@state/atoms'
import EventCard from '@layouts/cards/EventCard'
import { useSearchParams, useRouter, usePathname } from 'next/navigation'
import {
  getAdditionalEventsListBySegments,
  eventHasAdditionalSegment,
  getAdditionalEventsSummary,
  getInAppReminderSummary,
  getUpcomingEventsByDays,
  getSoonNoDepositEvents,
} from '@helpers/additionalEvents'
import AppButton from '@components/AppButton'
import useUiDensity from '@helpers/useUiDensity'
import { getData } from '@helpers/CRUD'
import { DAYS_OF_WEEK } from '@helpers/constants'
import { isEventCreatedViaPublicApi } from '@helpers/eventSource'
import {
  useEventsQuery,
  useLoadMorePastEventsMutation,
} from '@helpers/useEventsQuery'
import { useTransactionsQuery } from '@helpers/useTransactionsQuery'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'

const getStatusFilterDefaults = (filter) => {
  if (filter === 'upcoming') {
    return {
      request: true,
      active: true,
      canceled: false,
    }
  }
  if (filter === 'past') {
    return {
      finished: true,
      closed: true,
      canceled: false,
    }
  }
  return {
    request: true,
    active: true,
    finished: true,
    closed: true,
    canceled: false,
  }
}

const getStatusFilterKeys = (filter) => {
  if (filter === 'upcoming') return ['request', 'active', 'canceled']
  if (filter === 'past') return ['finished', 'closed', 'canceled']
  return ['request', 'active', 'finished', 'closed', 'canceled']
}

const STATUS_FILTER_META = {
  request: {
    label: 'Заявки',
    selectedClass: 'border-gray-600 bg-gray-700 text-white',
    idleClass: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
    dotClass: 'bg-gray-500',
  },
  active: {
    label: 'Мероприятия',
    selectedClass: 'border-blue-600 bg-blue-600 text-white',
    idleClass: 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50',
    dotClass: 'bg-blue-600',
  },
  finished: {
    label: 'Завершены',
    selectedClass: 'border-emerald-600 bg-emerald-600 text-white',
    idleClass:
      'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50',
    dotClass: 'bg-emerald-600',
  },
  closed: {
    label: 'Закрыты',
    selectedClass: 'border-sky-600 bg-sky-600 text-white',
    idleClass: 'border-sky-200 bg-white text-sky-700 hover:bg-sky-50',
    dotClass: 'bg-sky-600',
  },
  canceled: {
    label: 'Отменены',
    selectedClass: 'border-red-600 bg-red-600 text-white',
    idleClass: 'border-red-200 bg-white text-red-700 hover:bg-red-50',
    dotClass: 'bg-red-600',
  },
}

const CHECK_FILTER_META = {
  checked: {
    label: 'Проверенные',
    selectedClass: 'border-emerald-600 bg-emerald-600 text-white',
    idleClass:
      'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50',
    dotClass: 'bg-emerald-600',
  },
  unchecked: {
    label: 'Не проверенные',
    selectedClass: 'border-amber-500 bg-amber-500 text-white',
    idleClass: 'border-amber-200 bg-white text-amber-700 hover:bg-amber-50',
    dotClass: 'bg-amber-500',
  },
}

const PAST_QUICK_FILTERS = [
  {
    key: 'needsClose',
    label: 'Нужно закрыть',
    statusFilter: { finished: true, closed: false, canceled: false },
  },
  {
    key: 'closed',
    label: 'Закрытые',
    statusFilter: { finished: false, closed: true, canceled: false },
  },
  {
    key: 'canceled',
    label: 'Отмененные',
    statusFilter: { finished: false, closed: false, canceled: true },
  },
]

const AddEventMenu = ({
  disabled,
  allowVoice,
  onCreateRequest,
  onCreateEvent,
  onVoice,
}) => {
  if (disabled) {
    return (
      <AddIconButton
        disabled
        title="Добавить мероприятие"
        size="sm"
        variant="neutral"
      />
    )
  }

  const menuItems = [
    {
      label: 'Заявка',
      icon: <NoteAddIcon fontSize="small" />,
      onClick: onCreateRequest,
    },
    {
      label: 'Мероприятие',
      icon: <EventAvailableIcon fontSize="small" />,
      onClick: onCreateEvent,
    },
  ]

  if (allowVoice) {
    menuItems.push({
      label: 'Голосом',
      icon: <MicIcon fontSize="small" />,
      onClick: onVoice,
    })
  }

  return (
    <DropDown
      trigger={
        <AddIconButton
          title="Добавить"
          size="sm"
          variant="neutral"
        />
      }
      placement="right"
      menuPadding="sm"
      menuClassName="min-w-44 flex-col items-stretch !border-gray-200 !bg-white"
      renderInPortal
    >
      {menuItems.map((item) => (
        <button
          key={item.label}
          type="button"
          className="flex w-full cursor-pointer items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium !text-gray-900 transition-colors hover:bg-gray-100 focus-visible:bg-gray-100 focus-visible:outline-none"
          onClick={item.onClick}
          role="menuitem"
        >
          <span className="flex h-5 w-5 items-center justify-center !text-gray-500">
            {item.icon}
          </span>
          {item.label}
        </button>
      ))}
    </DropDown>
  )
}

const getMonthItemToneClassName = (item) => {
  if (item.type === 'event') {
    if (item.status === 'canceled') {
      return 'border-red-200 bg-red-50 text-red-700'
    }
    if (item.status === 'draft') {
      return 'border-gray-200 bg-gray-100 text-gray-700'
    }
    if (item.status === 'closed') {
      return 'border-emerald-200 bg-emerald-50 text-emerald-700'
    }
    return 'border-blue-200 bg-blue-50 text-blue-700'
  }

  if (item.done) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 line-through'
  }

  return 'border-amber-200 bg-amber-50 text-amber-700'
}

const EventStatusFilterChips = ({ value, onChange, mode = 'all' }) => {
  const keys = getStatusFilterKeys(mode)

  const handleToggle = (key) => {
    const next = { ...value, [key]: !value[key] }
    const hasAnySelected = keys.some((statusKey) => Boolean(next[statusKey]))
    if (!hasAnySelected) next[key] = true
    onChange(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {keys.map((key) => {
        const meta = STATUS_FILTER_META[key]
        return (
          <CabinetFilterChip
            key={key}
            active={Boolean(value[key])}
            label={meta.label}
            selectedClassName={meta.selectedClass}
            idleClassName={meta.idleClass}
            dotClassName={meta.dotClass}
            onClick={() => handleToggle(key)}
          />
        )
      })}
    </div>
  )
}

const EventCheckFilterChips = ({ value, onChange }) => {
  const keys = ['checked', 'unchecked']

  const handleToggle = (key) => {
    const next = { ...value, [key]: !value[key] }
    if (!next.checked && !next.unchecked) {
      const fallbackKey = key === 'checked' ? 'unchecked' : 'checked'
      next[fallbackKey] = true
    }
    onChange(next)
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {keys.map((key) => {
        const meta = CHECK_FILTER_META[key]
        return (
          <CabinetFilterChip
            key={key}
            active={Boolean(value[key])}
            label={meta.label}
            selectedClassName={meta.selectedClass}
            idleClassName={meta.idleClass}
            dotClassName={meta.dotClass}
            onClick={() => handleToggle(key)}
          />
        )
      })}
    </div>
  )
}

const parseBooleanSearchParam = (value) => {
  if (value === '1' || value === 'true') return true
  if (value === '0' || value === 'false') return false
  return null
}

const getEventCompletionTime = (event) => {
  const raw = event?.dateEnd ?? event?.eventDate ?? null
  if (!raw) return null
  const time = new Date(raw).getTime()
  return Number.isNaN(time) ? null : time
}

const getEventStatusFlags = (event, now) => {
  const status = event?.status
  const isRequest = status === 'draft'
  const isCanceled = status === 'canceled'
  const isClosed = status === 'closed'
  const rawEnd = event?.dateEnd ?? event?.eventDate ?? null
  const endDate = rawEnd ? new Date(rawEnd) : null
  const isFinished =
    !isRequest &&
    !isCanceled &&
    !isClosed &&
    endDate instanceof Date &&
    !Number.isNaN(endDate.getTime()) &&
    endDate.getTime() < now.getTime()
  const isActive = !isRequest && !isCanceled && !isClosed && !isFinished

  return {
    request: isRequest,
    active: isActive,
    finished: isFinished,
    closed: isClosed,
    canceled: isCanceled,
  }
}

const MONTH_VIEW_DAY_CELLS = 42

const toMonthStart = (value = new Date()) =>
  new Date(value.getFullYear(), value.getMonth(), 1)

const toDateKey = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const toMinuteOfDay = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 0
  return date.getHours() * 60 + date.getMinutes()
}

const getValidDateTime = (value) => {
  if (!value) return null
  const time = new Date(value).getTime()
  return Number.isNaN(time) ? null : time
}

const EventsContent = ({ filter = 'all', eventsPaging = null }) => {
  const { isCompact } = useUiDensity()
  const eventsScope =
    filter === 'upcoming' ? 'upcoming' : filter === 'past' ? 'past' : 'all'
  const { data: eventsPayload } = useEventsQuery({
    scope: eventsScope,
    initialMeta: eventsPaging ?? {},
  })
  const events = useMemo(
    () => (Array.isArray(eventsPayload?.data) ? eventsPayload.data : []),
    [eventsPayload?.data]
  )
  const loadMorePastEventsMutation = useLoadMorePastEventsMutation()
  const { data: transactions = [] } = useTransactionsQuery(undefined, {
    enabled: false,
  })
  // const siteSettings = useAtomValue(siteSettingsAtom)
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const modals = useAtomValue(modalsAtom)
  const loggedUser = useAtomValue(loggedUserAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const tariffAccess = useMemo(
    () => getUserTariffAccess(loggedUser, tariffs),
    [loggedUser, tariffs]
  )
  const allowVoiceDraft = Boolean(tariffAccess?.allowAi)
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const listRef = useListRef()
  const openHandledRef = useRef(false)
  const monthAutoPositionedRef = useRef(false)
  const [selectedTown, setSelectedTown] = useState('')
  const [pendingOpenId, setPendingOpenId] = useState(null)
  const [viewMode, setViewMode] = useState('list')
  const [monthCursor, setMonthCursor] = useState(() => toMonthStart(new Date()))
  const [checkFilter, setCheckFilter] = useState({
    checked: true,
    unchecked: true,
  })
  const [statusFilter, setStatusFilter] = useState(() =>
    getStatusFilterDefaults(filter)
  )
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [additionalQuickFilter, setAdditionalQuickFilter] = useState('')
  const [voiceDraftOpen, setVoiceDraftOpen] = useState(false)
  const [pastHasMore, setPastHasMore] = useState(false)
  const [pastNextBefore, setPastNextBefore] = useState(null)
  const [pastLoadingMore, setPastLoadingMore] = useState(false)
  const [pastTotalCount, setPastTotalCount] = useState(0)
  const [serverFilteredCount, setServerFilteredCount] = useState(null)
  const [pastActiveClosableCount, setPastActiveClosableCount] = useState(0)
  const reminderShownRef = useRef(false)
  const noDepositReminderShownRef = useRef(false)
  const statusFilterKeys = useMemo(() => getStatusFilterKeys(filter), [filter])
  const itemHeight = isCompact ? 152 : 170

  useEffect(() => {
    if (filter !== 'past') {
      setPastHasMore(false)
      setPastNextBefore(null)
      setPastLoadingMore(false)
      setPastTotalCount(0)
      setServerFilteredCount(null)
      return
    }
    setPastHasMore(Boolean(eventsPaging?.hasMore))
    setPastNextBefore(eventsPaging?.nextBefore || null)
    setPastTotalCount(Number(eventsPaging?.totalCount || 0))
  }, [
    eventsPaging?.hasMore,
    eventsPaging?.nextBefore,
    eventsPaging?.totalCount,
    filter,
  ])

  const baseEvents = useMemo(() => {
    if (filter === 'all') return events

    const nowTime = Date.now()

    return events.filter((event) => {
      const completionTime = getEventCompletionTime(event)
      if (completionTime === null) return filter === 'upcoming'
      return filter === 'upcoming'
        ? completionTime >= nowTime
        : completionTime < nowTime
    })
  }, [events, filter])

  const townsOptions = useMemo(() => {
    const townsSet = new Set()
    baseEvents.forEach((event) => {
      const town = event?.address?.town
      if (typeof town === 'string' && town.trim()) townsSet.add(town.trim())
    })
    return Array.from(townsSet).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [baseEvents])

  const filteredEvents = useMemo(() => {
    if (!selectedTown) return baseEvents
    return baseEvents.filter(
      (event) => (event?.address?.town ?? '') === selectedTown
    )
  }, [selectedTown, baseEvents])

  const hasUncheckedEvents = useMemo(
    () => filteredEvents.some((event) => !event?.calendarImportChecked),
    [filteredEvents]
  )

  useEffect(() => {
    if (!selectedTown) return
    if (townsOptions.includes(selectedTown)) return
    setSelectedTown('')
  }, [selectedTown, townsOptions])

  useEffect(() => {
    if (modals.length === 0) {
      openHandledRef.current = false
    }
  }, [modals.length])

  useEffect(() => {
    setStatusFilter(getStatusFilterDefaults(filter))
    setAdditionalQuickFilter('')
  }, [filter])

  useEffect(() => {
    if (filter !== 'past') return

    const finishedParam = parseBooleanSearchParam(
      searchParams?.get('statusFinished')
    )
    const closedParam = parseBooleanSearchParam(
      searchParams?.get('statusClosed')
    )
    const canceledParam = parseBooleanSearchParam(
      searchParams?.get('statusCanceled')
    )

    if (
      finishedParam === null &&
      closedParam === null &&
      canceledParam === null
    ) {
      return
    }

    setStatusFilter({
      finished:
        finishedParam === null
          ? getStatusFilterDefaults('past').finished
          : finishedParam,
      closed:
        closedParam === null
          ? getStatusFilterDefaults('past').closed
          : closedParam,
      canceled:
        canceledParam === null
          ? getStatusFilterDefaults('past').canceled
          : canceledParam,
    })
  }, [filter, searchParams])

  const filteredByCheck = useMemo(() => {
    if (checkFilter.checked && checkFilter.unchecked) return filteredEvents
    if (checkFilter.checked)
      return filteredEvents.filter((event) => event?.calendarImportChecked)
    if (checkFilter.unchecked)
      return filteredEvents.filter((event) => !event?.calendarImportChecked)
    return filteredEvents
  }, [checkFilter, filteredEvents])

  const filteredByStatus = useMemo(() => {
    const allSelected = statusFilterKeys.every((key) =>
      Boolean(statusFilter[key])
    )
    if (allSelected) return filteredByCheck

    const now = new Date()
    return filteredByCheck.filter((event) => {
      const flags = getEventStatusFlags(event, now)
      return statusFilterKeys.some(
        (key) => Boolean(statusFilter[key]) && Boolean(flags[key])
      )
    })
  }, [filteredByCheck, statusFilter, statusFilterKeys])

  const additionalSummary = useMemo(
    () => getAdditionalEventsSummary(filteredByStatus),
    [filteredByStatus]
  )
  const inAppReminderSummary = useMemo(
    () => getInAppReminderSummary(filteredByStatus),
    [filteredByStatus]
  )
  const soonNoDepositEvents = useMemo(
    () => getSoonNoDepositEvents(filteredByStatus, transactions, new Date(), 3),
    [filteredByStatus, transactions]
  )
  const upcomingOverviewBadges = useMemo(() => {
    const now = new Date()
    const segmentedAdditional = getAdditionalEventsListBySegments(events, now)
    const overdueNoDepositCount = getSoonNoDepositEvents(
      events,
      transactions,
      now,
      3
    ).length
    const upcomingEvents3Days = getUpcomingEventsByDays(events, 3, now)

    return [
      {
        key: 'overdue',
        title: 'Просрочено',
        value:
          Number(segmentedAdditional?.overdue?.length || 0) +
          Number(overdueNoDepositCount || 0),
        className: 'bg-red-600 text-white',
      },
      {
        key: 'today',
        title: 'Сегодня',
        value: Number(segmentedAdditional?.today?.length || 0),
        className: 'bg-amber-500 text-white',
      },
      {
        key: 'tomorrow',
        title: 'Завтра',
        value: Number(segmentedAdditional?.tomorrow?.length || 0),
        className: 'bg-blue-600 text-white',
      },
      {
        key: 'upcoming3days',
        title: 'Мероприятия на 3 дня',
        value: Number(upcomingEvents3Days?.length || 0),
        className: 'bg-emerald-600 text-white',
      },
    ].filter((item) => item.value > 0)
  }, [events, transactions])

  const filteredByAdditionalQuick = useMemo(() => {
    if (!additionalQuickFilter) return filteredByStatus
    const now = new Date()
    return filteredByStatus.filter((event) =>
      eventHasAdditionalSegment(event, additionalQuickFilter, now)
    )
  }, [additionalQuickFilter, filteredByStatus])

  const sortedEvents = useMemo(() => {
    if (filter === 'upcoming') {
      return [...filteredByAdditionalQuick].sort((a, b) => {
        const aEventDate = getValidDateTime(a?.eventDate)
        const bEventDate = getValidDateTime(b?.eventDate)
        const aNoDate = aEventDate === null
        const bNoDate = bEventDate === null
        const aApiNoDate = aNoDate && isEventCreatedViaPublicApi(a)
        const bApiNoDate = bNoDate && isEventCreatedViaPublicApi(b)

        if (aApiNoDate !== bApiNoDate) return aApiNoDate ? -1 : 1
        if (aNoDate !== bNoDate) return aNoDate ? 1 : -1

        if (!aNoDate && !bNoDate && aEventDate !== bEventDate) {
          return aEventDate - bEventDate
        }

        const aRequestCreatedAt = getValidDateTime(a?.requestCreatedAt) ?? 0
        const bRequestCreatedAt = getValidDateTime(b?.requestCreatedAt) ?? 0
        return bRequestCreatedAt - aRequestCreatedAt
      })
    }

    const sorter = (a, b) => {
      const dateA = a.eventDate ? new Date(a.eventDate).getTime() : 0
      const dateB = b.eventDate ? new Date(b.eventDate).getTime() : 0
      return dateB - dateA
    }
    return [...filteredByAdditionalQuick].sort(sorter)
  }, [filteredByAdditionalQuick, filter])

  useEffect(() => {
    const urlTargetId = searchParams?.get('openEvent')
    const urlTab = searchParams?.get('openTab') || null
    const urlAction = searchParams?.get('openAction') || null
    const urlDate = searchParams?.get('openDate') || null

    if (!urlTargetId && !pendingOpenId && typeof window !== 'undefined') {
      const storedId = window.sessionStorage.getItem('openEvent')
      if (storedId) {
        const storedAt = Number(
          window.sessionStorage.getItem('openEventAt') || 0
        )
        if (!storedAt || Date.now() - storedAt < 2 * 60 * 1000) {
          setPendingOpenId(storedId)
        }
        window.sessionStorage.removeItem('openEvent')
        window.sessionStorage.removeItem('openEventAt')
        window.sessionStorage.removeItem('openEventPage')
      }
    }

    const targetId = urlTargetId || pendingOpenId
    if (!targetId) return
    let isActive = true
    let attempts = 0

    const scheduleRetry = () => {
      if (!isActive) return
      if (attempts >= 10) return
      attempts += 1
      setTimeout(tryOpen, 250)
    }

    const tryOpen = () => {
      if (!isActive) return
      if (openHandledRef.current) return
      if (!modalsFunc.event?.view) return scheduleRetry()
      if (!events || events.length === 0) return scheduleRetry()

      const indexInAll = events.findIndex(
        (item) => String(item?._id) === String(targetId)
      )
      if (indexInAll === -1) return scheduleRetry()

      const event = events[indexInAll]
      const completionTime = getEventCompletionTime(event)
      const nowTime = Date.now()
      const shouldBeUpcoming =
        completionTime === null || completionTime >= nowTime
      const expectedPage = shouldBeUpcoming ? 'eventsUpcoming' : 'eventsPast'

      if (
        filter !== 'all' &&
        expectedPage !==
          (filter === 'upcoming' ? 'eventsUpcoming' : 'eventsPast')
      ) {
        // Store deep link params for cross-page navigation
        const params = new URLSearchParams()
        params.set('openEvent', targetId)
        if (urlTab) params.set('openTab', urlTab)
        if (urlAction) params.set('openAction', urlAction)
        if (urlDate) params.set('openDate', urlDate)
        router.replace(`/cabinet/${expectedPage}?${params.toString()}`)
        return
      }

      const eventTown = event?.address?.town ?? ''
      if (selectedTown && eventTown !== selectedTown) {
        setSelectedTown(eventTown)
        return
      }

      if (!checkFilter.checked || !checkFilter.unchecked) {
        const isChecked = !!event?.calendarImportChecked
        const isVisible =
          (isChecked && checkFilter.checked) ||
          (!isChecked && checkFilter.unchecked)
        if (!isVisible) {
          setCheckFilter({ checked: true, unchecked: true })
          return
        }
      }

      const allStatusSelected = statusFilterKeys.every((key) =>
        Boolean(statusFilter[key])
      )
      if (!allStatusSelected) {
        const now = new Date()
        const flags = getEventStatusFlags(event, now)
        const isVisible = statusFilterKeys.some(
          (key) => Boolean(statusFilter[key]) && Boolean(flags[key])
        )
        if (!isVisible) {
          setStatusFilter(getStatusFilterDefaults(filter))
          return
        }
      }

      const index = sortedEvents.findIndex(
        (item) => String(item?._id) === String(targetId)
      )
      if (index === -1) return scheduleRetry()

      let scrollAttempts = 0
      const tryScroll = () => {
        if (!isActive) return
        if (listRef.current?.scrollToRow) {
          listRef.current.scrollToRow({ index, align: 'center' })
        } else if (scrollAttempts < 6) {
          scrollAttempts += 1
          setTimeout(tryScroll, 100)
        }
      }
      tryScroll()

      setTimeout(() => {
        if (!isActive) return
        const viewOptions = {}
        if (urlTab) viewOptions.tab = urlTab
        if (urlAction) viewOptions.action = urlAction
        if (urlDate) viewOptions.date = urlDate
        modalsFunc.event?.view(targetId, Object.keys(viewOptions).length > 0 ? viewOptions : undefined)
        openHandledRef.current = true
        if (pendingOpenId) setPendingOpenId(null)
        if (pathname) router.replace(pathname, { scroll: false })
      }, 200)
    }

    tryOpen()
    return () => {
      isActive = false
    }
  }, [
    checkFilter.checked,
    checkFilter.unchecked,
    events,
    filter,
    modalsFunc.event,
    pathname,
    listRef,
    router,
    searchParams,
    selectedTown,
    sortedEvents,
    pendingOpenId,
    statusFilter,
    statusFilterKeys,
  ])

  useEffect(() => {
    if (filter !== 'upcoming') return
    if (typeof window === 'undefined') return
    if (modals.length > 0) return
    if (inAppReminderSummary.total <= 0) return
    if (reminderShownRef.current) return

    const dateKey = new Date().toISOString().slice(0, 10)
    const storageKey = `inAppReminderShown:${dateKey}`
    const signature = [
      inAppReminderSummary.overdue,
      inAppReminderSummary.today,
      inAppReminderSummary.soon2h,
    ].join(':')
    const savedSignature = window.localStorage.getItem(storageKey)
    if (savedSignature === signature) return

    reminderShownRef.current = true
    window.localStorage.setItem(storageKey, signature)

    modalsFunc.event?.upcomingOverview?.()
  }, [filter, inAppReminderSummary, modals.length, modalsFunc])

  useEffect(() => {
    if (filter !== 'upcoming') return
    if (typeof window === 'undefined') return
    if (modals.length > 0) return
    if (soonNoDepositEvents.length <= 0) return
    if (noDepositReminderShownRef.current) return

    const dateKey = new Date().toISOString().slice(0, 10)
    const storageKey = `noDepositReminderShown:${dateKey}`
    const signature = soonNoDepositEvents
      .slice(0, 8)
      .map((item) => String(item?._id))
      .join(',')
    const savedSignature = window.localStorage.getItem(storageKey)
    if (savedSignature === signature) return

    noDepositReminderShownRef.current = true
    window.localStorage.setItem(storageKey, signature)

    modalsFunc.add({
      title: 'Просрочено ожидание задатка',
      text: `Мероприятий с просроченным ожиданием задатка: ${soonNoDepositEvents.length}`,
      confirmButtonName: 'Открыть ближайшие события',
      declineButtonName: 'Позже',
      showDecline: true,
      onConfirm: () => modalsFunc.event?.upcomingOverview?.(),
    })
  }, [filter, modals.length, modalsFunc, soonNoDepositEvents])

  useEffect(() => {
    if (filter !== 'upcoming') return

    let isActive = true

    ;(async () => {
      try {
        const response = await getData(
          '/api/events?scope=past&countOnly=1&statusFinished=true&statusClosed=false&statusCanceled=false',
          null,
          null,
          null,
          true
        )
        const totalCount = Number(response?.meta?.totalCount)
        if (!isActive) return
        setPastActiveClosableCount(Number.isFinite(totalCount) ? totalCount : 0)
      } catch (error) {
        if (!isActive) return
        setPastActiveClosableCount(0)
      }
    })()

    return () => {
      isActive = false
    }
  }, [filter])

  const filterName =
    filter === 'upcoming'
      ? 'Предстоящие'
      : filter === 'past'
        ? 'Прошедшие'
        : 'Все'

  const isDefaultPastFilters =
    filter === 'past' &&
    !selectedTown &&
    !additionalQuickFilter &&
    checkFilter.checked &&
    checkFilter.unchecked &&
    statusFilter.finished === true &&
    statusFilter.closed === true &&
    statusFilter.canceled === false

  useEffect(() => {
    if (filter !== 'past') return

    if (!pastHasMore) {
      setServerFilteredCount(sortedEvents.length)
      return
    }

    if (isDefaultPastFilters && pastTotalCount > 0) {
      setServerFilteredCount(pastTotalCount)
      return
    }

    let isActive = true
    const search = new URLSearchParams({
      scope: 'past',
      countOnly: '1',
      statusFinished: String(Boolean(statusFilter.finished)),
      statusClosed: String(Boolean(statusFilter.closed)),
      statusCanceled: String(Boolean(statusFilter.canceled)),
    })

    if (selectedTown) search.set('town', selectedTown)
    if (additionalQuickFilter)
      search.set('additionalQuick', additionalQuickFilter)
    if (checkFilter.checked !== checkFilter.unchecked) {
      search.set('calendarChecked', String(Boolean(checkFilter.checked)))
    }

    ;(async () => {
      try {
        const response = await getData(
          `/api/events?${search.toString()}`,
          null,
          null,
          null,
          true
        )
        const totalCount = Number(response?.meta?.totalCount)
        if (!isActive) return
        setServerFilteredCount(
          Number.isFinite(totalCount) ? totalCount : sortedEvents.length
        )
      } catch (error) {
        if (!isActive) return
        setServerFilteredCount(sortedEvents.length)
      }
    })()

    return () => {
      isActive = false
    }
  }, [
    additionalQuickFilter,
    checkFilter.checked,
    checkFilter.unchecked,
    filter,
    isDefaultPastFilters,
    pastHasMore,
    pastTotalCount,
    selectedTown,
    sortedEvents.length,
    statusFilter.canceled,
    statusFilter.closed,
    statusFilter.finished,
  ])

  const displayedCount =
    filter === 'past'
      ? (serverFilteredCount ?? sortedEvents.length)
      : sortedEvents.length

  const selectedStatusCount = useMemo(
    () => statusFilterKeys.filter((key) => Boolean(statusFilter[key])).length,
    [statusFilter, statusFilterKeys]
  )

  const currentMonthStart = useMemo(() => toMonthStart(new Date()), [])
  const isUpcomingMinMonth =
    filter === 'upcoming' &&
    monthCursor.getTime() <= currentMonthStart.getTime()

  const isStatusFilterDefault = useMemo(() => {
    const defaults = getStatusFilterDefaults(filter)
    return statusFilterKeys.every(
      (key) => Boolean(statusFilter[key]) === Boolean(defaults[key])
    )
  }, [filter, statusFilter, statusFilterKeys])

  const isCheckFilterDefault = checkFilter.checked && checkFilter.unchecked
  const activeMobileFiltersCount = [
    selectedTown,
    filter !== 'all' && !isStatusFilterDefault,
    hasUncheckedEvents && !isCheckFilterDefault,
    additionalQuickFilter,
  ].filter(Boolean).length
  const hasActiveFilters = activeMobileFiltersCount > 0

  const mobileFiltersSummary = [
    selectedTown || 'Все города',
    filter !== 'all'
      ? `Статусы ${selectedStatusCount}/${statusFilterKeys.length}`
      : null,
    hasUncheckedEvents && !isCheckFilterDefault ? 'Проверка' : null,
    additionalQuickFilter ? 'Быстрый фильтр' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  const resetFilters = useCallback(() => {
    setSelectedTown('')
    setCheckFilter({ checked: true, unchecked: true })
    setStatusFilter(getStatusFilterDefaults(filter))
    setAdditionalQuickFilter('')
  }, [filter])

  const setPastQuickFilter = useCallback((preset) => {
    setStatusFilter(preset.statusFilter)
    setAdditionalQuickFilter('')
  }, [])

  const activePastQuickFilter = useMemo(() => {
    if (filter !== 'past') return ''
    const active = PAST_QUICK_FILTERS.find((item) =>
      Object.entries(item.statusFilter).every(
        ([key, value]) => Boolean(statusFilter[key]) === value
      )
    )
    return active?.key ?? ''
  }, [filter, statusFilter])

  const toggleAdditionalQuickFilter = (value) => {
    setAdditionalQuickFilter((prev) => (prev === value ? '' : value))
  }

  const handleLoadMorePast = useCallback(async () => {
    if (pastLoadingMore || !pastHasMore) return
    setPastLoadingMore(true)
    try {
      const response = await loadMorePastEventsMutation.mutateAsync({
        before: pastNextBefore,
        limit: 120,
      })
      const loadedItems = Array.isArray(response?.data) ? response.data : []
      const nextMeta = response?.meta ?? {}

      setPastHasMore(Boolean(nextMeta?.hasMore))
      setPastNextBefore(nextMeta?.nextBefore || null)
      setPastTotalCount(Number(nextMeta?.totalCount || loadedItems.length || 0))
    } finally {
      setPastLoadingMore(false)
    }
  }, [
    loadMorePastEventsMutation,
    pastHasMore,
    pastLoadingMore,
    pastNextBefore,
  ])

  const monthTitle = useMemo(
    () =>
      monthCursor.toLocaleDateString('ru-RU', {
        month: 'long',
        year: 'numeric',
      }),
    [monthCursor]
  )

  const monthGridDays = useMemo(() => {
    const monthStart = toMonthStart(monthCursor)
    const shift = monthStart.getDay()
    const gridStart = new Date(
      monthStart.getFullYear(),
      monthStart.getMonth(),
      1 - shift
    )
    return Array.from({ length: MONTH_VIEW_DAY_CELLS }, (_, index) => {
      const day = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + index
      )
      return {
        date: day,
        key: toDateKey(day),
        inCurrentMonth: day.getMonth() === monthStart.getMonth(),
      }
    })
  }, [monthCursor])

  const monthItemsByDay = useMemo(() => {
    const map = new Map()
    sortedEvents.forEach((event) => {
      const pushByDate = (dateValue, payload) => {
        const dayKey = toDateKey(dateValue)
        if (!dayKey) return
        if (!map.has(dayKey)) map.set(dayKey, [])
        map.get(dayKey).push(payload)
      }

      pushByDate(event?.eventDate, {
        type: 'event',
        eventId: event?._id,
        title: event?.eventType || 'Мероприятие',
        description: event?.description || '',
        date: event?.eventDate ?? null,
        status: event?.status || 'active',
        time: toMinuteOfDay(event?.eventDate),
      })

      ;(Array.isArray(event?.additionalEvents) ? event.additionalEvents : []).forEach(
        (item, index) => {
          pushByDate(item?.date, {
            type: 'additional',
            eventId: event?._id,
            title: item?.title || `Доп. событие #${index + 1}`,
            description: item?.description || '',
            date: item?.date ?? null,
            index,
            status: item?.done ? 'done' : 'active',
            done: Boolean(item?.done),
            time: toMinuteOfDay(item?.date),
          })
        }
      )
    })

    map.forEach((items, key) => {
      map.set(
        key,
        [...items].sort((a, b) => {
          if (a.time !== b.time) return a.time - b.time
          if (a.type === b.type) return 0
          return a.type === 'event' ? -1 : 1
        })
      )
    })
    return map
  }, [sortedEvents])

  const eventsById = useMemo(() => {
    const map = new Map()
    ;(sortedEvents ?? []).forEach((event) => {
      if (!event?._id) return
      map.set(String(event._id), event)
    })
    return map
  }, [sortedEvents])

  const monthMeta = useMemo(() => {
    const meta = { events: 0, additional: 0 }
    monthGridDays.forEach((day) => {
      if (!day.inCurrentMonth) return
      const dayItems = monthItemsByDay.get(day.key) || []
      dayItems.forEach((item) => {
        if (item.type === 'event') meta.events += 1
        else meta.additional += 1
      })
    })
    return meta
  }, [monthGridDays, monthItemsByDay])

  useEffect(() => {
    if (viewMode !== 'month') {
      monthAutoPositionedRef.current = false
      return
    }
    if (
      filter === 'upcoming' &&
      monthCursor.getTime() < currentMonthStart.getTime()
    ) {
      setMonthCursor(currentMonthStart)
      return
    }
    if (filter === 'upcoming') return
    if (monthAutoPositionedRef.current) return
    monthAutoPositionedRef.current = true
    if (sortedEvents.length === 0) return
    const hasItemsInCurrentMonth = monthGridDays.some((day) => {
      if (!day.inCurrentMonth) return false
      const items = monthItemsByDay.get(day.key)
      return Array.isArray(items) && items.length > 0
    })
    if (hasItemsInCurrentMonth) return

    const firstDate = sortedEvents[0]?.eventDate
    const parsed = firstDate ? new Date(firstDate) : null
    if (!parsed || Number.isNaN(parsed.getTime())) return
    setMonthCursor(toMonthStart(parsed))
  }, [
    currentMonthStart,
    filter,
    monthCursor,
    monthGridDays,
    monthItemsByDay,
    sortedEvents,
    viewMode,
  ])

  const openDayEventsModal = useCallback(
    (day) => {
      const dayItems = monthItemsByDay.get(day?.key) || []
      if (dayItems.length === 0) return

      const dayEvents = dayItems
        .filter((item) => item.type === 'event')
        .map((item) => eventsById.get(String(item.eventId)))
        .filter(Boolean)
      const dayAdditionalEvents = dayItems.filter(
        (item) => item.type === 'additional'
      )

      const dayTitle = day?.date
        ? day.date.toLocaleDateString('ru-RU', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          })
        : 'Выбранный день'

      const DayEventsModal = () => (
        <div className="flex max-h-[70vh] flex-col gap-2 overflow-auto px-1 py-1">
          {dayEvents.length > 0 ? (
            <>
              <div className="text-sm font-semibold text-gray-700">
                Мероприятия
              </div>
              {dayEvents.map((event) => (
                <EventCard
                  key={`month-day-event-${event._id}`}
                  eventId={event._id}
                  event={event}
                  transactions={transactions}
                />
              ))}
            </>
          ) : null}
          {dayAdditionalEvents.length > 0 ? (
            <>
              <div className="mt-2 text-sm font-semibold text-gray-700">
                Доп. события
              </div>
              {dayAdditionalEvents.map((item, idx) => {
                const date = item?.date ? new Date(item.date) : null
                const timeLabel =
                  date && !Number.isNaN(date.getTime())
                    ? date.toLocaleTimeString('ru-RU', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Время не указано'
                return (
                  <div
                    key={`month-day-additional-${item.eventId}-${item.index}-${idx}`}
                    className="rounded border border-gray-200 bg-white px-3 py-2"
                  >
                    <div className="text-sm font-semibold text-gray-900">
                      {item.title || 'Доп. событие'}
                    </div>
                    <div className="text-xs text-gray-600">
                      {item.done ? 'Выполнено' : 'Активно'} • {timeLabel}
                    </div>
                    {item.description ? (
                      <div className="text-xs text-gray-600">
                        {item.description}
                      </div>
                    ) : null}
                    <div className="mt-2">
                      <AppButton
                        variant="secondary"
                        size="sm"
                        className="w-full rounded-md tablet:w-auto"
                        onClick={() => modalsFunc.event?.view?.(item.eventId)}
                      >
                        Открыть мероприятие
                      </AppButton>
                    </div>
                  </div>
                )
              })}
            </>
          ) : null}
        </div>
      )

      modalsFunc.add({
        title: `План на день: ${dayTitle}`,
        confirmButtonName: 'Закрыть',
        onConfirm: true,
        showDecline: false,
        Children: DayEventsModal,
      })
    },
    [eventsById, modalsFunc, monthItemsByDay, transactions]
  )

  useEffect(() => {
    if (!additionalQuickFilter) return
    if ((additionalSummary?.[additionalQuickFilter] ?? 0) > 0) return
    setAdditionalQuickFilter('')
  }, [additionalQuickFilter, additionalSummary])

  const RowComponent = useCallback(
    ({ index, style }) => {
      if (filter === 'past' && index >= sortedEvents.length) {
        return (
          <div
            style={{ ...style, padding: '6px 8px' }}
            className="flex items-center justify-center"
          >
            <AppButton
              variant="secondary"
              size="sm"
              className="rounded-md px-4"
              disabled={pastLoadingMore}
              onClick={handleLoadMorePast}
            >
              {pastLoadingMore ? 'Загрузка...' : 'Загрузить еще прошедшие'}
            </AppButton>
          </div>
        )
      }
      const event = sortedEvents[index]

      return (
        <EventCard
          eventId={event._id}
          event={event}
          style={{ ...style, padding: '6px 8px' }}
          transactions={transactions}
        />
      )
    },
    [
      filter,
      pastLoadingMore,
      sortedEvents,
      handleLoadMorePast,
      transactions,
    ]
  )

  const createMenuDisabled = !modalsFunc.event?.create

  const handleCreateRequest = useCallback(() => {
    modalsFunc.event?.create?.('draft')
  }, [modalsFunc])

  const handleCreateActiveEvent = useCallback(() => {
    modalsFunc.event?.create?.('active')
  }, [modalsFunc])

  const handleCreateByVoice = useCallback(() => {
    setVoiceDraftOpen(true)
  }, [])

  const handleVoiceDraft = useCallback(
    (fields, transcript) => {
      setVoiceDraftOpen(false)
      modalsFunc.event?.create?.(fields?.status || 'draft', {
        initialEvent: {
          ...fields,
          status: fields?.status || 'draft',
          description:
            fields?.description ||
            (transcript ? `Голосовой ввод: ${transcript}` : ''),
        },
      })
    },
    [modalsFunc]
  )

  return (
    <div className="flex h-full flex-col gap-3 tablet:gap-4">
      {voiceDraftOpen ? (
        <VoiceDraftOverlay
          onClose={() => setVoiceDraftOpen(false)}
          onDraft={handleVoiceDraft}
        />
      ) : null}
      <ContentHeader>
        <div className="tablet:hidden flex w-full flex-col gap-2">
          <div className="flex w-full items-center gap-2">
            <AppButton
              variant="secondary"
              size="sm"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md p-0"
              onClick={() =>
                setViewMode((prev) => (prev === 'list' ? 'month' : 'list'))
              }
              title={
                viewMode === 'list'
                  ? 'Показать календарь'
                  : 'Показать список'
              }
              aria-label={
                viewMode === 'list'
                  ? 'Показать календарь'
                  : 'Показать список'
              }
            >
              {viewMode === 'list' ? (
                <ViewListIcon fontSize="small" />
              ) : (
                <CalendarMonthIcon fontSize="small" />
              )}
            </AppButton>
            <div className="min-w-0 flex-1">
              <MutedText className="block truncate text-xs">
                {filterName}: {displayedCount}
              </MutedText>
              <div className="truncate text-[11px] leading-tight text-gray-500">
                {mobileFiltersSummary}
              </div>
            </div>
            <AppButton
              variant={mobileFiltersOpen ? 'primary' : 'secondary'}
              size="sm"
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md p-0"
              onClick={() => setMobileFiltersOpen((prev) => !prev)}
              title="Фильтры"
              aria-label="Фильтры"
            >
              <FilterAltIcon fontSize="small" />
              {activeMobileFiltersCount > 0 ? (
                <span className="absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] leading-none font-semibold text-white">
                  {activeMobileFiltersCount}
                </span>
              ) : null}
            </AppButton>
            <AddEventMenu
              disabled={createMenuDisabled}
              allowVoice={allowVoiceDraft}
              onCreateRequest={handleCreateRequest}
              onCreateEvent={handleCreateActiveEvent}
              onVoice={handleCreateByVoice}
            />
          </div>
          {mobileFiltersOpen ? (
            <SectionCard className="border border-gray-200 bg-white/95 p-2 shadow-sm">
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-gray-800">
                    Фильтры
                  </div>
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      className="cursor-pointer text-xs font-semibold text-general hover:underline"
                      onClick={resetFilters}
                    >
                      Сбросить
                    </button>
                  ) : null}
                </div>
                <ComboBox
                  label="Город"
                  items={townsOptions}
                  value={selectedTown}
                  onChange={(value) => setSelectedTown(value ?? '')}
                  placeholder="Все города"
                  activePlaceholder
                  fullWidth
                  noMargin
                  className="mt-1"
                />
                {filter !== 'all' ? (
                  <div className="flex flex-col gap-2">
                    {hasUncheckedEvents ? (
                      <EventCheckFilterChips
                        value={checkFilter}
                        onChange={setCheckFilter}
                      />
                    ) : null}
                    <EventStatusFilterChips
                      value={statusFilter}
                      onChange={setStatusFilter}
                      mode={filter}
                    />
                  </div>
                ) : null}
              </div>
            </SectionCard>
          ) : null}
        </div>
        <div className="tablet:block hidden w-full">
          <HeaderActions
            className="tablet:flex-nowrap w-full gap-y-2"
            leftClassName="min-w-0"
            bottomClassName="w-full tablet:w-auto"
            rightClassName="ml-auto w-full justify-end tablet:w-auto"
            left={
              <div className="tablet:w-52 w-[min(56vw,160px)]">
                <ComboBox
                  label="Город"
                  items={townsOptions}
                  value={selectedTown}
                  onChange={(value) => setSelectedTown(value ?? '')}
                  placeholder="Все города"
                  activePlaceholder
                  fullWidth
                  noMargin
                  className="mt-1.5"
                />
              </div>
            }
            bottom={
              filter !== 'all' ? (
                <div className="tablet:w-auto tablet:flex-nowrap tablet:justify-start tablet:gap-3 flex w-full flex-wrap items-center justify-center gap-2">
                  {hasUncheckedEvents && (
                    <EventCheckFilterChips
                      value={checkFilter}
                      onChange={setCheckFilter}
                    />
                  )}
                  <EventStatusFilterChips
                    value={statusFilter}
                    onChange={setStatusFilter}
                    mode={filter}
                  />
                  {hasActiveFilters ? (
                    <button
                      type="button"
                      className="cursor-pointer text-xs font-semibold text-general hover:underline"
                      onClick={resetFilters}
                    >
                      Сбросить
                    </button>
                  ) : null}
                </div>
              ) : null
            }
            right={
              <>
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <AppButton
                    variant="secondary"
                    size="sm"
                    className="flex h-9 items-center gap-1.5 rounded-md px-2.5"
                    onClick={() =>
                      setViewMode((prev) =>
                        prev === 'list' ? 'month' : 'list'
                      )
                    }
                    title={
                      viewMode === 'list'
                        ? 'Показать календарь'
                        : 'Показать список'
                    }
                  >
                    {viewMode === 'list' ? (
                      <ViewListIcon fontSize="small" />
                    ) : (
                      <CalendarMonthIcon fontSize="small" />
                    )}
                    {viewMode === 'list' ? 'Список' : 'Месяц'}
                  </AppButton>
                  <MutedText>
                    {filterName}: {displayedCount}
                  </MutedText>
                  <MutedText className="tablet:inline hidden">
                    Всего: {events.length}
                  </MutedText>
                  <AddEventMenu
                    disabled={createMenuDisabled}
                    allowVoice={allowVoiceDraft}
                    onCreateRequest={handleCreateRequest}
                    onCreateEvent={handleCreateActiveEvent}
                    onVoice={handleCreateByVoice}
                  />
                </div>
              </>
            }
          />
        </div>
      </ContentHeader>
      {filter === 'upcoming' || filter === 'past' ? (
        <SectionCard className="border border-gray-200 bg-white/95 p-2 shadow-sm tablet:p-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="tablet:w-auto tablet:flex-1 tablet:justify-end flex w-full items-center justify-start">
              <div className="phoneH:flex-row tablet:w-auto flex w-full flex-row gap-2">
                {filter === 'upcoming' ? (
                  <AppButton
                    variant="primary"
                    size="sm"
                    className="min-w-0 flex-1 rounded-md px-3 text-xs font-semibold shadow-md phoneH:w-auto tablet:text-sm"
                    onClick={() => modalsFunc.event?.upcomingOverview?.()}
                  >
                    <span className="inline-flex min-w-0 items-center justify-center gap-2">
                      <span className="tablet:inline hidden">
                        Ближайшие события
                      </span>
                      <span className="tablet:hidden">Ближайшие</span>
                      {upcomingOverviewBadges.length > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          {upcomingOverviewBadges.map((badge) => (
                            <span
                              key={badge.key}
                              title={badge.title}
                              className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] leading-none font-semibold shadow-sm ${badge.className}`}
                            >
                              {badge.value}
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </AppButton>
                ) : null}
                {filter === 'upcoming' && pastActiveClosableCount > 0 ? (
                  <AppButton
                    variant="secondary"
                    size="sm"
                    className="min-w-0 flex-1 rounded-md px-3 text-xs font-semibold phoneH:w-auto tablet:text-sm"
                    onClick={() =>
                      router.push(
                        '/cabinet/eventsPast?statusFinished=true&statusClosed=false&statusCanceled=false'
                      )
                    }
                  >
                    <span className="inline-flex min-w-0 items-center justify-center gap-2">
                      <span className="tablet:inline hidden">
                        Закрыть прошедшие мероприятия
                      </span>
                      <span className="tablet:hidden">Закрыть прошедшие</span>
                      <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] leading-none font-semibold text-white shadow-sm">
                        {pastActiveClosableCount}
                      </span>
                    </span>
                  </AppButton>
                ) : null}
                {filter === 'past'
                  ? PAST_QUICK_FILTERS.map((item) => (
                      <AppButton
                        key={item.key}
                        variant={
                          activePastQuickFilter === item.key
                            ? 'primary'
                            : 'secondary'
                        }
                        size="sm"
                        className="min-w-0 flex-1 rounded-md px-2 text-xs font-semibold phoneH:w-auto tablet:flex-none tablet:px-3 tablet:text-sm"
                        onClick={() => setPastQuickFilter(item)}
                      >
                        {item.label}
                      </AppButton>
                    ))
                  : null}
              </div>
            </div>
          </div>
        </SectionCard>
      ) : null}
      <SectionCard className="min-h-0 flex-1 overflow-hidden border-0 bg-transparent shadow-none">
        {viewMode === 'list' ? (
          sortedEvents.length > 0 ? (
            <List
              listRef={listRef}
              rowCount={
                filter === 'past' && pastHasMore
                  ? sortedEvents.length + 1
                  : sortedEvents.length
              }
              rowHeight={itemHeight}
              rowComponent={RowComponent}
              rowProps={{}}
              style={{ height: '100%', width: '100%' }}
            />
          ) : (
            <EmptyState text="Для выбранных фильтьров мероприятий пока нет" />
          )
        ) : (
          <div className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
            <SectionCard className="border border-gray-200 bg-white/95 p-3 shadow-sm">
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center justify-center gap-2">
                  <AppButton
                    variant="secondary"
                    size="sm"
                    className="flex h-9 w-9 items-center justify-center rounded-md p-0"
                    disabled={isUpcomingMinMonth}
                    onClick={() =>
                      setMonthCursor((prev) =>
                        filter === 'upcoming' &&
                        prev.getTime() <= currentMonthStart.getTime()
                          ? currentMonthStart
                          : toMonthStart(
                              new Date(
                                prev.getFullYear(),
                                prev.getMonth() - 1,
                                1
                              )
                            )
                      )
                    }
                    title="Предыдущий месяц"
                    aria-label="Предыдущий месяц"
                  >
                    <ChevronLeftIcon fontSize="small" />
                  </AppButton>
                  <AppButton
                    variant="secondary"
                    size="sm"
                    className="rounded-md px-3"
                    onClick={() => setMonthCursor(toMonthStart(new Date()))}
                  >
                    Сегодня
                  </AppButton>
                  <AppButton
                    variant="secondary"
                    size="sm"
                    className="flex h-9 w-9 items-center justify-center rounded-md p-0"
                    onClick={() =>
                      setMonthCursor((prev) =>
                        toMonthStart(
                          new Date(prev.getFullYear(), prev.getMonth() + 1, 1)
                        )
                      )
                    }
                    title="Следующий месяц"
                    aria-label="Следующий месяц"
                  >
                    <ChevronRightIcon fontSize="small" />
                  </AppButton>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-center">
                  <div className="text-sm font-semibold text-gray-800 capitalize">
                    {monthTitle}
                  </div>
                  <MutedText className="text-xs">
                    Мероприятий: {monthMeta.events} | Доп. событий:{' '}
                    {monthMeta.additional}
                  </MutedText>
                </div>
              </div>
            </SectionCard>
            <div className="event-month-calendar min-h-0 flex-1 overflow-auto rounded-lg border bg-white">
              <div className="event-month-calendar__weekdays sticky top-0 z-10 grid grid-cols-7 border-b shadow-sm backdrop-blur">
                {DAYS_OF_WEEK.map((dayName) => (
                  <div
                    key={dayName}
                    className="px-1.5 py-1.5 text-center text-[11px] font-semibold"
                  >
                    {dayName}
                  </div>
                ))}
              </div>
              <div className="grid auto-rows-auto grid-cols-7">
                {monthGridDays.map((day) => {
                  const dayItems = monthItemsByDay.get(day.key) || []
                  const hasDayContent = dayItems.length > 0
                  const visibleDayItems = dayItems.slice(0, 2)
                  const extraCount = dayItems.length - visibleDayItems.length
                  const today = new Date()
                  const todayStart = new Date(
                    today.getFullYear(),
                    today.getMonth(),
                    today.getDate()
                  ).getTime()
                  const dayStart = new Date(
                    day.date.getFullYear(),
                    day.date.getMonth(),
                    day.date.getDate()
                  ).getTime()
                  const isToday = dayStart === todayStart
                  const isPastDay = dayStart < todayStart
                  return (
                    <div
                      key={day.key}
                      className={`event-month-calendar__day min-h-[62px] border-r border-b p-1 ${
                        day.inCurrentMonth
                          ? isPastDay
                            ? 'event-month-calendar__day--past'
                            : isToday
                              ? 'event-month-calendar__day--today'
                              : 'event-month-calendar__day--current'
                          : 'event-month-calendar__day--outside'
                      } ${hasDayContent ? 'cursor-pointer event-month-calendar__day--interactive' : ''}`}
                      onClick={() => openDayEventsModal(day)}
                    >
                      <div
                        className={`event-month-calendar__day-number mb-1 inline-flex h-5 min-w-5 items-center justify-center rounded px-1 text-xs font-semibold ${
                          isToday
                            ? 'event-month-calendar__day-number--today'
                            : day.inCurrentMonth
                              ? isPastDay
                                ? 'event-month-calendar__day-number--past'
                                : 'event-month-calendar__day-number--current'
                              : 'event-month-calendar__day-number--outside'
                        }`}
                      >
                        {day.date.getDate()}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {visibleDayItems.map((item, index) => (
                          <button
                            key={`${day.key}-${item.type}-${item.eventId}-${index}`}
                            type="button"
                            className={`flex w-full cursor-pointer items-center gap-1 truncate rounded border px-1 py-0.5 text-left text-[10px] leading-tight ${getMonthItemToneClassName(item)}`}
                            title={item.title}
                            onClick={(event) => {
                              event.stopPropagation()
                              modalsFunc.event?.view?.(item.eventId)
                            }}
                          >
                            <span
                              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                                item.type === 'event'
                                  ? 'bg-current'
                                  : 'border border-current'
                              }`}
                            />
                            <span className="min-w-0 truncate">
                              {item.title}
                            </span>
                          </button>
                        ))}
                        {extraCount > 0 ? (
                          <div className="px-1 text-[10px] leading-tight text-gray-500">
                            +{extraCount} еще
                          </div>
                        ) : null}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            {filter === 'past' && pastHasMore ? (
              <div className="flex justify-center">
                <AppButton
                  variant="secondary"
                  size="sm"
                  className="rounded-md px-4"
                  disabled={pastLoadingMore}
                  onClick={handleLoadMorePast}
                >
                  {pastLoadingMore ? 'Загрузка...' : 'Загрузить еще прошедшие'}
                </AppButton>
              </div>
            ) : null}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

export default EventsContent
