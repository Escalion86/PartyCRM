'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import ContactsIconsButtons from '@components/ContactsIconsButtons'
import Modal from '@components/Modal'
import { apiJson } from '@helpers/apiClient'
import getPersonFullName from '@helpers/getPersonFullName'
import { isPushSupported, syncPushSubscription } from '@helpers/pushClient'

const PartyOrderReports = dynamic(
  () => import('@components/party/reports/PartyOrderReports')
)
const PartyOrderPreparationPanel = dynamic(
  () => import('@components/party/orders/PartyOrderPreparationPanel')
)
const PartyFinancialSettlementsPanel = dynamic(
  () => import('@components/party/finance/PartyFinancialSettlementsPanel')
)
const PartyFinancialTasksPanel = dynamic(
  () => import('@components/party/finance/PartyFinancialTasksPanel')
)

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

const formatMoney = (value) => `${Number(value || 0).toLocaleString('ru-RU')} ₽`

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
  return (
    [order.location?.title, addressText].filter(Boolean).join(' · ') ||
    'Точка не указана'
  )
}

const formatCompanyTitle = (title) =>
  title ? `Компания "${title}"` : 'Компания'

const isOrderStarted = (order) => {
  const eventDate = order?.eventDate ? new Date(order.eventDate) : null
  return Boolean(
    eventDate &&
    !Number.isNaN(eventDate.getTime()) &&
    eventDate.getTime() <= Date.now()
  )
}

const getClientName = (client) =>
  getPersonFullName(client, { fallback: client?.name || 'не указан' })

const getContactName = (person, fallback = 'не указан') =>
  getPersonFullName(person, { fallback: person?.name || fallback })

const reportStatusLabels = {
  draft: 'Черновик',
  submitted: 'На проверке',
  revision_requested: 'Нужны правки',
  accepted: 'Принят',
}

const canEditReport = (order) => isOrderStarted(order)

const getReportAccessMessage = (order) => {
  if (canEditReport(order)) return ''
  return 'Отчет будет доступен после начала заказа.'
}

const DetailSection = ({ title, children }) => (
  <section className="rounded-lg border border-sky-100 bg-white p-3">
    <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
      {title}
    </div>
    {children}
  </section>
)

const DetailLine = ({ label, children }) => (
  <div className="grid gap-1 text-sm sm:grid-cols-[9rem_1fr]">
    <div className="font-semibold text-slate-500">{label}</div>
    <div className="min-w-0 break-words text-slate-900">{children || '-'}</div>
  </div>
)

const PerformerReportEditor = ({
  report,
  reportDraft,
  canSubmitReport,
  reportAccessMessage,
  isSavingReport,
  onDraftChange,
  onSubmit,
}) => {
  const reportFiles = Array.isArray(report?.files) ? report.files : []

  return (
    <div className="grid gap-3 rounded-lg border border-sky-100 bg-sky-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800">Отчет по заказу</p>
        <span className="rounded bg-white px-2 py-1 text-xs font-semibold text-slate-600">
          {reportStatusLabels[report?.status] || 'Черновик'}
        </span>
      </div>
      {report?.reviewComment ? (
        <p className="rounded bg-white p-2 text-xs text-orange-700">
          Комментарий: {report.reviewComment}
        </p>
      ) : null}
      {!canSubmitReport ? (
        <p className="rounded bg-white p-2 text-sm text-slate-600">
          {reportAccessMessage}
        </p>
      ) : (
        <>
          <textarea
            value={reportDraft.text}
            onChange={(event) => onDraftChange({ text: event.target.value })}
            rows={4}
            className="w-full resize-y rounded-md border border-sky-100 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500"
            placeholder="Напишите, как прошло мероприятие, что выполнено и что важно знать менеджеру."
            disabled={report?.status === 'accepted'}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={reportDraft.fileName}
              onChange={(event) =>
                onDraftChange({ fileName: event.target.value })
              }
              className="h-10 rounded-md border border-sky-100 bg-white px-3 text-sm outline-none focus:border-sky-500"
              placeholder="Название файла"
              disabled={report?.status === 'accepted'}
            />
            <input
              value={reportDraft.fileUrl}
              onChange={(event) =>
                onDraftChange({ fileUrl: event.target.value })
              }
              className="h-10 rounded-md border border-sky-100 bg-white px-3 text-sm outline-none focus:border-sky-500"
              placeholder="Ссылка на файл"
              disabled={report?.status === 'accepted'}
            />
          </div>
        </>
      )}
      {reportFiles.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {reportFiles.map((file) => (
            <a
              key={file._id || file.url || file.name}
              href={file.url}
              target="_blank"
              rel="noreferrer"
              className="rounded border border-sky-200 bg-white px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-50"
            >
              {file.name || 'Файл отчета'}
            </a>
          ))}
        </div>
      ) : null}
      {canSubmitReport && report?.status !== 'accepted' ? (
        <button
          type="button"
          disabled={isSavingReport}
          onClick={onSubmit}
          className={primaryButtonClass}
        >
          {isSavingReport ? 'Отправляем...' : 'Отправить отчет'}
        </button>
      ) : null}
    </div>
  )
}

