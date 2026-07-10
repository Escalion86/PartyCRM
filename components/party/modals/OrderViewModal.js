'use client'

import { useState } from 'react'
import Modal from '@components/Modal'
import ContactsIconsButtons from '@components/ContactsIconsButtons'
import { formatMoney } from '@helpers/formatMoney'
import getPersonFullName from '@helpers/getPersonFullName'
import { ClientViewModal } from '@components/party/modals/ClientModal'
import {
  AdditionalEventCard,
  AdditionalEventEditModal,
  formatDateTimeLocalValue,
  isAdminStaff,
} from '@components/party/modals/OrderAdditionalEventsModal'
import {
  getOrderNonPayoutExpenseTotal,
  getOrderPaymentState,
  getPartyAssignmentPayoutState,
  getPartyDerivedPayoutStatusLabel,
} from '@helpers/partyOrderTransactions'

const ORDER_STATUS_LABELS = {
  draft: 'Заявка',
  active: 'Подтвержден',
  canceled: 'Отменен',
  closed: 'Закрыт',
}

const PLACE_TYPE_LABELS = {
  company_location: 'Точка компании',
  client_address: 'Выезд к клиенту',
}

const REPORT_STATUS_LABELS = {
  draft: 'Черновик',
  submitted: 'На проверке',
  accepted: 'Принят',
  revision_requested: 'Нужны правки',
}

const ASSIGNMENT_STATUS_META = {
  pending: {
    label: 'Ждет подтверждения',
    shortLabel: 'Ждет',
    className: 'bg-amber-100 text-amber-700',
  },
  confirmed: {
    label: 'Участие подтверждено',
    shortLabel: 'Подтвердил',
    className: 'bg-emerald-100 text-emerald-700',
  },
  declined: {
    label: 'Участие отклонено',
    shortLabel: 'Отказ',
    className: 'bg-red-100 text-red-700',
  },
  done: {
    label: 'Выполнено',
    shortLabel: 'Выполнено',
    className: 'bg-sky-100 text-sky-700',
  },
}

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

const Section = ({ title, children }) => (
  <section className="rounded-lg border border-sky-100 bg-white p-3">
    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
      {title}
    </div>
    {children}
  </section>
)

const InfoLine = ({ label, children }) => (
  <div className="grid gap-1 text-sm sm:grid-cols-[9rem_1fr]">
    <div className="font-semibold text-slate-500">{label}</div>
    <div className="min-w-0 break-words text-slate-900">{children || '-'}</div>
  </div>
)

const getOrderContractAmount = (order) =>
  Number(order?.contractAmount ?? order?.clientPayment?.totalAmount ?? 0)

const getOrderPayoutTotal = (order) =>
  (order?.assignedStaff ?? []).reduce(
    (sum, item) => sum + Number(item?.payoutAmount || 0),
    0
  )

const formatClientContactLines = (client) => {
  if (!client || typeof client !== 'object') return []
  const lines = []
  if (client?.phone) lines.push(`Телефон: ${client.phone}`)
  if (client?.whatsapp) lines.push(`WhatsApp: ${client.whatsapp}`)
  if (client?.viber) lines.push(`Viber: ${client.viber}`)
  if (client?.telegram) lines.push(`Telegram: ${client.telegram}`)
  if (client?.instagram) lines.push(`Instagram: ${client.instagram}`)
  if (client?.vk) lines.push(`VK: ${client.vk}`)
  if (client?.email) lines.push(`Email: ${client.email}`)
  return lines
}

const getOrderClient = (order, clientsById) => {
  const client = order?.clientId
    ? clientsById.get(String(order.clientId))
    : null

  if (client) return client

  return {
    firstName: order?.client?.name || '',
    phone: order?.client?.phone || '',
    email: order?.client?.email || '',
  }
}

const getOrderContacts = (order, clientsById) => {
  const mainClient = getOrderClient(order, clientsById)
  const contacts = [
    {
      client: mainClient,
      label: 'Клиент',
      name: getPersonFullName(mainClient, { fallback: 'Не указан' }),
      comment: '',
    },
  ]

  ;(Array.isArray(order?.otherContacts) ? order.otherContacts : []).forEach(
    (contact) => {
      const contactClient = contact?.clientId
        ? clientsById.get(String(contact.clientId))
        : null
      if (!contactClient) return
      contacts.push({
        client: contactClient,
        label: contact.comment || 'Контакт',
        name: getPersonFullName(contactClient, { fallback: 'Без имени' }),
        comment: contact.comment || '',
      })
    }
  )

  return contacts
}

