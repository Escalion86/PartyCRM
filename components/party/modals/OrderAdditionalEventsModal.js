'use client'

import { useMemo, useState } from 'react'
import {
  faCircleCheck,
  faEllipsisV,
  faPen,
  faSpinner,
  faTrashAlt,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import DropDown from '@components/DropDown'
import Modal from '@components/Modal'
import PartyTasks from '@components/party/tasks/PartyTasks'
import useUnsavedChanges from '@helpers/useUnsavedChanges'
import { getAdditionalEventsDisplayGroups } from '@helpers/additionalEvents'

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

export const formatDateTimeLocalValue = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offsetMs = date.getTimezoneOffset() * 60 * 1000
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16)
}

const DetailBlock = ({ label, children }) => (
  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
    <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
      {label}
    </div>
    <div className="mt-1">{children}</div>
  </div>
)

export const getStaffLabel = (staffMember) =>
  [staffMember?.secondName, staffMember?.firstName].filter(Boolean).join(' ') ||
  staffMember?.phone ||
  staffMember?.email ||
  'Без имени'

export const isAdminStaff = (staffMember) =>
  ['owner', 'admin'].includes(String(staffMember?.role || '')) &&
  staffMember?.status !== 'archived'

export const getResponsibleLabel = ({ staff, order, item }) => {
  const responsibleStaffId = item?.responsibleStaffId || order?.responsibleStaffId
  if (!responsibleStaffId) return 'Не назначен'
  const person = staff.find(
    (staffMember) => String(staffMember._id) === String(responsibleStaffId)
  )
  return person ? getStaffLabel(person) : 'Администратор не найден'
}

const ActionItem = ({ icon, label, tone = 'blue', onClick }) => (
  <button
    type="button"
    className={`flex h-9 w-full cursor-pointer items-center gap-2 bg-white px-3 text-left text-sm font-semibold transition ${
      tone === 'red'
        ? 'text-red-600 hover:bg-red-600 hover:text-white'
        : tone === 'orange'
          ? 'text-orange-600 hover:bg-orange-600 hover:text-white'
          : 'text-sky-700 hover:bg-sky-600 hover:text-white'
    }`}
    onClick={(event) => {
      event.stopPropagation()
      onClick?.()
    }}
  >
    <FontAwesomeIcon icon={icon} className="h-4 w-4 shrink-0" />
    <span className="whitespace-nowrap">{label}</span>
  </button>
)