const PerformerOrderViewModal = ({ order, onClose }) => {
  if (!order) return null

  const confirmationStatus = order.assignment?.confirmationStatus || 'pending'

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Просмотр заказа"
      tone="party"
      size="full"
      footer={
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={onClose}
        >
          Закрыть
        </button>
      }
    >
      <div className="grid gap-3">
        <DetailSection title="Заказ">
          <div className="grid gap-2">
            <div>
              <p className="text-sm font-semibold text-sky-700">
                {formatCompanyTitle(order.companyTitle)}
              </p>
              <h3 className="mt-1 text-xl font-semibold text-slate-950">
                {order.title || order.serviceTitle || 'Заказ'}
              </h3>
            </div>
            <DetailLine label="Дата и время">
              {formatDateTime(order.eventDate)}
            </DetailLine>
            <DetailLine label="Окончание">
              {order.dateEnd ? formatDateTime(order.dateEnd) : 'Не указано'}
            </DetailLine>
            <DetailLine label="Место">{getAddressText(order)}</DetailLine>
            <DetailLine label="Услуги">
              {order.serviceTitles?.length > 0
                ? order.serviceTitles.join(', ')
                : order.serviceTitle || 'Не указаны'}
            </DetailLine>
            {order.performerComment ? (
              <DetailLine label="Комментарий">
                {order.performerComment}
              </DetailLine>
            ) : null}
          </div>
        </DetailSection>

        <DetailSection title="Клиент">
          <div className="grid gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-semibold text-slate-500">Клиент:</span>
              <span className="font-semibold text-slate-900">
                {getClientName(order.client)}
              </span>
              <ContactsIconsButtons
                user={order.client}
                showChat
                className="my-0 shrink-0"
              />
            </div>
            {order.client?.phone ? (
              <div className="text-slate-600">
                Телефон: {order.client.phone}
              </div>
            ) : null}
            {order.client?.email ? (
              <div className="text-slate-600">Email: {order.client.email}</div>
            ) : null}
          </div>
        </DetailSection>

        {order.responsibleStaff ? (
          <DetailSection title="Ответственный">
            <div className="grid gap-2 text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold text-slate-900">
                  {getContactName(order.responsibleStaff, 'Администратор')}
                </span>
                <ContactsIconsButtons
                  user={order.responsibleStaff}
                  className="my-0 shrink-0"
                />
              </div>
              {order.responsibleStaff?.phone ? (
                <div className="text-slate-600">
                  Телефон: {order.responsibleStaff.phone}
                </div>
              ) : null}
              {order.responsibleStaff?.email ? (
                <div className="text-slate-600">
                  Email: {order.responsibleStaff.email}
                </div>
              ) : null}
            </div>
          </DetailSection>
        ) : null}

        <DetailSection title="Участие">
          <div className="grid gap-2">
            <DetailLine label="Статус">
              {confirmationLabels[confirmationStatus] || confirmationStatus}
            </DetailLine>
            <DetailLine label="Выплата">
              {formatMoney(order.assignment?.payoutAmount)}
            </DetailLine>
          </div>
        </DetailSection>

        <DetailSection title="Подготовка">
          <PartyOrderPreparationPanel
            companyId={order.companyId}
            orderId={String(order._id)}
            staffId={String(order.staffId)}
          />
        </DetailSection>

        <DetailSection title="Расчёт по празднику">
          <PartyFinancialSettlementsPanel
            companyId={order.companyId}
            orderId={String(order._id)}
            staffId={String(order.staffId)}
            assignments={[{ ...order.assignment, staffId: order.staffId }]}
            staff={[
              {
                _id: order.staffId,
                firstName: order.staffName || 'Исполнитель',
              },
            ]}
          />
        </DetailSection>

        <DetailSection title="Денежные поручения">
          <PartyFinancialTasksPanel
            companyId={order.companyId}
            orderId={String(order._id)}
            staffId={String(order.staffId)}
          />
        </DetailSection>
      </div>
    </Modal>
  )
}

