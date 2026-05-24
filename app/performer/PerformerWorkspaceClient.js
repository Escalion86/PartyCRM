'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const formatDateTime = (value) => {
  if (!value) return 'Дата не указана'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Дата не указана'
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatMoney = (value) =>
  `${Number(value || 0).toLocaleString('ru-RU')} ₽`

const confirmationLabels = {
  pending: 'Ждет подтверждения',
  confirmed: 'Участие подтверждено',
  declined: 'Участие отклонено',
  done: 'Выполнено',
}

const statusFilters = [
  { value: 'all', label: 'Все' },
  { value: 'pending', label: 'Ожидают' },
  { value: 'confirmed', label: 'Подтверждены' },
  { value: 'done', label: 'Выполнены' },
  { value: 'declined', label: 'Отклонены' },
]

const primaryButtonClass =
  'px-4 py-2 text-sm font-semibold text-white transition-colors rounded-md cursor-pointer bg-sky-600 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60'

const secondaryButtonClass =
  'px-4 py-2 text-sm font-semibold transition-colors bg-white border rounded-md cursor-pointer text-sky-700 border-sky-200 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60'

const getAddressText = (order) => {
  if (order.placeType === 'client_address') {
    return order.customAddress || 'Выездной адрес не указан'
  }
  const address = order.location?.address
  const addressText = address
    ? [address.town, address.street, address.house, address.room]
        .filter(Boolean)
        .join(', ')
    : ''
  return [order.location?.title, addressText].filter(Boolean).join(' · ') ||
    'Точка не указана'
}

