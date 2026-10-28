'use client'

import { useId, useMemo, useState } from 'react'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import {
  getPartyOrderBoardTransitions,
  projectPartyOrderBoardColumns,
} from '@helpers/partyOrderBoard'
import { getPartyOrderStage } from '@helpers/partyWorkflow'

const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const dateText = (value) =>
  value && Number.isFinite(+new Date(value))
    ? new Date(value).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Дата не выбрана'
const statuses = {
  draft: 'Заявка',
  active: 'Подтверждён',
  canceled: 'Отменён',
  closed: 'Закрыт',
}

function OrderBoardCard({
  order,
  context,
  workflow,
  stage,
  busy,
  selectedId,
  onOpen,
  onTransition,
  onDragStart,
  onDragEnd,
}) {
  const can = (resource) => canPartyAccess(context, { resource })
  const title =
    (can('orders.title') && order.title) ||
    (can('orders.serviceTitle') && order.serviceTitle) ||
    'Заказ'
  const transitions = getPartyOrderBoardTransitions(context, workflow, order)
  const currentStage = getPartyOrderStage(order, workflow)
  return (
    <article
      className={`min-w-0 rounded-xl border bg-white p-3 ${String(order._id) === selectedId ? 'border-sky-400 ring-1 ring-sky-200' : 'border-slate-200'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          disabled={busy}
          className="min-h-11 min-w-0 flex-1 cursor-pointer text-left font-semibold break-words text-sky-950 underline-offset-4 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => onOpen(order)}
          aria-label={`Открыть заказ «${title}»`}
        >
          {title}
        </button>
        {transitions.length ? (
          <button
            type="button"
            draggable={!busy}
            disabled={busy}
            className="flex min-h-11 min-w-11 cursor-grab items-center justify-center rounded-lg text-lg text-slate-500 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={`Перетащить заказ «${title}»`}
            title="Перетащите в разрешённый этап или выберите этап ниже"
            onDragStart={(event) => onDragStart(event, order)}
            onDragEnd={onDragEnd}
          >
            ⠿
          </button>
        ) : null}
      </div>
      {can('orders.eventDate') ? (
        <p className="mt-1 text-sm text-slate-600">
          {dateText(order.eventDate)}
        </p>
      ) : null}
      {can('orders.client.name') && order.client?.name ? (
        <p className="mt-1 text-sm break-words text-slate-600">
          {order.client.name}
        </p>
      ) : null}
      {can('tasks') && order.taskSummary?.openCount > 0 ? (
        <p
          className={`mt-2 text-xs font-medium ${order.taskSummary.overdueCount > 0 ? 'text-red-700' : 'text-sky-700'}`}
        >
          {order.taskSummary.overdueCount > 0
            ? `Просрочено задач: ${order.taskSummary.overdueCount}`
            : `Открытых задач: ${order.taskSummary.openCount}`}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
        {can('orders.status') && Object.hasOwn(order, 'status') ? (
          <span>{statuses[order.status] || order.status}</span>
        ) : null}
        {can('finance.clientAmount') &&
        Object.hasOwn(order, 'contractAmount') ? (
          <span>
            {Number(order.contractAmount || 0).toLocaleString('ru-RU')} ₽
          </span>
        ) : null}
      </div>
      {transitions.length ? (
        <label className="mt-3 block text-xs text-slate-600">
          <span className="sr-only">Передать заказ «{title}» на этап</span>
          <select
            value={currentStage}
            disabled={busy}
            className="min-h-11 w-full min-w-0 cursor-pointer rounded-lg border border-sky-200 bg-white px-2 py-2 text-sm text-sky-900 disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(event) => {
              if (
                transitions.some((target) => target.id === event.target.value)
              )
                onTransition(order, event.target.value)
            }}
          >
            <option value={currentStage}>{stage.title}</option>
            {transitions.map((target) => (
              <option key={target.id} value={target.id}>
                {target.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </article>
  )
}

export default function PartyRoleOrdersBoard({
  context,
  workflow,
  stages,
  board,
  disabled,
  selectedId,
  onOpen,
  onTransition,
}) {
  const id = useId()
  const [dragged, setDragged] = useState(null)
  const columns = useMemo(
    () => projectPartyOrderBoardColumns(board.columns, stages, workflow),
    [board.columns, stages, workflow]
  )
  const busy = disabled || board.busy
  const targets = dragged
    ? getPartyOrderBoardTransitions(context, workflow, dragged)
    : []
  return (
    <section className="min-w-0 space-y-3" aria-label="Доска заказов">
      <p className="text-xs text-slate-500">
        Перетаскивайте за значок ⠿ или выбирайте этап в карточке. Переход
        сохраняет проверку обязательного брифа и прав должности.
      </p>
      {!stages.length ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          Нет доступных этапов по выбранным условиям.
        </p>
      ) : null}
      <div className="grid min-w-0 grid-cols-1 items-start gap-3 lg:flex lg:overflow-x-auto lg:pb-3">
        {stages.map((stage) => {
          const column = columns[stage.id] || { orders: [], busy: true }
          const accepts =
            !busy && targets.some((target) => target.id === stage.id)
          return (
            <section
              key={stage.id}
              aria-labelledby={`${id}-${stage.id}`}
              aria-busy={column.busy || column.busyMore}
              className={`min-w-0 rounded-xl border bg-slate-50 p-3 lg:w-80 lg:shrink-0 ${accepts ? 'border-sky-500 outline-2 outline-sky-200' : 'border-slate-200'}`}
              onDragOver={(event) => {
                if (accepts) {
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                }
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (
                  !accepts ||
                  event.dataTransfer.getData('application/x-partycrm-order') !==
                    String(dragged._id)
                )
                  return
                onTransition(dragged, stage.id)
                setDragged(null)
              }}
            >
              <header className="mb-3 flex items-baseline justify-between gap-2">
                <h2
                  id={`${id}-${stage.id}`}
                  className="min-w-0 font-semibold break-words text-slate-800"
                >
                  {stage.title}
                </h2>
                <span className="shrink-0 text-xs text-slate-500">
                  {column.busy
                    ? 'Загрузка…'
                    : column.error
                      ? 'Не загружено'
                      : `Загружено ${column.orders.length}${column.nextCursor ? '+' : ''}`}
                </span>
              </header>
              {column.error ? (
                <div
                  role="alert"
                  className="space-y-2 rounded-lg bg-red-50 p-3 text-sm text-red-800"
                >
                  <p>{column.error}</p>
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={board.reload}
                  >
                    Повторить загрузку
                  </button>
                </div>
              ) : null}
              <div className="space-y-3">
                {column.orders.map((order) => (
                  <OrderBoardCard
                    key={order._id}
                    order={order}
                    context={context}
                    workflow={workflow}
                    stage={stage}
                    busy={busy}
                    selectedId={selectedId}
                    onOpen={onOpen}
                    onTransition={onTransition}
                    onDragStart={(event, record) => {
                      event.dataTransfer.setData(
                        'application/x-partycrm-order',
                        String(record._id)
                      )
                      event.dataTransfer.effectAllowed = 'move'
                      setDragged(record)
                    }}
                    onDragEnd={() => setDragged(null)}
                  />
                ))}
                {!column.busy && !column.error && !column.orders.length ? (
                  <p className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-500">
                    {column.nextCursor
                      ? 'Совпадений пока нет. Можно проверить следующую страницу.'
                      : 'Заказов по выбранным условиям нет.'}
                  </p>
                ) : null}
              </div>
              {column.nextCursor ? (
                <div className="mt-3 space-y-2">
                  {column.errorMore ? (
                    <p role="alert" className="text-sm text-red-800">
                      {column.errorMore}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    className={`${button} w-full bg-white`}
                    disabled={busy}
                    onClick={() => board.loadMore(stage.id)}
                  >
                    {column.busyMore
                      ? 'Загружаем…'
                      : column.errorMore
                        ? 'Повторить загрузку'
                        : column.orders.length
                          ? 'Показать ещё'
                          : 'Продолжить поиск'}
                  </button>
                </div>
              ) : null}
            </section>
          )
        })}
      </div>
    </section>
  )
}
