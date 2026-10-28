'use client'

import { useId, useState } from 'react'
import {
  canMovePartyTask,
  PARTY_TASK_BOARD_STATUSES,
} from '@helpers/partyTaskViews'
import PartyTaskCard from './PartyTaskCard'

const titles = { new: 'Новые', in_progress: 'В работе', done: 'Выполнены' }
const styles = {
  new: 'border-sky-200 bg-sky-50/60',
  in_progress: 'border-amber-200 bg-amber-50/50',
  done: 'border-emerald-200 bg-emerald-50/50',
}

export default function PartyTaskBoard({
  columns = {},
  busy,
  onLoadMore,
  onMutate,
  ...cardProps
}) {
  const id = useId()
  const [draggedId, setDraggedId] = useState(null)
  const tasks = PARTY_TASK_BOARD_STATUSES.flatMap(
    (status) => columns[status]?.tasks || []
  )
  const dragged = tasks.find((task) => task._id === draggedId)
  return (
    <div className="space-y-3">
      <p id={`${id}-instructions`} className="text-xs text-slate-500">
        Перетаскивайте за значок ⠿ или выберите статус в карточке. Задачу
        должности достаточно выполнить одному сотруднику. Отменённые задачи
        доступны через фильтр статуса.
      </p>
      <div
        className="grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-3"
        aria-describedby={`${id}-instructions`}
      >
        {PARTY_TASK_BOARD_STATUSES.map((status) => {
          const column = columns[status] || { tasks: [], nextCursor: null }
          const accepts = !busy && canMovePartyTask(dragged, status)
          return (
            <section
              key={status}
              aria-labelledby={`${id}-${status}`}
              className={`min-w-0 rounded-xl border p-2 sm:p-3 ${styles[status]} ${accepts ? 'outline-2 outline-offset-2 outline-sky-400' : ''}`}
              onDragOver={(event) => {
                if (!accepts) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (
                  !accepts ||
                  event.dataTransfer.getData('application/x-partycrm-task') !==
                    draggedId
                )
                  return
                onMutate(dragged, { action: 'status', status })
                setDraggedId(null)
              }}
            >
              <header className="mb-3 flex items-baseline justify-between gap-2 px-1">
                <h2
                  id={`${id}-${status}`}
                  className="font-semibold text-slate-800"
                >
                  {titles[status]}
                </h2>
                <span className="text-xs text-slate-500">
                  Показано {column.tasks.length}
                  {column.nextCursor ? '+' : ''}
                </span>
              </header>
              <div className="space-y-3">
                {column.tasks.map((task) => (
                  <PartyTaskCard
                    key={task._id}
                    {...cardProps}
                    task={task}
                    board
                    busy={busy}
                    onMutate={onMutate}
                    onDragStart={(event, row) => {
                      event.dataTransfer.setData(
                        'application/x-partycrm-task',
                        row._id
                      )
                      event.dataTransfer.effectAllowed = 'move'
                      setDraggedId(row._id)
                    }}
                    onDragEnd={() => setDraggedId(null)}
                  />
                ))}
                {!column.tasks.length && !busy && (
                  <p className="rounded-lg border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                    {column.nextCursor
                      ? 'Поиск продолжается: загрузите следующую страницу.'
                      : 'Задач по выбранным фильтрам нет.'}
                  </p>
                )}
              </div>
              {column.nextCursor && (
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Показать ещё: ${titles[status]}`}
                  className="mt-3 min-h-11 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => onLoadMore(column.nextCursor, status)}
                >
                  Показать ещё
                </button>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
