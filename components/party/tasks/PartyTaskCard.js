'use client'

import { PARTY_TASK_STATUSES } from '@helpers/partyTasks'
import {
  getPartyTaskDueLabel,
  matchesPartyTaskFilter,
} from '@helpers/partyTaskPresentation'
import {
  canMovePartyTask,
  PARTY_TASK_BOARD_STATUSES,
} from '@helpers/partyTaskViews'

const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const statusStyles = {
  new: 'bg-sky-50 text-sky-800',
  in_progress: 'bg-amber-50 text-amber-900',
  done: 'bg-emerald-50 text-emerald-800',
  canceled: 'bg-slate-100 text-slate-600',
}

export default function PartyTaskCard({
  task,
  staffById,
  rolesById,
  busy,
  editing,
  board = false,
  onEdit,
  onMutate,
  onDragStart,
  onDragEnd,
  actionsName,
}) {
  const now = new Date()
  const overdue = matchesPartyTaskFilter(task, 'overdue', now)
  return (
    <article
      className={`min-w-0 rounded-xl border bg-white p-3 sm:p-4 ${overdue ? 'border-red-200' : 'border-sky-100'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 font-semibold break-words text-slate-900">
          {task.title}
        </h3>
        {board &&
        canMovePartyTask(
          task,
          task.status === 'new' ? 'in_progress' : 'new'
        ) ? (
          <button
            type="button"
            draggable={!busy}
            disabled={busy}
            onDragStart={(event) => onDragStart(event, task)}
            onDragEnd={onDragEnd}
            className="-mt-1 -mr-1 flex min-h-11 min-w-11 cursor-grab items-center justify-center rounded-lg text-lg text-slate-400 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Перетащить задачу «${task.title}»`}
            title="Перетащите в другой статус или выберите статус ниже"
          >
            ⠿
          </button>
        ) : (
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-xs ${statusStyles[task.status] || statusStyles.new}`}
          >
            {PARTY_TASK_STATUSES[task.status]}
          </span>
        )}
      </div>
      <p
        className={`mt-1 text-sm ${overdue ? 'font-semibold text-red-700' : 'text-slate-500'}`}
      >
        {getPartyTaskDueLabel(task, now)}
      </p>
      {task.orderTitle && (
        <p className="mt-1 text-xs break-words text-slate-500">
          Заказ: {task.orderTitle}
        </p>
      )}
      {(task.assigneeRoleId || task.assigneeStaffIds?.length > 0) && (
        <p className="mt-1 text-xs break-words text-slate-500">
          Кому:{' '}
          {[
            task.assigneeRoleId
              ? rolesById.get(String(task.assigneeRoleId)) || 'Должность'
              : '',
            ...(task.assigneeStaffIds || [])
              .slice(0, 2)
              .map((id) => staffById.get(String(id)) || 'Сотрудник'),
            task.assigneeStaffIds?.length > 2
              ? `ещё ${task.assigneeStaffIds.length - 2}`
              : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      {task.descriptionHtml && (
        <details className="mt-2 rounded-lg bg-slate-50 px-3">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-sky-800">
            Описание и вложения
          </summary>
          <div
            className="max-w-none pb-3 text-sm break-words [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_ol]:ml-5 [&_ol]:list-decimal [&_ul]:ml-5 [&_ul]:list-disc"
            dangerouslySetInnerHTML={{ __html: task.descriptionHtml }}
          />
        </details>
      )}
      {(task.blockedReason ||
        task.deadlineWarning ||
        task.calendarWarning ||
        task.orphaned) && (
        <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-900">
          {task.blockedReason ||
            task.deadlineWarning ||
            task.calendarWarning ||
            'Один из назначенных сотрудников неактивен. Требуется решение администратора.'}
        </p>
      )}
      {task.status === 'done' && (
        <p className="mt-2 text-xs text-slate-500">
          Выполнил:{' '}
          {task.completedByName ||
            staffById.get(String(task.completedByStaffId)) ||
            'Сотрудник'}
          {task.completedAt
            ? ` · ${new Date(task.completedAt).toLocaleString('ru-RU')}`
            : ''}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {((task.canComplete && ['new', 'in_progress'].includes(task.status)) ||
          (board && task.canReopen)) &&
          (board ? (
            <label className="min-w-0 flex-1">
              <span className="sr-only">Статус задачи «{task.title}»</span>
              <select
                value={task.status}
                disabled={busy}
                onChange={(event) => {
                  if (canMovePartyTask(task, event.target.value))
                    onMutate(task, {
                      action: 'status',
                      status: event.target.value,
                    })
                }}
                className="min-h-11 w-full cursor-pointer rounded-lg border border-sky-200 bg-white px-2 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {PARTY_TASK_BOARD_STATUSES.map((status) => (
                  <option
                    key={status}
                    value={status}
                    disabled={
                      status !== task.status && !canMovePartyTask(task, status)
                    }
                  >
                    {PARTY_TASK_STATUSES[status]}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <>
              {task.status === 'new' && (
                <button
                  type="button"
                  className={button}
                  disabled={busy}
                  onClick={() =>
                    onMutate(task, { action: 'status', status: 'in_progress' })
                  }
                >
                  В работу
                </button>
              )}
              <button
                type="button"
                className={`${button} bg-sky-600 text-white`}
                disabled={busy}
                onClick={() =>
                  onMutate(task, { action: 'status', status: 'done' })
                }
              >
                Выполнено
              </button>
            </>
          ))}
        {(task.canEdit || task.canCancel || task.canReopen) && (
          <details
            className="relative ml-auto"
            name={actionsName}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget))
                event.currentTarget.open = false
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.currentTarget.open = false
                event.currentTarget.querySelector('summary')?.focus()
              }
            }}
          >
            <summary
              className={`${button} list-none text-center [&::-webkit-details-marker]:hidden`}
            >
              Ещё
              <span className="sr-only">: действия с задачей {task.title}</span>
            </summary>
            <div className="absolute top-full right-0 z-20 mt-1 min-w-52 space-y-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
              {task.canEdit && (
                <button
                  type="button"
                  className={`${button} w-full border-transparent text-left`}
                  disabled={busy || editing}
                  onClick={(event) => {
                    event.currentTarget.closest('details').open = false
                    onEdit(task)
                  }}
                >
                  Изменить
                </button>
              )}
              {task.canReopen && (
                <button
                  type="button"
                  className={`${button} w-full border-transparent text-left`}
                  disabled={busy}
                  onClick={(event) => {
                    event.currentTarget.closest('details').open = false
                    onMutate(task, { action: 'status', status: 'new' })
                  }}
                >
                  Вернуть в новые
                </button>
              )}
              {task.canCancel &&
                ['new', 'in_progress'].includes(task.status) && (
                  <button
                    type="button"
                    className={`${button} w-full border-transparent text-left text-red-700`}
                    disabled={busy}
                    onClick={(event) => {
                      event.currentTarget.closest('details').open = false
                      if (window.confirm('Отменить задачу?'))
                        onMutate(task, { action: 'status', status: 'canceled' })
                    }}
                  >
                    Отменить
                  </button>
                )}
              {task.canEdit && task.seriesActive && (
                <button
                  type="button"
                  className={`${button} w-full border-transparent text-left text-red-700`}
                  disabled={busy}
                  onClick={(event) => {
                    event.currentTarget.closest('details').open = false
                    onMutate(task, { action: 'stop_series' })
                  }}
                >
                  Остановить повторы
                </button>
              )}
            </div>
          </details>
        )}
      </div>
    </article>
  )
}