export default function PerformerWorkspaceClient() {
  const [orders, setOrders] = useState([])
  const [linkRequests, setLinkRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingOrderId, setSavingOrderId] = useState('')
  const [savingLinkRequestId, setSavingLinkRequestId] = useState('')
  const [error, setError] = useState('')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [ordersResponse, linkRequestsResponse] = await Promise.all([
        apiJson('/api/party/performer/orders', {
          cache: 'no-store',
        }),
        apiJson('/api/party/performer/link-requests', {
          cache: 'no-store',
        }),
      ])
      setOrders(ordersResponse.data ?? [])
      setLinkRequests(linkRequestsResponse.data ?? [])
    } catch (loadError) {
      setError(loadError.message || 'Не удалось загрузить кабинет исполнителя')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const companyOptions = useMemo(() => {
    const companies = new Map()
    orders.forEach((order) => {
      if (!order.companyId) return
      companies.set(order.companyId, order.companyTitle || 'Компания')
    })
    return [...companies.entries()].map(([companyId, title]) => ({
      companyId,
      title,
    }))
  }, [orders])

  const companyFilteredOrders = useMemo(() => {
    if (companyFilter === 'all') return orders
    return orders.filter((order) => order.companyId === companyFilter)
  }, [companyFilter, orders])

  const statusFilterCounts = useMemo(() => {
    const counts = statusFilters.reduce(
      (result, filter) => ({ ...result, [filter.value]: 0 }),
      {}
    )
    counts.all = companyFilteredOrders.length
    companyFilteredOrders.forEach((order) => {
      const status = order.assignment?.confirmationStatus || 'pending'
      counts[status] = (counts[status] || 0) + 1
    })
    return counts
  }, [companyFilteredOrders])

  const filteredOrders = useMemo(() => {
    if (statusFilter === 'all') return companyFilteredOrders
    return companyFilteredOrders.filter(
      (order) =>
        (order.assignment?.confirmationStatus || 'pending') === statusFilter
    )
  }, [companyFilteredOrders, statusFilter])

  const payoutTotal = useMemo(
    () =>
      filteredOrders.reduce(
        (sum, order) => sum + Number(order.assignment?.payoutAmount || 0),
        0
      ),
    [filteredOrders]
  )

  const updateConfirmationStatus = async ({
    orderId,
    staffId,
    confirmationStatus,
  }) => {
    setSavingOrderId(`${orderId}:${staffId}`)
    setError('')
    try {
      const response = await apiJson(
        `/api/party/performer/orders/${orderId}/status`,
        {
          method: 'PATCH',
          body: JSON.stringify({ staffId, confirmationStatus }),
        }
      )
      setOrders((items) =>
        items.map((order) =>
          order._id === orderId && order.staffId === staffId
            ? {
                ...order,
                assignment: {
                  ...order.assignment,
                  confirmationStatus: response.data.confirmationStatus,
                },
              }
            : order
        )
      )
    } catch (saveError) {
      setError(saveError.message || 'Не удалось обновить статус участия')
    } finally {
      setSavingOrderId('')
    }
  }

  const updateLinkRequest = async ({ staffId, action }) => {
    setSavingLinkRequestId(staffId)
    setError('')
    try {
      await apiJson(`/api/party/performer/link-requests/${staffId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action }),
      })
      setLinkRequests((items) =>
        items.filter((request) => String(request._id) !== String(staffId))
      )
      if (action === 'confirm') {
        const ordersResponse = await apiJson('/api/party/performer/orders', {
          cache: 'no-store',
        })
        setOrders(ordersResponse.data ?? [])
      }
    } catch (saveError) {
      setError(saveError.message || 'Не удалось обновить запрос привязки')
    } finally {
      setSavingLinkRequestId('')
    }
  }

  if (loading) {
    return (
      <section className="max-w-5xl px-5 py-10 mx-auto">
        <p className="text-sm text-black/60">Загружаем заказы исполнителя...</p>
      </section>
    )
  }

  return (
    <section className="max-w-5xl px-5 py-10 mx-auto">
      <p className="text-sm font-semibold uppercase text-sky-700">
        Кабинет исполнителя
      </p>
      <h1 className="mt-3 text-3xl font-semibold font-futuraPT sm:text-4xl">
        Кабинет исполнителя
      </h1>
      <p className="max-w-2xl mt-4 leading-7 text-slate-700">
        Видны только назначенные заказы и сумма выплаты исполнителю. Полная
        клиентская смета здесь не показывается.
      </p>

      {error && (
        <div className="p-3 mt-5 text-sm border rounded-md border-danger/30 bg-danger/10 text-danger">
          {error}
        </div>
      )}

      {linkRequests.length > 0 && (
        <div className="grid gap-3 mt-8">
          <h2 className="text-xl font-semibold">Запросы на привязку</h2>
          {linkRequests.map((request) => {
            const isSaving =
              String(savingLinkRequestId) === String(request._id)
            return (
              <div
                key={request._id}
                className="p-5 bg-white border rounded-lg shadow-sm border-sky-100 shadow-sky-950/5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-sky-700">
                      {request.companyTitle || 'Компания'}
                    </p>
                    <p className="mt-1 text-lg font-semibold">
                      {request.displayName}
                    </p>
                    <p className="mt-1 text-sm text-black/60">
                      {request.phone || 'телефон не указан'}
                      {request.email ? ` · ${request.email}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        updateLinkRequest({
                          staffId: request._id,
                          action: 'confirm',
                        })
                      }
                      className={primaryButtonClass}
                    >
                      Подтвердить
                    </button>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() =>
                        updateLinkRequest({
                          staffId: request._id,
                          action: 'reject',
                        })
                      }
                      className={secondaryButtonClass}
                    >
                      Отклонить
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-8 overflow-hidden bg-white border rounded-lg shadow-sm border-sky-100 shadow-sky-950/5">
        <div className="grid gap-px bg-sky-100 sm:grid-cols-3">
          {[
            ['Компаний', `${companyOptions.length || 0}`],
            ['Назначено', `${filteredOrders.length} заказов`],
            ['К выплате', formatMoney(payoutTotal)],
          ].map(([title, value]) => (
            <div key={title} className="p-5 bg-white">
              <p className="text-sm text-black/55">{title}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </div>

      {companyOptions.length > 1 && (
        <div className="mt-5">
          <label className="grid max-w-sm gap-1 text-sm">
            <span className="font-medium text-black/65">Компания</span>
            <select
              value={companyFilter}
              onChange={(event) => setCompanyFilter(event.target.value)}
              className="h-10 px-3 bg-white border rounded-md outline-none cursor-pointer border-sky-100 focus:border-sky-500"
            >
              <option value="all">Все компании</option>
              {companyOptions.map((company) => (
                <option key={company.companyId} value={company.companyId}>
                  {company.title}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mt-5">
        {statusFilters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatusFilter(filter.value)}
            className={`px-3 py-2 text-sm font-semibold transition-colors border rounded-md cursor-pointer ${
              statusFilter === filter.value
                ? 'border-sky-600 bg-sky-600 text-white'
                : 'border-sky-100 bg-white text-slate-700 hover:bg-sky-50'
            }`}
          >
            {filter.label}
            <span
              className={`ml-2 ${
                statusFilter === filter.value ? 'text-white/80' : 'text-slate-400'
              }`}
            >
              {statusFilterCounts[filter.value] || 0}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-3 mt-6">
        {orders.length === 0 && (
          <div className="p-5 bg-white border rounded-lg shadow-sm border-sky-100 shadow-sky-950/5">
            <p className="text-sm text-black/60">
              Назначенных заказов пока нет.
            </p>
          </div>
        )}
        {orders.length > 0 && filteredOrders.length === 0 && (
          <div className="p-5 bg-white border rounded-lg shadow-sm border-sky-100 shadow-sky-950/5">
            <p className="text-sm text-black/60">
              По выбранным фильтрам назначенных заказов нет.
            </p>
          </div>
        )}
        {filteredOrders.map((order) => {
          const confirmationStatus =
            order.assignment?.confirmationStatus || 'pending'
          const orderKey = `${order._id}:${order.staffId}`
          const isSaving = savingOrderId === orderKey
          return (
            <div
              key={orderKey}
              className="p-5 bg-white border rounded-lg shadow-sm border-sky-100 shadow-sky-950/5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-sky-700">
                    {order.companyTitle || 'Компания'}
                  </p>
                  <p className="text-lg font-semibold">{order.title}</p>
                  <p className="mt-1 text-sm text-black/60">
                    {formatDateTime(order.eventDate)}
                  </p>
                  <p className="mt-1 text-sm text-black/60">
                    {getAddressText(order)}
                  </p>
                  <p className="mt-1 text-sm text-black/60">
                    Клиент: {order.client?.name || 'не указан'} ·{' '}
                    {order.client?.phone || 'телефон не указан'}
                  </p>
                  {order.adminComment && (
                    <p className="mt-2 text-sm text-black/70">
                      {order.adminComment}
                    </p>
                  )}
                </div>
                <div className="sm:text-right">
                  <p className="text-sm text-black/55">Выплата</p>
                  <p className="text-2xl font-semibold">
                    {formatMoney(order.assignment?.payoutAmount)}
                  </p>
                  <p className="mt-1 text-xs text-black/50">
                    {confirmationLabels[confirmationStatus] || confirmationStatus}
                  </p>
                  <div className="flex flex-col gap-2 mt-4 sm:items-end">
                    {confirmationStatus === 'pending' && (
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          updateConfirmationStatus({
                            orderId: order._id,
                            staffId: order.staffId,
                            confirmationStatus: 'confirmed',
                          })
                        }
                        className={primaryButtonClass}
                      >
                        Подтвердить участие
                      </button>
                    )}
                    {confirmationStatus !== 'done' && (
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() =>
                          updateConfirmationStatus({
                            orderId: order._id,
                            staffId: order.staffId,
                            confirmationStatus: 'done',
                          })
                        }
                        className={secondaryButtonClass}
                      >
                        Отметить выполненным
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
