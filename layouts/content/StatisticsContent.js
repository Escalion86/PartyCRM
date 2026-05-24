/* eslint-disable react-hooks/exhaustive-deps */
'use client'

import { useMemo, useState, useEffect, useRef } from 'react'
import { Bar } from '@nivo/bar'
import { useAtomValue } from 'jotai'
import ContentHeader from '@components/ContentHeader'
import ComboBox from '@components/ComboBox'
import Button from '@components/Button'
import CheckBox from '@components/CheckBox'
import EmptyState from '@components/EmptyState'
import HeaderActions from '@components/HeaderActions'
import SectionCard from '@components/SectionCard'
import SurfaceCard from '@components/SurfaceCard'
import EventCard from '@layouts/cards/EventCard'
import tariffsAtom from '@state/atoms/tariffsAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { modalsFuncAtom } from '@state/atoms'
import { MONTHS_FULL_1, TRANSACTION_CATEGORIES } from '@helpers/constants'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import { useRouter } from 'next/navigation'
import formatAddress from '@helpers/formatAddress'
import getPersonFullName from '@helpers/getPersonFullName'
import { useStatisticsQuery } from '@helpers/useStatisticsQuery'

const buildMonthLabel = (date) => MONTHS_FULL_1[date.getMonth()]
const ALL_TOWNS_OPTION = 'Все города'

const getMonthKey = (date, year) =>
  `${year}-${String(date.getMonth() + 1).padStart(2, '0')}`

const isValidDate = (value) => {
  if (!value) return false
  const date = new Date(value)
  return !Number.isNaN(date.getTime())
}

const EVENT_STATUS_LABELS = Object.freeze({
  draft: 'Заявка',
  active: 'Активно',
  canceled: 'Отменено',
  finished: 'Завершено',
  closed: 'Закрыто',
})

const getEventStatusLabel = (status) =>
  EVENT_STATUS_LABELS[status] || status || 'Без статуса'

const getEventComputedStatus = (event) => {
  if (!event) return 'active'
  if (event.status === 'draft') return 'draft'
  if (event.status === 'canceled') return 'canceled'
  if (event.status === 'closed') return 'closed'

  const dateRaw = event.dateEnd ?? event.eventDate
  if (!isValidDate(dateRaw)) return event.status || 'active'

  const now = Date.now()
  return new Date(dateRaw).getTime() < now ? 'finished' : 'active'
}

const formatCurrency = (value) =>
  `${Number(value || 0).toLocaleString('ru-RU')} ₽`