const PerformerReportModal = ({
  order,
  onClose,
  reportDraft,
  onReportDraftChange,
  onSaveReport,
  isSavingReport,
  canSubmitReport,
  reportAccessMessage,
}) => {
  if (!order) return null

  const report = order.assignment?.report || {}

  return (
    <Modal
      open={true}
      onClose={onClose}
      title="Отчет по заказу"
      tone="party"
      size="lg"
      footer={
        <button
          type="button"
          className={secondaryButtonClass}
          onClick={onClose}
        >
          Закрыть
        </button>
      }
    >
      <div className="grid gap-3">
        <DetailSection title="Заказ">
          <div className="grid gap-2">
            <div>
              <p className="text-sm font-semibold text-sky-700">
                {formatCompanyTitle(order.companyTitle)}
              </p>
              <h3 className="mt-1 text-xl font-semibold text-slate-950">
                {order.title || order.serviceTitle || 'Заказ'}
              </h3>
            </div>
            <DetailLine label="Дата и время">
              {formatDateTime(order.eventDate)}
            </DetailLine>
            <DetailLine label="Окончание">
              {order.dateEnd ? formatDateTime(order.dateEnd) : 'Не указано'}
            </DetailLine>
            <DetailLine label="Место">{getAddressText(order)}</DetailLine>
            <DetailLine label="Услуги">
              {order.serviceTitles?.length > 0
                ? order.serviceTitles.join(', ')
                : order.serviceTitle || 'Не указаны'}
            </DetailLine>
            {order.performerComment ? (
              <DetailLine label="Комментарий">
                {order.performerComment}
              </DetailLine>
            ) : null}
          </div>
        </DetailSection>

        <DetailSection title="Отчет">
          <PerformerReportEditor
            report={report}
            reportDraft={reportDraft}
            canSubmitReport={canSubmitReport}
            reportAccessMessage={reportAccessMessage}
            isSavingReport={isSavingReport}
            onDraftChange={onReportDraftChange}
            onSubmit={onSaveReport}
          />
        </DetailSection>
      </div>
    </Modal>
  )
}

