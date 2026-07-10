'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import {
  faBan,
  faCalendarAlt,
  faClock,
  faEllipsisV,
  faPen,
  faPlay,
  faLock,
  faTrash,
} from '@fortawesome/free-solid-svg-icons'
import { faComments } from '@fortawesome/free-regular-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import DropDown from '@components/DropDown'
import Modal from '@components/Modal'
import ContactsIconsButtons from '@components/ContactsIconsButtons'
import PartyCard, {
  PartyCardActions,
  PartyCardHeader,
} from '@components/party/PartyCard'
import getPersonFullName from '@helpers/getPersonFullName'
import {
  getOrderNonPayoutExpenseTotal,
  getOrderPaymentState,
} from '@helpers/partyOrderTransactions'

const ORDER_STATUSES = [
  { value: 'draft', label: 'Заявка', color: 'gray', icon: faClock },
  { value: 'active', label: 'Подтверждён', color: 'blue', icon: faPlay },
  { value: 'canceled', label: 'Отменён', color: 'red', icon: faBan },
  { value: 'closed', label: 'Закрыт', color: 'green', icon: faLock },
]

const MENU_ITEM_TONE = {
  red: 'text-red-600 hover:bg-red-600 hover:text-white',
  blue: 'text-sky-700 hover:bg-sky-600 hover:text-white',
  orange: 'text-amber-700 hover:bg-amber-600 hover:text-white',
  gray: 'text-gray-600 hover:bg-gray-600 hover:text-white',
  green: 'text-emerald-700 hover:bg-emerald-600 hover:text-white',
}

const ORDER_STATUS_STRIPE_CLASSES = {
  draft: 'border-l-gray-400',
  active: 'border-l-sky-500',
  canceled: 'border-l-red-500',
  closed: 'border-l-emerald-500',
}

const ASSIGNMENT_STATUS_META = {
  pending: {
    label: 'Ждет',
    summaryLabel: 'Ждет',
    className: 'bg-amber-100 text-amber-700',
  },
  confirmed: {
    label: 'Подтвердил',
    summaryLabel: 'Подтвердили',
    className: 'bg-emerald-100 text-emerald-700',
  },
  declined: {
    label: 'Отказ',
    summaryLabel: 'Отказ',
    className: 'bg-red-100 text-red-700',
  },
  done: {
    label: 'Выполнено',
    summaryLabel: 'Выполнено',
    className: 'bg-sky-100 text-sky-700',
  },
}

const hasConnectedMessengerIntegration = (companySettings) => {
  const integrations = companySettings?.integrations ?? {}
  const vkGroups = Array.isArray(integrations.vkGroups)
    ? integrations.vkGroups
    : []

  return (
    integrations.avitoEnabled === true ||
    integrations.vkGroupEnabled === true ||
    vkGroups.some((group) => group?.enabled === true)
  )
}

const OrderActionMenuItem = ({ icon, label, color = 'blue', onClick }) => (
  <button
    type="button"
    className={`flex h-9 w-full cursor-pointer items-center gap-2 bg-white px-3 text-left text-sm font-semibold transition ${MENU_ITEM_TONE[color] || MENU_ITEM_TONE.blue}`}
    onClick={(event) => {
      event.stopPropagation()
      onClick?.()
    }}
  >
    <FontAwesomeIcon icon={icon} className="h-4 w-4 shrink-0" />
    <span className="whitespace-nowrap">{label}</span>
  </button>
)