const ContactCard = ({ contact, onView }) => {
  const isClickable = Boolean(contact?.client?._id && onView)

  return (
    <div
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      className={`rounded-lg border border-slate-100 bg-slate-50 p-2 text-sm ${
        isClickable
          ? 'cursor-pointer transition hover:border-sky-200 hover:bg-white hover:shadow-sm focus:ring-2 focus:ring-sky-200 focus:outline-none'
          : ''
      }`}
      onClick={() => onView?.(contact.client)}
      onKeyDown={(event) => {
        if (!isClickable) return
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onView?.(contact.client)
      }}
    >
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="font-semibold text-slate-500">{contact.label}:</span>
      <span className="min-w-0 font-semibold break-words text-slate-900">
        {contact.name}
      </span>
      <ContactsIconsButtons
        user={contact.client}
        showChat
        className="my-0 shrink-0"
      />
    </div>
    {formatClientContactLines(contact.client).map((line) => (
      <div key={line} className="mt-0.5 text-xs text-slate-600">
        {line}
      </div>
    ))}
    </div>
  )
}

const getStaffLabel = (staffMember) =>
  [staffMember?.secondName, staffMember?.firstName].filter(Boolean).join(' ') ||
  staffMember?.phone ||
  staffMember?.email ||
  'Без имени'

const getAssignmentStatusMeta = (status) =>
  ASSIGNMENT_STATUS_META[status] || ASSIGNMENT_STATUS_META.pending

const getAssignmentSummaryItems = (assignedStaff = []) => {
  const counts = assignedStaff.reduce((result, assignment) => {
    const status = assignment?.confirmationStatus || 'pending'
    result[status] = (result[status] || 0) + 1
    return result
  }, {})

  return [
    ['pending', counts.pending],
    ['confirmed', counts.confirmed],
    ['declined', counts.declined],
    ['done', counts.done],
  ]
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({
      status,
      count,
      meta: getAssignmentStatusMeta(status),
    }))
}