export const AdditionalEventCard = ({
  item,
  index,
  canManage,
  disabled,
  responsibleLabel,
  onOpen,
  onToggleDone,
  onEdit,
  onDelete,
}) => {
  const [isSaving, setIsSaving] = useState(false)
  const title = item?.title || `Задача #${index + 1}`
  const displayDate = item?.displayDate ?? (item?.done ? item?.doneAt : item?.date)
  const displayDateLabel =
    item?.displayDateLabel || (item?.done ? 'Выполнено' : '')

  const handleToggleDone = async () => {
    if (!canManage || disabled || isSaving) return
    setIsSaving(true)
    try {
      await onToggleDone?.(index)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      className="cursor-pointer rounded-xl outline-none focus:ring-2 focus:ring-sky-200"
      onClick={() => onOpen?.(index)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        onOpen?.(index)
      }}
    >
      <div
        className={`rounded-xl border p-3 transition hover:bg-white hover:shadow-sm ${
          item?.done
            ? 'border-emerald-200 bg-emerald-50/70'
            : 'border-sky-100 bg-white'
        }`}
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            disabled={!canManage || disabled || isSaving}
            aria-busy={isSaving}
            onClick={(event) => {
              event.stopPropagation()
              handleToggleDone()
            }}
            className={`mt-0.5 flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border transition disabled:cursor-not-allowed disabled:opacity-60 ${
              item?.done
                ? 'border-emerald-500 bg-emerald-500 text-white'
                : 'border-slate-300 bg-white text-slate-400 hover:border-emerald-400 hover:text-emerald-500'
            }`}
            aria-label={
              item?.done
                ? 'Вернуть задачу в работу'
                : 'Отметить задачу выполненным'
            }
          >
            <FontAwesomeIcon
              icon={isSaving ? faSpinner : faCircleCheck}
              className={isSaving ? 'animate-spin' : ''}
            />
          </button>
          <div className="min-w-0 flex-1">
            <div
              className={`truncate text-sm font-semibold ${
                item?.done ? 'text-emerald-700' : 'text-slate-900'
              }`}
            >
              {item?.done ? '✓ ' : ''}
              {title}
            </div>
            <div className="text-xs text-slate-600">
              {displayDateLabel ? `${displayDateLabel}: ` : ''}
              {formatDateTime(displayDate)}
            </div>
            {item?.description ? (
              <div className="mt-1 line-clamp-3 whitespace-pre-wrap text-xs text-slate-700">
                {item.description}
              </div>
            ) : null}
            {responsibleLabel ? (
              <div className="mt-1 truncate text-xs font-semibold text-sky-700">
                Ответственный: {responsibleLabel}
              </div>
            ) : null}
          </div>
          {canManage ? (
            <div
              className="shrink-0"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <DropDown
                placement="right"
                menuPadding={false}
                menuClassName="flex-col items-stretch justify-start overflow-hidden"
                renderInPortal
                trigger={
                  <button
                    type="button"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-transparent text-sky-700 transition hover:border-sky-200 hover:bg-sky-50"
                    aria-label="Открыть меню задачи"
                  >
                    <FontAwesomeIcon icon={faEllipsisV} className="h-4 w-4" />
                  </button>
                }
              >
                <ActionItem
                  icon={faPen}
                  label="Редактировать"
                  tone="orange"
                  onClick={() => onEdit?.(index)}
                />
                {onDelete ? (
                  <ActionItem
                    icon={faTrashAlt}
                    label="Удалить"
                    tone="red"
                    onClick={() => onDelete(index)}
                  />
                ) : null}
              </DropDown>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export const AdditionalEventEditModal = ({
  open = true,
  title = 'Редактировать задачу',
  draft,
  setDraft,
  adminStaffOptions = [],
  saving = false,
  onClose,
  onSubmit,
  hasUnsavedChanges = false,
}) => (
  <Modal
    open={open}
    onClose={onClose}
    hasUnsavedChanges={hasUnsavedChanges}
    title={title}
    tone="party"
    size="sm"
    footer={({ requestClose }) => (
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          className="cursor-pointer rounded border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          onClick={requestClose}
        >
          Отмена
        </button>
        <button
          type="button"
          className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saving}
          onClick={onSubmit}
        >
          Сохранить
        </button>
      </div>
    )}
  >
    <div className="grid gap-3 text-sm">
      <label className="grid gap-1 font-semibold text-slate-700">
        Название
        <input
          type="text"
          value={draft.title}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              title: event.target.value,
            }))
          }
          className="rounded border border-sky-100 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-sky-400"
        />
      </label>
      <label className="grid gap-1 font-semibold text-slate-700">
        Дата и время
        <input
          type="datetime-local"
          value={draft.date}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              date: event.target.value,
            }))
          }
          className="rounded border border-sky-100 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-sky-400"
        />
      </label>
      <label className="grid gap-1 font-semibold text-slate-700">
        Описание
        <textarea
          value={draft.description}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              description: event.target.value,
            }))
          }
          rows={4}
          className="resize-y rounded border border-sky-100 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-sky-400"
        />
      </label>
      <label className="grid gap-1 font-semibold text-slate-700">
        Ответственный
        <select
          value={draft.responsibleStaffId || ''}
          onChange={(event) =>
            setDraft((prev) => ({
              ...prev,
              responsibleStaffId: event.target.value,
            }))
          }
          className="cursor-pointer rounded border border-sky-100 bg-white px-3 py-2 text-sm font-normal text-slate-900 outline-none focus:border-sky-400"
        >
          <option value="">Как в заказе</option>
          {adminStaffOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  </Modal>
)

export default function OrderAdditionalEventsModal({ open, order, activeCompanyId = '', onClose }) {
  const [dirty, setDirty] = useState(false)
  return <Modal open={open} onClose={onClose} hasUnsavedChanges={dirty} title="Задачи" tone="party" size="full"
    footer={({ requestClose }) => <button type="button" className="min-h-11 cursor-pointer rounded border border-slate-300 px-4 text-sm font-semibold" onClick={requestClose}>Закрыть</button>}>
    {open && order?._id ? <PartyTasks companyId={activeCompanyId || String(order.tenantId)} orderId={String(order._id)} compact onDirtyChange={setDirty} /> : <p>Сохраните заказ, чтобы назначать задачи.</p>}
  </Modal>
}