const OrderActionMenu = ({
  order,
  statusConfig,
  onEdit,
  onStatus,
  onAdditionalEvents,
  onDelete,
}) => (
  <DropDown
    trigger={
      <button
        type="button"
        className="action-icon-button action-icon-button--neutral flex h-9 w-9 cursor-pointer items-center justify-center rounded-bl-xl text-base font-normal duration-200"
        aria-label="Открыть меню действий заказа"
        title="Действия"
      >
        <FontAwesomeIcon icon={faEllipsisV} className="h-5 w-5" />
      </button>
    }
    menuPadding={false}
    placement="right"
    renderInPortal
  >
    <div className="min-w-52 overflow-hidden rounded-lg">
      <OrderActionMenuItem
        icon={faPen}
        label="Редактировать"
        color="orange"
        onClick={() => onEdit?.(order)}
      />
      <OrderActionMenuItem
        icon={faCalendarAlt}
        label="Доп. события"
        color="blue"
        onClick={() => onAdditionalEvents?.(order)}
      />
      <OrderActionMenuItem
        icon={currentStatusIcon(order.status)}
        label={
          statusConfig
            ? `${statusConfig.label} (изменить статус)`
            : 'Изменить статус'
        }
        color={
          order.status === 'canceled'
            ? 'red'
            : order.status === 'closed'
              ? 'green'
              : order.status === 'draft'
                ? 'gray'
                : 'blue'
        }
        onClick={onStatus}
      />
      {order.status !== 'canceled' && (
        <OrderActionMenuItem
          icon={faTrash}
          label="Удалить"
          color="red"
          onClick={() => onDelete?.(order._id)}
        />
      )}
    </div>
  </DropDown>
)