export default function PerformerWorkspaceClient() {
  const [orders, setOrders] = useState([])
  const [linkRequests, setLinkRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingOrderId, setSavingOrderId] = useState('')
  const [savingReportKey, setSavingReportKey] = useState('')
  const [reportDrafts, setReportDrafts] = useState({})
  const [savingLinkRequestId, setSavingLinkRequestId] = useState('')
  const [error, setError] = useState('')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [pushAvailable, setPushAvailable] = useState(false)
  const [pushPermission, setPushPermission] = useState('default')
  const [pushBusy, setPushBusy] = useState(false)
  const [pushMessage, setPushMessage] = useState('')
  const [viewingOrderKey, setViewingOrderKey] = useState('')
  const [reportOrderKey, setReportOrderKey] = useState('')
  const [formReportOrder, setFormReportOrder] = useState(null)
  const [dirtyFormReports, setDirtyFormReports] = useState({})
  const handleReportDirty = useCallback(
    (id, dirty) =>
      setDirtyFormReports((previous) => ({ ...previous, [id]: dirty })),
    []
  )

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

  useEffect(() => {
    const available = isPushSupported()
    setPushAvailable(available)
    setPushPermission(available ? Notification.permission : 'unsupported')
  }, [])

  const enablePush = async () => {
    setPushBusy(true)
    setPushMessage('')
    setError('')
    try {
      if (!isPushSupported()) {
        throw new Error('Push-уведомления не поддерживаются на этом устройстве')
      }
      const permission = await Notification.requestPermission()
      setPushPermission(permission)
      if (permission !== 'granted') {
        throw new Error('Разрешение на push-уведомления не выдано')
      }
      const result = await syncPushSubscription({
        ensureLocalSubscription: true,
        apiBasePath: '/api/party/push',
      })
      if (!result?.ok) {
        throw new Error('Не удалось создать push-подписку')
      }
      await fetch('/api/party/performer/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notifications: { pushEnabled: true } }),
      })
      setPushMessage('Push-уведомления по назначениям подключены')
    } catch (pushError) {
      setError(pushError.message || 'Не удалось подключить push-уведомления')
    } finally {
      setPushBusy(false)
    }
  }

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

  const viewingOrder = useMemo(
    () =>
      orders.find(
        (order) => `${order._id}:${order.staffId}` === viewingOrderKey
      ) || null,
    [orders, viewingOrderKey]
  )

  const reportOrder = useMemo(
    () =>
      orders.find(
        (order) => `${order._id}:${order.staffId}` === reportOrderKey
      ) || null,
    [orders, reportOrderKey]
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

  const updateReportDraft = (orderKey, patch) => {
    setReportDrafts((prev) => ({
      ...prev,
      [orderKey]: {
        ...(prev[orderKey] || {}),
        ...patch,
      },
    }))
  }

  const getReportDraft = (order) => {
    const orderKey = `${order._id}:${order.staffId}`
    const report = order.assignment?.report || {}
    return {
      text: reportDrafts[orderKey]?.text ?? report.text ?? '',
      fileName: reportDrafts[orderKey]?.fileName ?? '',
      fileUrl: reportDrafts[orderKey]?.fileUrl ?? '',
    }
  }

  const savePerformerReport = async (order) => {
    const orderKey = `${order._id}:${order.staffId}`
    const draft = getReportDraft(order)
    const files =
      draft.fileName || draft.fileUrl
        ? [{ name: draft.fileName || 'Файл отчета', url: draft.fileUrl }]
        : order.assignment?.report?.files || []
    setSavingReportKey(orderKey)
    setError('')
    try {
      const response = await apiJson(
        `/api/party/performer/orders/${order._id}/report`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            staffId: order.staffId,
            status: 'submitted',
            text: draft.text,
            files,
          }),
        }
      )
      setOrders((items) =>
        items.map((item) =>
          item._id === order._id && item.staffId === order.staffId
            ? {
                ...item,
                assignment: {
                  ...item.assignment,
                  report: response.data.report,
                },
              }
            : item
        )
      )
      setReportDrafts((prev) => ({
        ...prev,
        [orderKey]: {
          text: response.data.report?.text || '',
          fileName: '',
          fileUrl: '',
        },
      }))
    } catch (saveError) {
      setError(saveError.message || 'Не удалось отправить отчет')
    } finally {
      setSavingReportKey('')
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

  const reportOrderReportDraft = reportOrder
    ? getReportDraft(reportOrder)
    : { text: '', fileName: '', fileUrl: '' }
  const reportOrderCanSubmitReport = reportOrder && canEditReport(reportOrder)
  const reportOrderReportAccessMessage = reportOrder
    ? getReportAccessMessage(reportOrder)
    : ''
  const reportOrderIsSavingReport = reportOrder
    ? savingReportKey === `${reportOrder._id}:${reportOrder.staffId}`
    : false

  if (loading) {
    return (
      <section className="mx-auto max-w-5xl px-5 py-10">
        <p className="text-sm text-black/60">Загружаем заказы исполнителя...</p>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-5xl px-5 py-10">
      <p className="text-sm font-semibold text-sky-700 uppercase">
        Кабинет исполнителя
      </p>
      <h1 className="font-futuraPT mt-3 text-3xl font-semibold sm:text-4xl">
        Кабинет исполнителя
      </h1>
      <p className="mt-4 max-w-2xl leading-7 text-slate-700">
        Видны только назначенные заказы и сумма выплаты исполнителю. Полная
        клиентская смета здесь не показывается.
      </p>
      {error && (
        <div className="border-danger/30 bg-danger/10 text-danger mt-5 rounded-md border p-3 text-sm">
          {error}
        </div>
      )}

      {pushAvailable && pushPermission !== 'granted' && (
        <div className="mt-6 flex flex-col gap-3 rounded-lg border border-sky-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Уведомления о назначениях
            </p>
            <p className="mt-1 text-sm text-black/60">
              Включите push, чтобы получать новые назначения и изменения заказа.
            </p>
          </div>
          <button
            type="button"
            disabled={pushBusy}
            onClick={enablePush}
            className={primaryButtonClass}
          >
            {pushBusy ? 'Подключаем...' : 'Включить push'}
          </button>
        </div>
      )}

      {pushMessage && (
        <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {pushMessage}
        </div>
      )}

      {linkRequests.length > 0 && (
        <div className="mt-8 grid gap-3">
          <h2 className="text-xl font-semibold">Запросы на привязку</h2>
          {linkRequests.map((request) => {
            const isSaving = String(savingLinkRequestId) === String(request._id)
            return (
              <div
                key={request._id}
                className="rounded-lg border border-sky-100 bg-white p-5 shadow-sm shadow-sky-950/5"
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

      <div className="mt-8 overflow-hidden rounded-lg border border-sky-100 bg-white shadow-sm shadow-sky-950/5">
        <div className="grid gap-px bg-sky-100 sm:grid-cols-3">
          {[
            ['Компаний', `${companyOptions.length || 0}`],
            ['Назначено', `${filteredOrders.length} заказов`],
            ['К выплате', formatMoney(payoutTotal)],
          ].map(([title, value]) => (
            <div key={title} className="bg-white p-5">
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
              className="h-10 cursor-pointer rounded-md border border-sky-100 bg-white px-3 outline-none focus:border-sky-500"
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

      <div className="mt-5 flex flex-wrap gap-2">
        {statusFilters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            onClick={() => setStatusFilter(filter.value)}
            className={`cursor-pointer rounded-md border px-3 py-2 text-sm font-semibold transition-colors ${
              statusFilter === filter.value
                ? 'border-sky-600 bg-sky-600 text-white'
                : 'border-sky-100 bg-white text-slate-700 hover:bg-sky-50'
            }`}
          >
            {filter.label}
            <span
              className={`ml-2 ${
                statusFilter === filter.value
                  ? 'text-white/80'
                  : 'text-slate-400'
              }`}
            >
              {statusFilterCounts[filter.value] || 0}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-3">
        {orders.length === 0 && (
          <div className="rounded-lg border border-sky-100 bg-white p-5 shadow-sm shadow-sky-950/5">
            <p className="text-sm text-black/60">
              Назначенных заказов пока нет.
            </p>
          </div>
        )}
        {orders.length > 0 && filteredOrders.length === 0 && (
          <div className="rounded-lg border border-sky-100 bg-white p-5 shadow-sm shadow-sky-950/5">
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
          const hasStarted = isOrderStarted(order)
          return (
            <div
              key={orderKey}
              className="rounded-lg border border-sky-100 bg-white p-5 shadow-sm shadow-sky-950/5"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-sky-700">
                    {formatCompanyTitle(order.companyTitle)}
                  </p>
                  <p className="text-lg font-semibold">{order.title}</p>
                  <p className="mt-1 text-sm text-black/60">
                    {formatDateTime(order.eventDate)}
                  </p>
                  <p className="mt-1 text-sm text-black/60">
                    {getAddressText(order)}
                  </p>
                  {order.performerComment ? (
                    <p className="mt-2 max-w-2xl rounded bg-sky-50 p-2 text-sm whitespace-pre-wrap text-slate-700">
                      {order.performerComment}
                    </p>
                  ) : null}
                  {order.serviceTitles?.length > 0 ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-black/65">
                        Услуги:
                      </span>
                      {order.serviceTitles.map((title) => (
                        <span
                          key={title}
                          className="rounded bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-800"
                        >
                          {title}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  <div className="mt-2 flex min-h-[25px] flex-wrap items-center gap-x-2 gap-y-1 text-sm text-black/60">
                    <span className="font-medium text-black/70">Клиент:</span>
                    <span className="min-w-0 truncate">
                      {getClientName(order.client)}
                    </span>
                    <ContactsIconsButtons
                      user={order.client}
                      showChat
                      className="my-0 shrink-0"
                    />
                  </div>
                  {order.responsibleStaff ? (
                    <div className="mt-2 flex min-h-[25px] flex-wrap items-center gap-x-2 gap-y-1 text-sm text-black/60">
                      <span className="font-medium text-black/70">
                        Ответственный:
                      </span>
                      <span className="min-w-0 truncate">
                        {getContactName(
                          order.responsibleStaff,
                          'Администратор'
                        )}
                      </span>
                      <ContactsIconsButtons
                        user={order.responsibleStaff}
                        className="my-0 shrink-0"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="sm:text-right">
                  <p className="text-sm text-black/55">Выплата</p>
                  <p className="text-2xl font-semibold">
                    {formatMoney(order.assignment?.payoutAmount)}
                  </p>
                  <p className="mt-1 text-xs text-black/50">
                    {confirmationLabels[confirmationStatus] ||
                      confirmationStatus}
                  </p>
                  <div className="mt-4 flex flex-col gap-2 sm:items-end">
                    <button
                      type="button"
                      onClick={() => setViewingOrderKey(orderKey)}
                      className={secondaryButtonClass}
                    >
                      Подробнее
                    </button>
                    <button
                      type="button"
                      className={secondaryButtonClass}
                      onClick={() => {
                        setDirtyFormReports({})
                        setFormReportOrder(order)
                      }}
                    >
                      Формы отчёта
                    </button>
                    {hasStarted ? (
                      <button
                        type="button"
                        onClick={() => setReportOrderKey(orderKey)}
                        className={secondaryButtonClass}
                      >
                        Отчет
                      </button>
                    ) : null}
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
                    {confirmationStatus === 'confirmed' && hasStarted && (
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
      {formReportOrder && (
        <Modal
          open={true}
          onClose={() => setFormReportOrder(null)}
          title="Отчёты до и после мероприятия"
          tone="party"
          size="full"
          hasUnsavedChanges={Object.values(dirtyFormReports).some(Boolean)}
        >
          <PartyOrderReports
            companyId={formReportOrder.companyId}
            orderId={String(formReportOrder._id)}
            staffId={String(formReportOrder.staffId)}
            onDirtyChange={handleReportDirty}
          />
        </Modal>
      )}
      <PerformerOrderViewModal
        order={viewingOrder}
        onClose={() => setViewingOrderKey('')}
      />
      <PerformerReportModal
        order={reportOrder}
        onClose={() => setReportOrderKey('')}
        reportDraft={reportOrderReportDraft}
        onReportDraftChange={(patch) => {
          if (!reportOrder) return
          updateReportDraft(`${reportOrder._id}:${reportOrder.staffId}`, patch)
        }}
        onSaveReport={() => {
          if (!reportOrder) return
          savePerformerReport(reportOrder)
        }}
        isSavingReport={reportOrderIsSavingReport}
        canSubmitReport={Boolean(reportOrderCanSubmitReport)}
        reportAccessMessage={reportOrderReportAccessMessage}
      />
    </section>
  )
}