export default function OrderViewModal({
  open,
  order,
  locations = [],
  staff = [],
  clientsById,
  services = [],
  canManage = false,
  onClose,
  onEdit,
  onReviewReport,
  onUpdateOrder,
}) {
  const [activeAdditionalEvent, setActiveAdditionalEvent] = useState(null)
  const [editingAdditionalEvent, setEditingAdditionalEvent] = useState(null)
  const [editingAdditionalEventDraft, setEditingAdditionalEventDraft] =
    useState({
      title: '',
      date: '',
      description: '',
      responsibleStaffId: '',
    })
  const [viewingClient, setViewingClient] = useState(null)
  const safeClientsById = clientsById ?? new Map()
  const location = locations.find(
    (item) => String(item._id) === String(order?.locationId)
  )
  const orderContacts = getOrderContacts(order, safeClientsById)
  const mainContact = orderContacts[0]
  const otherContacts = orderContacts.slice(1)
  const serviceTitles = (order?.servicesIds ?? [])
    .map((serviceId) =>
      services.find((service) => String(service._id) === String(serviceId))
    )
    .filter(Boolean)
    .map((service) => service.title)
  const contractAmount = getOrderContractAmount(order)
  const transactions = Array.isArray(order?.transactions)
    ? order.transactions
    : []
  const paymentState = getOrderPaymentState({ contractAmount, transactions })
  const payoutTotal = getOrderPayoutTotal(order)
  const grossMargin =
    paymentState.incomeTotal -
    getOrderNonPayoutExpenseTotal(transactions) -
    payoutTotal
  const isClosed = order?.status === 'closed'
  const assignedStaff = Array.isArray(order?.assignedStaff)
    ? order.assignedStaff
    : []
  const assignmentSummaryItems = getAssignmentSummaryItems(assignedStaff)
  const additionalEvents = Array.isArray(order?.additionalEvents)
    ? order.additionalEvents
    : []
  const activeAdditionalEventItem =
    activeAdditionalEvent !== null ? additionalEvents[activeAdditionalEvent] : null
  const responsibleStaffMember = staff.find(
    (item) => String(item._id) === String(order?.responsibleStaffId)
  )
  const adminStaffOptions = staff
    .filter(isAdminStaff)
    .map((item) => ({
      value: String(item._id),
      label: getStaffLabel(item),
    }))

  const getAdditionalEventResponsibleLabel = (item) => {
    const responsibleStaffId = item?.responsibleStaffId || order?.responsibleStaffId
    if (!responsibleStaffId) return 'Не назначен'
    const person = staff.find(
      (staffMember) => String(staffMember._id) === String(responsibleStaffId)
    )
    return person ? getStaffLabel(person) : 'Администратор не найден'
  }

  const openAdditionalEvent = (index) => {
    setActiveAdditionalEvent(index)
  }

  const closeAdditionalEvent = () => {
    setActiveAdditionalEvent(null)
  }

  const openClientView = (client) => {
    if (!client?._id) return
    setViewingClient(client)
  }

  const openAdditionalEventEditor = (index) => {
    const target = additionalEvents[index]
    if (!target || !canManage || isClosed) return
    setActiveAdditionalEvent(null)
    setEditingAdditionalEvent(index)
    setEditingAdditionalEventDraft({
      title: target?.title || '',
      date: formatDateTimeLocalValue(target?.date),
      description: target?.description || '',
      responsibleStaffId: target?.responsibleStaffId || '',
    })
  }

  const closeAdditionalEventEditor = () => {
    setEditingAdditionalEvent(null)
    setEditingAdditionalEventDraft({
      title: '',
      date: '',
      description: '',
      responsibleStaffId: '',
    })
  }

  const toggleAdditionalEventDone = async (index) => {
    if (!order?._id) return
    const target = additionalEvents[index]
    if (!target) return
    const nextDone = !Boolean(target.done)
    const nextAdditionalEvents = additionalEvents.map((item, itemIndex) =>
      itemIndex === index
        ? {
            ...item,
            done: nextDone,
            doneAt: nextDone ? new Date().toISOString() : null,
          }
        : item
    )
    await onUpdateOrder?.({ ...order, additionalEvents: nextAdditionalEvents })
  }

  const saveAdditionalEventEdit = async () => {
    if (!order?._id || editingAdditionalEvent === null) return
    const target = additionalEvents[editingAdditionalEvent]
    if (!target) return
    const nextAdditionalEvents = additionalEvents.map((item, itemIndex) =>
      itemIndex === editingAdditionalEvent
        ? {
            ...item,
            title: editingAdditionalEventDraft.title,
            date: editingAdditionalEventDraft.date
              ? new Date(editingAdditionalEventDraft.date).toISOString()
              : null,
            description: editingAdditionalEventDraft.description,
            responsibleStaffId:
              editingAdditionalEventDraft.responsibleStaffId || '',
          }
        : item
    )
    await onUpdateOrder?.({ ...order, additionalEvents: nextAdditionalEvents })
    closeAdditionalEventEditor()
  }

  const footer = (
    <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        className="cursor-pointer rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        onClick={onClose}
      >
        Закрыть
      </button>
      {canManage && !isClosed ? (
        <button
          type="button"
          className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
          onClick={onEdit}
        >
          Редактировать
        </button>
      ) : null}
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Просмотр заказа"
      tone="party"
      size="full"
      footer={footer}
    >
      <div className="flex flex-col gap-3">
        <Section title="Заказ">
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold break-words text-slate-950">
                  {order?.title || order?.serviceTitle || 'Заказ'}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Создано: {formatDateTime(order?.createdAt)}
                </p>
              </div>
              <span className="rounded bg-sky-100 px-2 py-1 text-xs font-semibold text-sky-700">
                {ORDER_STATUS_LABELS[order?.status] || order?.status || 'Статус не указан'}
              </span>
            </div>
            <InfoLine label="Дата и время">{formatDateTime(order?.eventDate)}</InfoLine>
            <InfoLine label="Длительность">
              {order?.durationMinutes ? `${order.durationMinutes} мин` : '-'}
            </InfoLine>
            <InfoLine label="Формат">
              {PLACE_TYPE_LABELS[order?.placeType] || 'Не указан'}
            </InfoLine>
            <InfoLine label="Место">
              {order?.placeType === 'company_location'
                ? location?.title || 'Точка не выбрана'
                : order?.customAddress || 'Выездной адрес не указан'}
            </InfoLine>
            <InfoLine label="Ответственный">
              {order?.responsibleStaffId
                ? responsibleStaffMember
                  ? getStaffLabel(responsibleStaffMember)
                  : 'Администратор не найден'
                : 'Не назначен'}
            </InfoLine>
            {order?.adminComment ? (
              <InfoLine label="Комментарий">{order.adminComment}</InfoLine>
            ) : null}
            {order?.performerComment ? (
              <InfoLine label="Для исполнителя">
                {order.performerComment}
              </InfoLine>
            ) : null}
          </div>
        </Section>

        <Section title="Клиент">
          <div className="grid gap-2">
            <ContactCard contact={mainContact} onView={openClientView} />
            {otherContacts.length > 0 ? (
              <div className="grid gap-2">
                <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Доп. контакты
                </div>
                {otherContacts.map((contact) => (
                  <ContactCard
                    key={`${contact.client?._id || contact.name}-${contact.label}`}
                    contact={contact}
                    onView={openClientView}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </Section>

        <Section title="Услуги">
          {serviceTitles.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {serviceTitles.map((title) => (
                <span
                  key={title}
                  className="rounded bg-sky-50 px-2 py-1 text-sm font-semibold text-sky-800"
                >
                  {title}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Услуги не указаны.</p>
          )}
        </Section>

        <Section title="Команда">
          {assignedStaff.length > 0 ? (
            <div className="grid gap-2">
              <div className="flex flex-wrap gap-2">
                {assignmentSummaryItems.map((item) => (
                  <span
                    key={item.status}
                    className={`rounded px-2 py-1 text-xs font-semibold ${item.meta.className}`}
                  >
                    {item.meta.shortLabel}: {item.count}
                  </span>
                ))}
              </div>
              {assignedStaff.map((assignment) => {
                const staffMember = staff.find(
                  (item) => String(item._id) === String(assignment.staffId)
                )
                const statusMeta = getAssignmentStatusMeta(
                  assignment.confirmationStatus
                )
                const payoutState = getPartyAssignmentPayoutState({
                  assignment,
                  transactions,
                })
                return (
                  <div
                    key={assignment.staffId}
                    className="rounded-md border border-slate-100 bg-slate-50 p-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900">
                        {getStaffLabel(staffMember)}
                      </div>
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${statusMeta.className}`}
                      >
                        {statusMeta.shortLabel}
                      </span>
                    </div>
                    <div className="mt-1 text-slate-600">
                      Участие: {statusMeta.label}
                    </div>
                    <div className="mt-1 text-slate-600">
                      Выплата: {formatMoney(Number(assignment.payoutAmount || 0))}
                      {' · '}
                      {getPartyDerivedPayoutStatusLabel(payoutState.status)}
                      {payoutState.payoutAmount > 0
                        ? ` (${formatMoney(payoutState.paidAmount)} из ${formatMoney(
                            payoutState.payoutAmount
                          )})`
                        : ''}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Исполнители не назначены.</p>
          )}
        </Section>

        <Section title="Отчеты исполнителей">
          {assignedStaff.length > 0 ? (
            <div className="grid gap-2">
              {assignedStaff.map((assignment) => {
                const staffMember = staff.find(
                  (item) => String(item._id) === String(assignment.staffId)
                )
                const report = assignment.report || {}
                const files = Array.isArray(report.files) ? report.files : []
                return (
                  <div
                    key={`report-${assignment.staffId}`}
                    className="rounded-md border border-slate-100 bg-slate-50 p-2 text-sm"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="font-semibold text-slate-900">
                        {getStaffLabel(staffMember)}
                      </div>
                      <span className="rounded bg-white px-2 py-0.5 text-xs font-semibold text-slate-600">
                        {REPORT_STATUS_LABELS[report.status] || 'Ждет отчет'}
                      </span>
                    </div>
                    {report.text ? (
                      <div className="mt-2 whitespace-pre-wrap text-slate-700">
                        {report.text}
                      </div>
                    ) : (
                      <p className="mt-2 text-slate-500">Отчет еще не отправлен.</p>
                    )}
                    {files.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {files.map((file) => (
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
                    {report.reviewComment ? (
                      <div className="mt-2 rounded bg-white p-2 text-xs text-slate-600">
                        Комментарий проверки: {report.reviewComment}
                      </div>
                    ) : null}
                    {canManage && report.status === 'submitted' ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="cursor-pointer rounded bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                          onClick={() =>
                            onReviewReport?.({
                              orderId: order._id,
                              staffId: assignment.staffId,
                              status: 'accepted',
                            })
                          }
                        >
                          Принять
                        </button>
                        <button
                          type="button"
                          className="cursor-pointer rounded border border-orange-200 bg-white px-3 py-1.5 text-xs font-semibold text-orange-700 transition hover:bg-orange-50"
                          onClick={() => {
                            const reviewComment = window.prompt(
                              'Что нужно исправить в отчете?',
                              report.reviewComment || ''
                            )
                            if (reviewComment === null) return
                            onReviewReport?.({
                              orderId: order._id,
                              staffId: assignment.staffId,
                              status: 'revision_requested',
                              reviewComment,
                            })
                          }}
                        >
                          Запросить правки
                        </button>
                      </div>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Исполнители не назначены.</p>
          )}
        </Section>

        <Section title="Финансы">
          <div className="grid grid-cols-2 gap-2 text-sm md:grid-cols-3">
            <InfoLine label="Договор">{formatMoney(contractAmount)}</InfoLine>
            <InfoLine label="Получено">{formatMoney(paymentState.incomeTotal)}</InfoLine>
            <InfoLine label="Остаток">{formatMoney(paymentState.balanceDue)}</InfoLine>
            <InfoLine label="Расходы">{formatMoney(paymentState.expenseTotal)}</InfoLine>
            <InfoLine label="Выплаты">{formatMoney(payoutTotal)}</InfoLine>
            <InfoLine label="Маржа">{formatMoney(grossMargin)}</InfoLine>
          </div>
        </Section>

        <Section title="Доп. события">
          {additionalEvents.length > 0 ? (
            <div className="grid gap-2">
              {additionalEvents.map((item, index) => (
                <AdditionalEventCard
                  key={`${item?.title || 'event'}-${index}`}
                  item={item}
                  index={index}
                  canManage={canManage && !isClosed}
                  disabled={isClosed}
                  responsibleLabel={getAdditionalEventResponsibleLabel(item)}
                  onOpen={openAdditionalEvent}
                  onToggleDone={toggleAdditionalEventDone}
                  onEdit={openAdditionalEventEditor}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Дополнительные события не добавлены.</p>
          )}
        </Section>
      </div>

      {activeAdditionalEventItem ? (
        <Modal
          open={true}
          onClose={closeAdditionalEvent}
          title={activeAdditionalEventItem.title || 'Доп. событие'}
          tone="party"
          size="sm"
          footer={
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="cursor-pointer rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                onClick={closeAdditionalEvent}
              >
                Закрыть
              </button>
              {canManage && !isClosed ? (
                <button
                  type="button"
                  className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
                  onClick={() => toggleAdditionalEventDone(activeAdditionalEvent)}
                >
                  {activeAdditionalEventItem.done ? 'Вернуть в работу' : 'Выполнено'}
                </button>
              ) : null}
            </div>
          }
        >
          <div className="grid gap-3 text-sm">
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Статус
              </div>
              <div
                className={`mt-1 font-semibold ${
                  activeAdditionalEventItem.done
                    ? 'text-emerald-700'
                    : 'text-sky-700'
                }`}
              >
                {activeAdditionalEventItem.done ? 'Выполнено' : 'Открыто'}
              </div>
            </div>
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Дата и время
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {formatDateTime(activeAdditionalEventItem.date)}
              </div>
            </div>
            {activeAdditionalEventItem.description ? (
              <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                  Описание
                </div>
                <div className="mt-1 whitespace-pre-wrap text-slate-700">
                  {activeAdditionalEventItem.description}
                </div>
              </div>
            ) : null}
            <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Ответственный
              </div>
              <div className="mt-1 font-semibold text-slate-900">
                {getAdditionalEventResponsibleLabel(activeAdditionalEventItem)}
              </div>
            </div>
          </div>
        </Modal>
      ) : null}

      {editingAdditionalEvent !== null ? (
        <AdditionalEventEditModal
          open={true}
          title="Редактировать доп. событие"
          draft={editingAdditionalEventDraft}
          setDraft={setEditingAdditionalEventDraft}
          adminStaffOptions={adminStaffOptions}
          onClose={closeAdditionalEventEditor}
          onSubmit={saveAdditionalEventEdit}
        />
      ) : null}

      {viewingClient ? (
        <ClientViewModal
          open={true}
          client={viewingClient}
          canManage={false}
          onClose={() => setViewingClient(null)}
        />
      ) : null}
    </Modal>
  )
}