const StatisticsContent = () => {
  const tariffsRaw = useAtomValue(tariffsAtom)
  const loggedUser = useAtomValue(loggedUserAtom)
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const statisticsQuery = useStatisticsQuery()
  const statisticsData = statisticsQuery.data ?? {}

  const transactions = Array.isArray(statisticsData.transactions)
    ? statisticsData.transactions
    : []
  const events = Array.isArray(statisticsData.events) ? statisticsData.events : []
  const clients = Array.isArray(statisticsData.clients)
    ? statisticsData.clients
    : []
  const services = Array.isArray(statisticsData.services)
    ? statisticsData.services
    : []
  const tariffs = Array.isArray(tariffsRaw) ? tariffsRaw : []
  const requests = useMemo(
    () => events.filter((event) => event?.status === 'draft'),
    [events]
  )
  const access = getUserTariffAccess(loggedUser, tariffs)
  const router = useRouter()
  const canShowStatistics = access.allowStatistics

  const eventsMap = useMemo(() => {
    const map = new Map()
    events.forEach((event) => {
      if (event?._id) map.set(event._id, event)
    })
    return map
  }, [events])

  const clientsMap = useMemo(() => {
    const map = new Map()
    clients.forEach((client) => {
      if (client?._id) map.set(client._id, client)
    })
    return map
  }, [clients])

  const servicesMap = useMemo(() => {
    const map = new Map()
    services.forEach((service) => {
      if (service?._id) map.set(service._id, service)
    })
    return map
  }, [services])

  const availableYears = useMemo(() => {
    const years = new Set()
    events.forEach((event) => {
      if (!event?.eventDate) return
      const date = new Date(event.eventDate)
      if (Number.isNaN(date.getTime())) return
      years.add(date.getFullYear())
    })
    return Array.from(years).sort((a, b) => b - a)
  }, [events])

  const [selectedYear, setSelectedYear] = useState(null)
  const [selectedTown, setSelectedTown] = useState('')
  const [includeRequests, setIncludeRequests] = useState(false)
  const chartContainerRef = useRef(null)
  const [chartWidth, setChartWidth] = useState(0)

  useEffect(() => {
    const element = chartContainerRef.current
    if (!element) return

    const updateWidth = () => {
      const nextWidth = Math.max(0, Math.floor(element.clientWidth))
      setChartWidth(nextWidth)
    }

    updateWidth()

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(() => updateWidth())
      observer.observe(element)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', updateWidth)
    return () => window.removeEventListener('resize', updateWidth)
  }, [
    selectedYear,
    selectedTown,
    includeRequests,
    events.length,
    transactions.length,
  ])

  useEffect(() => {
    if (selectedYear !== null) return
    if (availableYears.length > 0) setSelectedYear(availableYears[0])
  }, [availableYears, selectedYear])

  const townsOptions = useMemo(() => {
    const set = new Set()
    events.forEach((event) => {
      if (!event?.eventDate || !isValidDate(event.eventDate)) return
      const date = new Date(event.eventDate)
      if (selectedYear && date.getFullYear() !== selectedYear) return
      const town = event?.address?.town
      if (typeof town === 'string' && town.trim()) set.add(town.trim())
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [events, selectedYear])

  const townsOptionsWithAll = useMemo(
    () => [ALL_TOWNS_OPTION, ...townsOptions],
    [townsOptions]
  )

  useEffect(() => {
    if (!selectedTown) return
    if (townsOptions.includes(selectedTown)) return
    setSelectedTown('')
  }, [selectedTown, townsOptions])

  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      if (!isValidDate(event?.eventDate)) return false
      const eventDate = new Date(event.eventDate)
      if (selectedYear && eventDate.getFullYear() !== selectedYear) return false
      if (selectedTown && (event?.address?.town ?? '') !== selectedTown)
        return false
      const eventStatus = getEventComputedStatus(event)
      if (
        eventStatus === 'active' ||
        eventStatus === 'finished' ||
        eventStatus === 'closed'
      )
        return true
      return includeRequests && eventStatus === 'draft'
    })
  }, [events, includeRequests, selectedTown, selectedYear])

  const filteredEventIds = useMemo(
    () => new Set(filteredEvents.map((event) => event?._id).filter(Boolean)),
    [filteredEvents]
  )

  const filteredTransactions = useMemo(
    () =>
      transactions.filter(
        (tx) => tx?.eventId && filteredEventIds.has(tx.eventId)
      ),
    [transactions, filteredEventIds]
  )

  const filteredRequests = useMemo(
    () => {
      if (!includeRequests) return []
      return requests.filter((request) => {
        const dateRaw = request?.eventDate ?? request?.createdAt
        if (selectedYear && !isValidDate(dateRaw)) return false
        if (selectedYear && new Date(dateRaw).getFullYear() !== selectedYear)
          return false
        if (selectedTown && (request?.address?.town ?? '') !== selectedTown)
          return false
        return true
      })
    },
    [includeRequests, requests, selectedYear, selectedTown]
  )

  const eventFinanceMap = useMemo(() => {
    const map = new Map()
    filteredEvents.forEach((event) => {
      if (event?._id) {
        map.set(event._id, { income: 0, expense: 0 })
      }
    })
    filteredTransactions.forEach((tx) => {
      if (!tx?.eventId || !map.has(tx.eventId)) return
      const item = map.get(tx.eventId)
      const amount = Number(tx.amount ?? 0)
      if (tx.type === 'income') item.income += amount
      if (tx.type === 'expense') item.expense += amount
    })
    return map
  }, [filteredEvents, filteredTransactions])

  const paymentLeftEvents = useMemo(
    () =>
      filteredEvents
        .map((event) => {
          const finance = eventFinanceMap.get(event?._id) || {
            income: 0,
            expense: 0,
          }
          const paid = Math.max(finance.income, 0)
          const paymentLeft = Math.max(Number(event?.contractSum ?? 0) - paid, 0)
          return { event, paymentLeft }
        })
        .filter(({ event, paymentLeft }) => event?._id && paymentLeft > 0),
    [eventFinanceMap, filteredEvents]
  )

  const depositPaidEvents = useMemo(() => {
    const incomeByEvent = new Map()
    filteredTransactions.forEach((tx) => {
      if (tx?.type !== 'income' || !tx?.eventId) return
      const amount = Number(tx.amount ?? 0)
      if (!Number.isFinite(amount) || amount <= 0) return
      incomeByEvent.set(tx.eventId, (incomeByEvent.get(tx.eventId) || 0) + amount)
    })

    return filteredEvents
      .map((event) => {
        const status = getEventComputedStatus(event)
        const depositPaid =
          status === 'active' || status === 'draft'
            ? incomeByEvent.get(event?._id) || 0
            : 0
        return { event, depositPaid }
      })
      .filter(({ event, depositPaid }) => event?._id && depositPaid > 0)
  }, [filteredEvents, filteredTransactions])

  const stats = useMemo(() => {
    if (!selectedYear) return []
    const byMonth = new Map()
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth()
    const isFutureMonth = (monthIndex) =>
      selectedYear > currentYear ||
      (selectedYear === currentYear && monthIndex > currentMonth)
    const isOpenCurrentMonth = (monthIndex) =>
      selectedYear === currentYear && monthIndex === currentMonth
    const isUnfinishedMonth = (monthIndex) =>
      isFutureMonth(monthIndex) || isOpenCurrentMonth(monthIndex)

    filteredEvents.forEach((event) => {
      if (!event?.eventDate || !isValidDate(event.eventDate)) return
      const date = new Date(event.eventDate)

      const key = getMonthKey(date, selectedYear)
      const label = buildMonthLabel(date)
      if (!byMonth.has(key)) {
        byMonth.set(key, {
          month: label,
          income: 0,
          expense: 0,
          profit: 0,
          isFuture: isFutureMonth(date.getMonth()),
          isOpenMonth: isOpenCurrentMonth(date.getMonth()),
          isUnfinished: isUnfinishedMonth(date.getMonth()),
          plannedIncome: 0,
          paymentLeft: 0,
        })
      }
      const bucket = byMonth.get(key)
      if (bucket.isFuture) {
        const finance = eventFinanceMap.get(event?._id) || {
          income: 0,
          expense: 0,
        }
        const paid = Math.max(finance.income, 0)
        const contractSum = Number(event?.contractSum ?? 0)
        bucket.plannedIncome += finance.income - finance.expense
        bucket.paymentLeft += Math.max(contractSum - paid, 0)
      }
      if (!bucket.isFuture && getEventComputedStatus(event) === 'finished') {
        const finance = eventFinanceMap.get(event?._id) || {
          income: 0,
          expense: 0,
        }
        const paid = Math.max(finance.income, 0)
        const paymentLeft = Math.max(Number(event?.contractSum ?? 0) - paid, 0)
        bucket.paymentLeft += paymentLeft
      }
    })

    filteredTransactions.forEach((transaction) => {
      if (!transaction?.eventId) return
      const event = eventsMap.get(transaction.eventId)
      if (!event?.eventDate || !isValidDate(event.eventDate)) return
      const date = new Date(event.eventDate)
      const key = getMonthKey(date, selectedYear)
      const label = buildMonthLabel(date)
      if (!byMonth.has(key)) {
        byMonth.set(key, {
          month: label,
          income: 0,
          expense: 0,
          profit: 0,
          isFuture: isFutureMonth(date.getMonth()),
          isOpenMonth: isOpenCurrentMonth(date.getMonth()),
          isUnfinished: isUnfinishedMonth(date.getMonth()),
          plannedIncome: 0,
          paymentLeft: 0,
        })
      }
      const bucket = byMonth.get(key)
      if (bucket.isFuture) return
      const amount = Number(transaction.amount ?? 0)
      if (transaction.type === 'income') bucket.income += amount
      if (transaction.type === 'expense') bucket.expense += amount
      bucket.profit = bucket.income - bucket.expense
    })

    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, value]) => {
        if (value.isFuture) {
          const planned = Number(value.plannedIncome ?? 0)
          return {
            ...value,
            profit: planned,
          }
        }
        return value
      })
  }, [
    eventFinanceMap,
    eventsMap,
    filteredEvents,
    filteredTransactions,
    selectedYear,
  ])

  const financeSummary = useMemo(() => {
    const totalIncome = filteredTransactions
      .filter((tx) => tx?.type === 'income')
      .reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0)
    const totalExpense = filteredTransactions
      .filter((tx) => tx?.type === 'expense')
      .reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0)
    const taxes = filteredTransactions
      .filter((tx) => tx?.type === 'expense' && tx?.category === 'taxes')
      .reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0)
    const commissions = filteredTransactions
      .filter(
        (tx) =>
          tx?.type === 'expense' &&
          (tx?.category === 'referral_out' || tx?.category === 'organizer')
      )
      .reduce((sum, tx) => sum + Number(tx.amount ?? 0), 0)
    const paymentLeft = paymentLeftEvents.reduce(
      (sum, item) => sum + item.paymentLeft,
      0
    )
    const depositPaid = depositPaidEvents.reduce(
      (sum, item) => sum + item.depositPaid,
      0
    )
    const netProfit = totalIncome - totalExpense
    const margin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0

    return {
      totalIncome,
      totalExpense,
      taxes,
      commissions,
      paymentLeft,
      depositPaid,
      netProfit,
      margin,
    }
  }, [depositPaidEvents, filteredTransactions, paymentLeftEvents])

  const expenseCategoryLabels = useMemo(() => {
    const map = new Map()
    TRANSACTION_CATEGORIES.forEach((item) => {
      map.set(item.value, item.name)
    })
    return map
  }, [])

  const topExpenseCategories = useMemo(() => {
    const map = new Map()
    filteredTransactions.forEach((tx) => {
      if (tx?.type !== 'expense') return
      const key = tx?.category || 'other'
      const current = map.get(key) || 0
      map.set(key, current + Number(tx.amount ?? 0))
    })
    return Array.from(map.entries())
      .map(([category, amount]) => ({
        category,
        label: expenseCategoryLabels.get(category) || category,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
  }, [expenseCategoryLabels, filteredTransactions])

  const topProfitableEvents = useMemo(() => {
    return filteredEvents
      .map((event) => {
        const finance = eventFinanceMap.get(event?._id) || {
          income: 0,
          expense: 0,
        }
        return {
          event,
          income: finance.income,
          expense: finance.expense,
          profit: finance.income - finance.expense,
        }
      })
      .sort((a, b) => b.profit - a.profit)
      .slice(0, 5)
  }, [eventFinanceMap, filteredEvents])

  const formatDateTime = (value) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const resolveServicesTitles = (ids = []) => {
    if (!Array.isArray(ids) || ids.length === 0) return ''
    return ids
      .map((id) => servicesMap.get(id)?.title ?? id)
      .filter(Boolean)
      .join(', ')
  }

  const resolveClientName = (clientId, fallbackName) => {
    if (!clientId) return fallbackName || ''
    const client = clientsMap.get(clientId)
    if (!client) return fallbackName || String(clientId)
    return getPersonFullName(client, { fallback: String(clientId) })
  }

  const resolveClientPhone = (clientId, fallbackPhone) => {
    if (fallbackPhone) return fallbackPhone
    const client = clientId ? clientsMap.get(clientId) : null
    return client?.phone ? `+${client.phone}` : ''
  }

  const resolveEventTitle = (event) => {
    if (!event) return ''
    const servicesTitle = resolveServicesTitles(event.servicesIds)
    const addressLine = formatAddress(event.address, '')
    return [servicesTitle, addressLine].filter(Boolean).join(' • ')
  }

  const buildCsv = (headers, rows, delimiter = ';') => {
    const escapeValue = (value) => {
      if (value === null || value === undefined) return ''
      const text = String(value).replace(/\r?\n/g, ' ')
      if (text.includes('"') || text.includes(delimiter)) {
        return `"${text.replace(/"/g, '""')}"`
      }
      return text
    }

    const headerLine = headers.map(escapeValue).join(delimiter)
    const dataLines = rows.map((row) =>
      headers.map((header) => escapeValue(row[header])).join(delimiter)
    )
    return [headerLine, ...dataLines].join('\r\n')
  }

  const downloadCsv = (fileName, headers, rows) => {
    const csv = buildCsv(headers, rows)
    const blob = new Blob([`\ufeff${csv}`], {
      type: 'text/csv;charset=utf-8;',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const handleExport = () => {
    const eventsHeaders = [
      'ID',
      'Дата начала',
      'Дата окончания',
      'Клиент',
      'Город',
      'Адрес',
      'Услуги',
      'Статус',
      'Договорная сумма',
      'Доход',
      'Расход',
      'Прибыль',
    ]
    const eventsRows = filteredEvents.map((event) => {
      const finance = eventFinanceMap.get(event._id) || {
        income: 0,
        expense: 0,
      }
      const profit = finance.income - finance.expense
      return {
        ID: event._id,
        'Дата начала': formatDateTime(event.eventDate),
        'Дата окончания': formatDateTime(event.dateEnd),
        Клиент: resolveClientName(event.clientId),
        Город: event?.address?.town ?? '',
        Адрес: formatAddress(event.address, ''),
        Услуги: resolveServicesTitles(event.servicesIds),
        Статус: getEventStatusLabel(getEventComputedStatus(event)),
        'Договорная сумма': Number(event.contractSum ?? 0),
        Доход: finance.income,
        Расход: finance.expense,
        Прибыль: profit,
      }
    })

    const requestsHeaders = [
      'ID',
      'Дата заявки',
      'Дата мероприятия',
      'Клиент',
      'Телефон',
      'Город',
      'Адрес',
      'Услуги',
      'Статус',
      'Договорная сумма',
      'Связано с мероприятием',
    ]
    const requestsRows = filteredRequests.map((request) => ({
      ID: request._id,
      'Дата заявки': formatDateTime(request.createdAt),
      'Дата мероприятия': formatDateTime(request.eventDate),
      Клиент: resolveClientName(request.clientId),
      Телефон: resolveClientPhone(request.clientId),
      Город: request?.address?.town ?? '',
      Адрес: formatAddress(request.address, ''),
      Услуги: resolveServicesTitles(request.servicesIds),
      Статус: request.status ?? '',
      'Договорная сумма': Number(request.contractSum ?? 0),
      'Связано с мероприятием': 'Нет',
    }))

    const transactionsHeaders = [
      'ID',
      'Дата',
      'Тип',
      'Категория',
      'Сумма',
      'Клиент',
      'Мероприятие',
      'Комментарий',
    ]
    const transactionsRows = filteredTransactions.map((tx) => {
      const event = eventsMap.get(tx.eventId)
      return {
        ID: tx._id,
        Дата: formatDateTime(tx.date),
        Тип: tx.type ?? '',
        Категория: tx.category ?? '',
        Сумма: Number(tx.amount ?? 0),
        Клиент: resolveClientName(tx.clientId),
        Мероприятие: resolveEventTitle(event),
        Комментарий: tx.comment ?? '',
      }
    })

    const suffixYear = selectedYear ? String(selectedYear) : 'all'
    const suffixTown = selectedTown ? selectedTown.replace(/\s+/g, '_') : 'all'
    const suffixRequests = includeRequests ? 'with-requests' : 'without-requests'
    const fileSuffix = `${suffixYear}-${suffixTown}-${suffixRequests}`
    downloadCsv(`artistcrm-events-${fileSuffix}.csv`, eventsHeaders, eventsRows)
    downloadCsv(
      `artistcrm-requests-${fileSuffix}.csv`,
      requestsHeaders,
      requestsRows
    )
    downloadCsv(
      `artistcrm-transactions-${fileSuffix}.csv`,
      transactionsHeaders,
      transactionsRows
    )
  }

  const openEventsDetailsModal = (title, items) => {
    if (!Array.isArray(items) || items.length === 0) return

    const EventsDetailsModal = () => (
      <div className="space-y-2 pb-2">
        {items.map(({ event }) => (
          <EventCard
            key={event._id}
            eventId={event._id}
            event={event}
            transactions={filteredTransactions}
          />
        ))}
      </div>
    )

    modalsFunc.custom?.({
      title,
      Children: EventsDetailsModal,
      declineButtonShow: false,
      closeButtonName: 'Закрыть',
    })
  }

  const renderMetricTitle = (label, count, onCountClick) => (
    <div className="flex items-center gap-1.5 text-xs text-gray-500">
      <span>{label}</span>
      {count > 0 ? (
        <button
          type="button"
          className="flex h-5 min-w-5 cursor-pointer items-center justify-center rounded-full bg-general px-1.5 text-[11px] font-semibold leading-none text-white transition hover:scale-105"
          onClick={(event) => {
            event.stopPropagation()
            onCountClick?.()
          }}
          aria-label={`${label}: открыть мероприятия`}
        >
          {count}
        </button>
      ) : null}
    </div>
  )

  return (
    <div className="flex h-full flex-col gap-4">
      {!canShowStatistics ? (
        <>
          <ContentHeader />
          <SectionCard className="flex min-h-0 flex-1 items-center justify-center px-4">
            <EmptyState bordered={false}>
              <div className="flex flex-col items-center gap-4 text-center text-gray-500">
                <div className="text-lg font-semibold text-gray-700">
                  Статистика доступна только на расширенном тарифе
                </div>
                <Button
                  name="Сменить тариф"
                  onClick={() => router.push('/cabinet/tariff-select')}
                />
              </div>
            </EmptyState>
          </SectionCard>
        </>
      ) : (
        <>
          <ContentHeader>
            <HeaderActions
              left={
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <div className="w-36">
                    <ComboBox
                      label="Год"
                      items={availableYears}
                      value={selectedYear}
                      onChange={(value) =>
                        setSelectedYear(value !== null ? Number(value) : null)
                      }
                      placeholder="Выберите год"
                      fullWidth
                      noMargin
                    />
                  </div>
                  <div className="w-44">
                    <ComboBox
                      label="Город"
                      items={townsOptionsWithAll}
                      value={selectedTown || ALL_TOWNS_OPTION}
                      onChange={(value) =>
                        setSelectedTown(
                          !value || value === ALL_TOWNS_OPTION ? '' : value
                        )
                      }
                      placeholder="Все города"
                      fullWidth
                      noMargin
                    />
                  </div>
                  <CheckBox
                    checked={includeRequests}
                    onClick={() => setIncludeRequests((value) => !value)}
                    label="Учитывать заявки"
                    noMargin
                    wrapperClassName="min-h-[40px] pb-1"
                  />
                </div>
              }
              right={<Button name="Экспорт CSV" onClick={handleExport} />}
            />
          </ContentHeader>

          <SectionCard className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="tablet:grid-cols-3 mb-4 grid grid-cols-2 gap-2">
              <SurfaceCard className="rounded" paddingClassName="p-3">
                <div className="text-xs text-gray-500">Выручка</div>
                <div className="text-lg font-semibold text-green-700">
                  {formatCurrency(financeSummary.totalIncome)}
                </div>
              </SurfaceCard>
              <SurfaceCard className="rounded" paddingClassName="p-3">
                <div className="text-xs text-gray-500">Расходы</div>
                <div className="text-lg font-semibold text-red-700">
                  {formatCurrency(financeSummary.totalExpense)}
                </div>
              </SurfaceCard>
              <SurfaceCard className="rounded" paddingClassName="p-3">
                <div className="text-xs text-gray-500">Чистая прибыль</div>
                <div className="text-lg font-semibold text-blue-700">
                  {formatCurrency(financeSummary.netProfit)}
                </div>
              </SurfaceCard>
              <SurfaceCard className="rounded" paddingClassName="p-3">
                <div className="text-xs text-gray-500">Маржа</div>
                <div className="text-lg font-semibold text-gray-800">
                  {financeSummary.margin.toFixed(1)}%
                </div>
              </SurfaceCard>
              <SurfaceCard className="rounded" paddingClassName="p-3">
                <div className="text-xs text-gray-500">Налоги</div>
                <div className="text-lg font-semibold text-orange-700">
                  {formatCurrency(financeSummary.taxes)}
                </div>
              </SurfaceCard>
              <SurfaceCard className="rounded" paddingClassName="p-3">
                <div className="text-xs text-gray-500">
                  Комиссии/реферальные
                </div>
                <div className="text-lg font-semibold text-purple-700">
                  {formatCurrency(financeSummary.commissions)}
                </div>
              </SurfaceCard>
              {financeSummary.paymentLeft > 0 ? (
                <SurfaceCard className="rounded" paddingClassName="p-3">
                  {renderMetricTitle(
                    'Остаток по оплате',
                    paymentLeftEvents.length,
                    () =>
                      openEventsDetailsModal(
                        'Мероприятия с остатком по оплате',
                        paymentLeftEvents
                      )
                  )}
                  <div className="text-lg font-semibold text-amber-700">
                    {formatCurrency(financeSummary.paymentLeft)}
                  </div>
                </SurfaceCard>
              ) : null}
              {financeSummary.depositPaid > 0 ? (
                <SurfaceCard className="rounded" paddingClassName="p-3">
                  {renderMetricTitle('Задаток', depositPaidEvents.length, () =>
                    openEventsDetailsModal(
                      'Предстоящие мероприятия с оплатами',
                      depositPaidEvents
                    )
                  )}
                  <div className="text-lg font-semibold text-cyan-700">
                    {formatCurrency(financeSummary.depositPaid)}
                  </div>
                </SurfaceCard>
              ) : null}
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-gray-700">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-blue-600" />
                <span>Прибыль</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded bg-red-600" />
                <span>Недооплачено</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="h-4 w-6 rounded-sm border border-blue-500"
                  style={{
                    background:
                      'repeating-linear-gradient(135deg, #2563eb 0, #2563eb 8px, rgba(255,255,255,0.94) 8px, rgba(255,255,255,0.94) 10px)',
                  }}
                />
                <span>Текущий месяц (в работе)</span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className="h-4 w-6 rounded-sm border border-blue-500"
                  style={{
                    background:
                      'repeating-linear-gradient(135deg, #2563eb 0, #2563eb 3px, rgba(255,255,255,0.94) 3px, rgba(255,255,255,0.94) 6px)',
                  }}
                />
                <span>Будущие месяцы</span>
              </div>
            </div>
            {stats.length === 0 ? (
              <EmptyState
                bordered={false}
                text={
                  selectedYear
                    ? 'Нет данных для выбранных фильтров'
                    : 'Нет данных для статистики'
                }
              />
            ) : (
              <div ref={chartContainerRef} className="h-[320px]">
                {chartWidth > 0 ? (
                  <Bar
                    width={chartWidth}
                    height={320}
                    data={stats}
                    keys={['profit', 'paymentLeft']}
                    indexBy="month"
                    margin={{ top: 20, right: 20, bottom: 60, left: 70 }}
                    padding={0.2}
                    colors={({ id }) =>
                      id === 'paymentLeft' ? '#dc2626' : '#2563eb'
                    }
                    defs={[
                      {
                        id: 'futurePattern',
                        type: 'patternLines',
                        background: 'inherit',
                        color: 'rgba(255,255,255,0.9)',
                        rotation: -45,
                        lineWidth: 3,
                        spacing: 6,
                      },
                      {
                        id: 'openMonthPattern',
                        type: 'patternLines',
                        background: 'inherit',
                        color: 'rgba(255,255,255,0.82)',
                        rotation: -45,
                        lineWidth: 2,
                        spacing: 10,
                      },
                    ]}
                    fill={[
                      {
                        match: (d) =>
                          Boolean(
                            d?.data?.isOpenMonth ?? d?.data?.data?.isOpenMonth
                          ) &&
                          !Boolean(
                            d?.data?.isFuture ?? d?.data?.data?.isFuture
                          ),
                        id: 'openMonthPattern',
                      },
                      {
                        match: (d) =>
                          Boolean(d?.data?.isFuture ?? d?.data?.data?.isFuture),
                        id: 'futurePattern',
                      },
                    ]}
                    axisBottom={{
                      tickSize: 5,
                      tickPadding: 5,
                      tickRotation: -20,
                    }}
                    axisLeft={{
                      tickSize: 5,
                      tickPadding: 5,
                      legend: 'Сумма, руб.',
                      legendPosition: 'middle',
                      legendOffset: -55,
                    }}
                    enableLabel={false}
                    groupMode="stacked"
                    valueFormat={(value) => value.toLocaleString('ru-RU')}
                    tooltip={({ id, value, indexValue }) => (
                      <div className="statistics-tooltip rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 shadow">
                        <div className="font-semibold">{indexValue}</div>
                        <div>
                          {id === 'profit' ? 'Прибыль' : 'Недооплачено'}:{' '}
                          {Number(value).toLocaleString('ru-RU')} ₽
                        </div>
                      </div>
                    )}
                    theme={{
                      text: { fontSize: 12, fill: '#374151' },
                      axis: {
                        legend: { text: { fontSize: 12, fill: '#374151' } },
                        ticks: {
                          text: { fontSize: 11, fill: '#6b7280' },
                        },
                      },
                      grid: {
                        line: { stroke: '#e5e7eb', strokeWidth: 1 },
                      },
                    }}
                  />
                ) : null}
              </div>
            )}

            <div className="desktop:grid-cols-2 mt-4 grid grid-cols-1 gap-3">
              <SurfaceCard className="rounded" paddingClassName="p-3">
                <div className="mb-2 text-sm font-semibold text-gray-700">
                  Топ расходов по категориям
                </div>
                {topExpenseCategories.length === 0 ? (
                  <div className="text-sm text-gray-500">Нет расходов</div>
                ) : (
                  <div className="space-y-1 text-sm">
                    {topExpenseCategories.map((item) => (
                      <div
                        key={item.category}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate">{item.label}</span>
                        <span className="font-semibold">
                          {formatCurrency(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </SurfaceCard>

              <SurfaceCard className="rounded" paddingClassName="p-3">
                <div className="mb-2 text-sm font-semibold text-gray-700">
                  Самые прибыльные мероприятия
                </div>
                {topProfitableEvents.length === 0 ? (
                  <div className="text-sm text-gray-500">Нет мероприятий</div>
                ) : (
                  <div className="space-y-2 text-sm">
                    {topProfitableEvents.map(({ event, profit }) => (
                      <div
                        key={event?._id}
                        className="border-b border-gray-100 pb-2 last:border-b-0"
                      >
                        <div className="font-medium">
                          {resolveEventTitle(event) ||
                            'Мероприятие без названия'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {formatDateTime(event?.eventDate)} •{' '}
                          {getEventStatusLabel(getEventComputedStatus(event))}
                        </div>
                        <div
                          className={`font-semibold ${profit >= 0 ? 'text-green-700' : 'text-red-700'}`}
                        >
                          {formatCurrency(profit)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </SurfaceCard>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  )
}

export default StatisticsContent