const OrderStatusModal = ({ open, order, onClose, onStatusChange, saving }) => {
  const [selectedStatus, setSelectedStatus] = useState(order?.status || 'draft')

  const handleSubmit = useCallback(async () => {
    if (!order?._id || selectedStatus === order.status) {
      onClose()
      return
    }
    await onStatusChange(order._id, selectedStatus)
    onClose()
  }, [order?._id, order?.status, selectedStatus, onStatusChange, onClose])

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Статус заказа: ${order?.title || 'Заказ'}`}
      tone="party"
      size="sm"
      footer={
        <div className="flex w-full items-center justify-end gap-1">
          <button
            type="button"
            className="cursor-pointer rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            onClick={onClose}
          >
            Отмена
          </button>
          <button
            type="button"
            className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleSubmit}
            disabled={saving || selectedStatus === order?.status}
          >
            {saving ? 'Сохранение...' : 'Применить'}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm text-black/60">Выберите новый статус заказа:</p>
        <div className="flex flex-wrap gap-2">
          {ORDER_STATUSES.map((item) => {
            const isActive = item.value === selectedStatus
            const isCurrent = item.value === order?.status
            return (
              <button
                key={item.value}
                type="button"
                className={`inline-flex min-h-[36px] cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'border-sky-500 bg-sky-50 text-sky-700 shadow-sm'
                    : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                }`}
                onClick={() => setSelectedStatus(item.value)}
              >
                <span>{item.label}</span>
                {isCurrent && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                    текущий
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </Modal>
  )
}

const getOrderClient = (order, clientsById) => {
  const currentClient = order?.clientId
    ? clientsById.get(String(order.clientId))
    : null

  if (currentClient) return currentClient

  return {
    firstName: order?.client?.name || '',
    phone: order?.client?.phone || '',
    email: order?.client?.email || '',
  }
}

const OrderMessengerButton = ({ onClick }) => (
  <button
    type="button"
    className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center text-sky-600 duration-300 hover:scale-110 hover:text-sky-800"
    title="Открыть переписки заказа"
    aria-label="Открыть переписки заказа"
    onClick={(event) => {
      event.stopPropagation()
      onClick?.()
    }}
  >
    <FontAwesomeIcon icon={faComments} size="lg" />
  </button>
)

const OrderContactLine = ({ label, client, onMessenger }) => {
  const name = getPersonFullName(client, { fallback: 'не указан' })

  return (
    <div className="flex min-h-[25px] flex-wrap items-center gap-x-2 gap-y-1 text-sm text-black/60">
      <span className="font-medium text-black/70">{label}:</span>
      <span className="min-w-0 truncate">{name}</span>
      <ContactsIconsButtons user={client} showChat className="my-0 shrink-0" />
      {onMessenger ? <OrderMessengerButton onClick={onMessenger} /> : null}
    </div>
  )
}

const buildOrderOtherContacts = (order, clientsById) =>
  (order.otherContacts || [])
    .map((contact) => {
      const contactClient = contact?.clientId
        ? clientsById.get(String(contact.clientId))
        : null
      if (!contactClient) return null
      return {
        client: contactClient,
        comment: contact.comment || 'Контакт',
      }
    })
    .filter(Boolean)

const OrderContactsPopover = ({ contacts, triggerRef, onClose }) => {
  const [position, setPosition] = useState(null)

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    if (!trigger) return

    const rect = trigger.getBoundingClientRect()
    const width = Math.min(320, window.innerWidth - 24)
    const left = Math.max(
      12,
      Math.min(rect.left, window.innerWidth - width - 12)
    )

    setPosition({
      top: rect.bottom + 8,
      left,
      width,
    })
  }, [triggerRef])

  useEffect(() => {
    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }

    const handleDocumentClick = (event) => {
      if (triggerRef.current?.contains(event.target)) return
      onClose()
    }

    updatePosition()
    document.addEventListener('click', handleDocumentClick)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)

    return () => {
      document.removeEventListener('click', handleDocumentClick)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [onClose, triggerRef, updatePosition])

  if (!position) return null

  return createPortal(
    <div
      role="dialog"
      aria-label="Дополнительные контакты"
      className="z-[1000] grid gap-2 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-lg"
      style={{
        position: 'fixed',
        top: position.top,
        left: position.left,
        width: position.width,
        maxWidth: 'calc(100vw - 24px)',
      }}
      onClick={(event) => event.stopPropagation()}
    >
      {contacts.map((contact) => (
        <div
          key={`${contact.client._id}-${contact.comment}`}
          className="rounded-lg border border-gray-100 bg-gray-50 p-2"
        >
          <OrderContactLine
            label={contact.comment || 'Контакт'}
            client={contact.client}
          />
        </div>
      ))}
    </div>,
    document.body
  )
}

const OrderContactsSummary = ({ order, clientsById, onMessenger }) => {
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const triggerRef = useRef(null)
  const client = getOrderClient(order, clientsById)
  const otherContacts = buildOrderOtherContacts(order, clientsById)

  return (
    <div className="grid gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <OrderContactLine
          label="Клиент"
          client={client}
          onMessenger={onMessenger}
        />
        {otherContacts.length > 0 && (
          <button
            ref={triggerRef}
            type="button"
            className="action-icon-button inline-flex h-7 max-h-7 min-w-8 cursor-pointer items-center justify-center rounded-xl bg-amber-200 text-xs font-bold text-slate-900 shadow-sm transition hover:bg-amber-300"
            aria-label="Показать дополнительные контакты"
            onClick={(event) => {
              event.stopPropagation()
              setIsPopoverOpen((current) => !current)
            }}
          >
            +{otherContacts.length}
          </button>
        )}
      </div>
      {isPopoverOpen && otherContacts.length > 0 && (
        <OrderContactsPopover
          contacts={otherContacts}
          triggerRef={triggerRef}
          onClose={() => setIsPopoverOpen(false)}
        />
      )}
    </div>
  )
}

const OrderCommentPreview = ({ comment }) => {
  const textRef = useRef(null)
  const wrapperRef = useRef(null)
  const buttonRef = useRef(null)
  const [isOverflowing, setIsOverflowing] = useState(false)
  const [isTooltipOpen, setIsTooltipOpen] = useState(false)
  const [tooltipPosition, setTooltipPosition] = useState(null)

  useEffect(() => {
    const checkOverflow = () => {
      const textElement = textRef.current
      if (!textElement) return

      const hasOverflow = textElement.scrollWidth > textElement.clientWidth
      setIsOverflowing(hasOverflow)
      if (!hasOverflow) setIsTooltipOpen(false)
    }

    const frameId = requestAnimationFrame(checkOverflow)
    window.addEventListener('resize', checkOverflow)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', checkOverflow)
    }
  }, [comment])

  const updateTooltipPosition = useCallback(() => {
    const buttonElement = buttonRef.current
    if (!buttonElement) return

    const rect = buttonElement.getBoundingClientRect()
    const tooltipWidth = Math.min(320, window.innerWidth - 24)
    const left = Math.max(
      12,
      Math.min(rect.right - tooltipWidth, window.innerWidth - tooltipWidth - 12)
    )

    setTooltipPosition({
      top: rect.bottom + 8,
      left,
      width: tooltipWidth,
    })
  }, [])

  useEffect(() => {
    if (!isTooltipOpen) return undefined

    const handleDocumentClick = (event) => {
      if (wrapperRef.current?.contains(event.target)) return
      setIsTooltipOpen(false)
    }

    const handleEscape = (event) => {
      if (event.key === 'Escape') setIsTooltipOpen(false)
    }

    document.addEventListener('click', handleDocumentClick)
    document.addEventListener('keydown', handleEscape)
    window.addEventListener('resize', updateTooltipPosition)
    window.addEventListener('scroll', updateTooltipPosition, true)
    updateTooltipPosition()

    return () => {
      document.removeEventListener('click', handleDocumentClick)
      document.removeEventListener('keydown', handleEscape)
      window.removeEventListener('resize', updateTooltipPosition)
      window.removeEventListener('scroll', updateTooltipPosition, true)
    }
  }, [isTooltipOpen, updateTooltipPosition])

  if (!comment) return null

  return (
    <div
      ref={wrapperRef}
      className="mt-1 grid max-w-full min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-1 text-sm text-black/70"
    >
      <span className="shrink-0">Комментарий:</span>
      <span ref={textRef} className="block min-w-0 truncate">
        {comment}
      </span>
      {isOverflowing && (
        <span className="shrink-0">
          <button
            ref={buttonRef}
            type="button"
            className="cursor-pointer rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-xs leading-none font-semibold text-sky-700 transition hover:border-sky-300 hover:bg-sky-100"
            aria-label="Показать полный комментарий"
            onClick={(event) => {
              event.stopPropagation()
              updateTooltipPosition()
              setIsTooltipOpen((current) => !current)
            }}
          >
            ...
          </button>
          {isTooltipOpen &&
            tooltipPosition &&
            createPortal(
              <div
                role="tooltip"
                className="z-[1000] rounded-lg border border-sky-100 bg-white p-3 text-left text-sm text-slate-700 shadow-lg"
                style={{
                  position: 'fixed',
                  top: tooltipPosition.top,
                  left: tooltipPosition.left,
                  width: tooltipPosition.width,
                  maxWidth: 'calc(100vw - 24px)',
                }}
                onClick={(event) => event.stopPropagation()}
              >
                <p className="break-words whitespace-pre-wrap">{comment}</p>
              </div>,
              document.body
            )}
        </span>
      )}
    </div>
  )
}

const getOrderPayoutTotal = (order) =>
  (order.assignedStaff ?? []).reduce(
    (sum, item) => sum + Number(item.payoutAmount || 0),
    0
  )

const getOrderContractAmount = (order) =>
  Number(order.contractAmount ?? order.clientPayment?.totalAmount ?? 0)

const formatCardAmount = (value) => Number(value || 0).toLocaleString('ru-RU')

const OrderAmountSummary = ({
  contractAmount,
  grossMargin,
  isClosed,
  paymentState,
}) => {
  const paid = Number(paymentState.incomeTotal || 0)
  const isFullyPaid = contractAmount > 0 && paid >= contractAmount

  if (isClosed) {
    const isZero = grossMargin === 0
    return (
      <div
        className={`event-profit-badge flex shrink-0 items-center justify-center rounded-full border px-3 py-1.5 text-base font-semibold ${
          isZero ? 'event-profit-card--zero' : 'event-profit-card'
        }`}
      >
        <span
          className={isZero ? 'event-profit-text--zero' : 'event-profit-text'}
        >
          {formatCardAmount(grossMargin)}
        </span>
      </div>
    )
  }

  return (
    <div className="flex min-h-7 items-end justify-end gap-2 text-lg leading-none font-semibold whitespace-nowrap">
      {paid > 0 && contractAmount > 0 && isFullyPaid ? (
        <span className="text-green-700">{formatCardAmount(paid)}</span>
      ) : paid > 0 || contractAmount > 0 ? (
        <span>
          {paid > 0 ? (
            <span className="text-green-700">{formatCardAmount(paid)}</span>
          ) : null}
          {paid > 0 && contractAmount > 0 ? ' / ' : null}
          {contractAmount > 0 ? (
            <span className={isFullyPaid ? 'text-green-700' : 'text-blue-700'}>
              {formatCardAmount(contractAmount)}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="text-gray-400">—</span>
      )}
    </div>
  )
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

const formatAdditionalEventDate = (date, now) => {
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()

  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const isTomorrow =
    date.getFullYear() === tomorrow.getFullYear() &&
    date.getMonth() === tomorrow.getMonth() &&
    date.getDate() === tomorrow.getDate()

  const timeLabel = date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
  const prefix = isToday
    ? 'Сегодня'
    : isTomorrow
      ? 'Завтра'
      : date.toLocaleDateString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        })

  return {
    label: `${prefix} ${timeLabel}`,
    isToday,
    isTomorrow,
    isLater: !isToday && !isTomorrow,
  }
}

const getNearestAdditionalEventInfo = (order, now = new Date()) => {
  const prepared = (
    Array.isArray(order.additionalEvents) ? order.additionalEvents : []
  )
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
    (item) => item.date.getTime() < now.getTime()
  )
  if (overdueItems.length > 0) {
    const overdue = overdueItems[overdueItems.length - 1]
    return {
      title: overdue.title,
      label: formatAdditionalEventDate(overdue.date, now).label,
      isOverdue: true,
      isToday: false,
      isTomorrow: false,
      isLater: false,
      totalCount: prepared.length,
      remainingCount: prepared.length - 1,
    }
  }

  const nearest = prepared.find((item) => item.date.getTime() >= now.getTime())
  if (!nearest) return null

  const dateInfo = formatAdditionalEventDate(nearest.date, now)
  return {
    title: nearest.title,
    label: dateInfo.label,
    isOverdue: false,
    isToday: dateInfo.isToday,
    isTomorrow: dateInfo.isTomorrow,
    isLater: dateInfo.isLater,
    totalCount: prepared.length,
    remainingCount: prepared.length - 1,
  }
}

const getAdditionalStatusClassName = (info) => {
  if (!info) return ''
  if (info.isOverdue) return 'bg-red-100 text-red-700'
  if (info.isToday) return 'bg-sky-100 text-sky-700'
  if (info.isTomorrow) return 'bg-cyan-100 text-cyan-700'
  return 'bg-slate-100 text-slate-700'
}

const getReportBadges = (order) =>
  (order.assignedStaff ?? []).reduce(
    (counts, assignment) => {
      const status = assignment.report?.status
      if (!status || status === 'draft') {
        if (assignment.confirmationStatus === 'done') counts.waiting += 1
      } else if (status === 'submitted') {
        counts.submitted += 1
      } else if (status === 'revision_requested') {
        counts.revision += 1
      }
      return counts
    },
    { waiting: 0, submitted: 0, revision: 0 }
  )

const currentStatusIcon = (status) => {
  const found = ORDER_STATUSES.find((s) => s.value === status)
  return found?.icon || faClock
}

const getStaffLabel = (staffMember) =>
  [staffMember?.secondName, staffMember?.firstName].filter(Boolean).join(' ') ||
  staffMember?.phone ||
  staffMember?.email ||
  ''

const getAssignmentStatusMeta = (status) =>
  ASSIGNMENT_STATUS_META[status] || ASSIGNMENT_STATUS_META.pending

const getOrderAssignmentItems = (order, staff = []) =>
  (Array.isArray(order.assignedStaff) ? order.assignedStaff : []).map(
    (assignment) => {
      const staffMember = staff.find(
        (item) => String(item._id) === String(assignment.staffId)
      )
      return {
        staffId: String(assignment.staffId || ''),
        label: getStaffLabel(staffMember) || 'Исполнитель',
        status: assignment.confirmationStatus || 'pending',
      }
    }
  )

const getAssignmentSummaryBadge = (assignments) => {
  if (assignments.length === 0) return null

  const counts = assignments.reduce((result, assignment) => {
    result[assignment.status] = (result[assignment.status] || 0) + 1
    return result
  }, {})

  if (counts.declined > 0) {
    return {
      label: `Отказ: ${counts.declined}`,
      className: ASSIGNMENT_STATUS_META.declined.className,
    }
  }

  if (counts.pending > 0) {
    return {
      label: `Ждет: ${counts.pending}`,
      className: ASSIGNMENT_STATUS_META.pending.className,
    }
  }

  if (counts.done === assignments.length) {
    return {
      label: 'Все выполнено',
      className: ASSIGNMENT_STATUS_META.done.className,
    }
  }

  return {
    label: 'Все подтвердили',
    className: ASSIGNMENT_STATUS_META.confirmed.className,
  }
}

const OrderAssignmentsSummary = ({ assignments }) => {
  if (assignments.length === 0) return null

  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2 text-sm">
      <span className="font-medium text-black/65">Исполнители:</span>
      {assignments.map((assignment) => {
        const statusMeta = getAssignmentStatusMeta(assignment.status)
        return (
          <span
            key={`${assignment.staffId}-${assignment.status}`}
            className="inline-flex min-h-7 max-w-full items-center gap-1 rounded bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-700"
            title={`${assignment.label}: ${statusMeta.label}`}
          >
            <span className="min-w-0 truncate">{assignment.label}</span>
            <span
              className={`shrink-0 rounded px-1.5 py-0.5 ${statusMeta.className}`}
            >
              {statusMeta.label}
            </span>
          </span>
        )
      })}
    </div>
  )
}

const OrderCard = ({
  order,
  locations,
  staff,
  clientsById,
  companySettings,
  hasConflict,
  canManage,
  onCancel,
  onView,
  onEdit,
  onAdditionalEvents,
  onMessenger,
  onStatusChange,
  onDelete,
}) => {
  const [statusModalOpen, setStatusModalOpen] = useState(false)
  const location = locations.find((item) => item._id === order.locationId)
  const contractAmount = getOrderContractAmount(order)
  const transactions = Array.isArray(order.transactions)
    ? order.transactions
    : []
  const paymentState = getOrderPaymentState({
    contractAmount,
    transactions,
  })
  const payoutTotal = getOrderPayoutTotal(order)
  const grossMargin =
    paymentState.incomeTotal -
    getOrderNonPayoutExpenseTotal(transactions) -
    payoutTotal
  const nearestAdditionalEventInfo = getNearestAdditionalEventInfo(order)
  const hiddenAdditionalCount = nearestAdditionalEventInfo?.remainingCount ?? 0
  const additionalStatusClassName = getAdditionalStatusClassName(
    nearestAdditionalEventInfo
  )
  const reportBadges = getReportBadges(order)
  const statusConfig = ORDER_STATUSES.find((s) => s.value === order.status)
  const isClosed = order.status === 'closed'
  const orderTypeTitle =
    typeof order.title === 'string' && order.title.trim()
      ? order.title.trim()
      : 'Заказ'
  const responsibleStaff = (Array.isArray(staff) ? staff : []).find(
    (item) => String(item._id) === String(order.responsibleStaffId)
  )
  const responsibleLabel = getStaffLabel(responsibleStaff)
  const showMessengerButton = hasConnectedMessengerIntegration(companySettings)
  const assignmentItems = getOrderAssignmentItems(order, staff)
  const assignmentSummaryBadge = getAssignmentSummaryBadge(assignmentItems)

  return (
    <>
      <PartyCard onClick={() => onView?.(order)} className={`overflow-hidden border-l-4 ${ORDER_STATUS_STRIPE_CLASSES[order.status] || 'border-l-gray-300'}`}>
        <PartyCardHeader>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold">{orderTypeTitle}</p>
              {hasConflict && (
                <span className="shrink-0 rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                  Конфликт
                </span>
              )}
              {(order.assignedStaff ?? []).length === 0 && (
                <span className="shrink-0 rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                  Без исполнителя
                </span>
              )}
              {assignmentSummaryBadge ? (
                <span
                  className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${assignmentSummaryBadge.className}`}
                >
                  {assignmentSummaryBadge.label}
                </span>
              ) : null}
              {nearestAdditionalEventInfo ? (
                <>
                  <span
                    className={`min-w-0 shrink rounded px-2 py-1 text-xs font-semibold ${additionalStatusClassName}`}
                  >
                    <span className="block truncate">
                      {`${nearestAdditionalEventInfo.title}: ${nearestAdditionalEventInfo.label}`}
                    </span>
                  </span>
                  {hiddenAdditionalCount > 0 ? (
                    <span
                      className={`shrink-0 rounded px-2 py-1 text-xs font-semibold ${additionalStatusClassName}`}
                    >
                      +{hiddenAdditionalCount}
                    </span>
                  ) : null}
                </>
              ) : null}
              {reportBadges.waiting > 0 && (
                <span className="shrink-0 rounded bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-700">
                  Ждет отчет: {reportBadges.waiting}
                </span>
              )}
              {reportBadges.submitted > 0 && (
                <span className="shrink-0 rounded bg-violet-100 px-2 py-1 text-xs font-semibold text-violet-700">
                  Отчет на проверке: {reportBadges.submitted}
                </span>
              )}
              {reportBadges.revision > 0 && (
                <span className="shrink-0 rounded bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700">
                  Правки отчета: {reportBadges.revision}
                </span>
              )}
            </div>
            {order.serviceTitle ? (
              <p className="mt-1 truncate text-sm font-medium text-black/70">
                {order.serviceTitle}
              </p>
            ) : null}
            <p className="mt-1 text-sm text-black/60">
              {formatDateTime(order.eventDate)} ·{' '}
              {order.placeType === 'company_location'
                ? location?.title || 'Точка не выбрана'
                : order.customAddress || 'Выездной адрес не указан'}
            </p>
            {responsibleLabel ? (
              <p className="mt-1 truncate text-sm font-medium text-sky-700">
                Ответственный: {responsibleLabel}
              </p>
            ) : null}
            <OrderAssignmentsSummary assignments={assignmentItems} />
            <OrderCommentPreview comment={order.adminComment} />
            <div className="mt-3 flex flex-wrap items-end justify-between gap-2">
              <div className="min-w-0 flex-1">
                <OrderContactsSummary
                  order={order}
                  clientsById={clientsById}
                  onMessenger={
                    showMessengerButton ? () => onMessenger?.(order) : null
                  }
                />
              </div>
              <OrderAmountSummary
                contractAmount={contractAmount}
                grossMargin={grossMargin}
                isClosed={isClosed}
                paymentState={paymentState}
              />
            </div>
          </div>
          {canManage && !isClosed && (
            <PartyCardActions>
              <OrderActionMenu
                order={order}
                statusConfig={statusConfig}
                onEdit={onEdit}
                onStatus={() => setStatusModalOpen(true)}
                onAdditionalEvents={onAdditionalEvents}
                onDelete={onDelete}
              />
            </PartyCardActions>
          )}
        </PartyCardHeader>
      </PartyCard>

      {statusModalOpen && (
        <OrderStatusModal
          open={statusModalOpen}
          order={order}
          onClose={() => setStatusModalOpen(false)}
          onStatusChange={onStatusChange}
        />
      )}
    </>
  )
}

export default function OrdersList({
  orders = [],
  filteredOrders = [],
  locations,
  staff = [],
  clientsById,
  companySettings,
  hasOrderConflict,
  canManage,
  onCancel,
  onView,
  onEdit,
  onAdditionalEvents,
  onMessenger,
  onStatusChange,
  onDelete,
}) {
  return (
    <div className="mx-auto">
      <div className="grid gap-3">
        {orders.length === 0 && (
          <p className="text-sm text-black/55">Заказы еще не добавлены.</p>
        )}
        {orders.length > 0 && filteredOrders.length === 0 && (
          <p className="text-sm text-black/55">
            По выбранному фильтру заказов нет.
          </p>
        )}
        {filteredOrders.map((order) => (
          <OrderCard
            key={order._id}
            order={order}
            locations={locations}
            staff={staff}
            clientsById={clientsById}
            companySettings={companySettings}
            hasConflict={hasOrderConflict(order, orders)}
            canManage={canManage}
            onCancel={onCancel}
            onView={onView}
            onEdit={onEdit}
            onAdditionalEvents={onAdditionalEvents}
            onMessenger={onMessenger}
            onStatusChange={onStatusChange}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}
