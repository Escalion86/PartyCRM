'use client'

import { useId, useMemo, useState } from 'react'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import {
  getPartyOrderBoardTransitions,
  projectPartyOrderBoardColumns,
} from '@helpers/partyOrderBoard'

const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50'
const boardDateOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
const defaultTimeZone = 'Asia/Krasnoyarsk'
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
  visibleStageIds,
  dateFormatter,
  locationsById,
  dragging,
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
  const canDrag = transitions.some((target) => visibleStageIds.has(target.id))
  const canSeeDate = can('orders.eventDate')
  const eventDate = canSeeDate && order.eventDate ? new Date(order.eventDate) : null
  const clientName = can('orders.client.name') && order.client?.name
  const location = can('orders.locationId') && locationsById.get(String(order.locationId))
  const offsite = can('orders.placeType') && order.placeType === 'client_address'
  const place = offsite ? (can('orders.customAddress') && order.customAddress) || 'Выезд' : location?.title
  const orderStatus = can('orders.status') && (statuses[order.status] || order.status)
  const amount = can('finance.clientAmount') && Number.isFinite(order.contractAmount)
  const tasks = can('tasks') && order.taskSummary?.openCount > 0 ? order.taskSummary : null
  return (
    <article
      data-party-order-board-id={String(order._id)}
      className={`min-w-0 space-y-2 rounded-xl border bg-white px-3 pb-3 ${String(order._id) === selectedId ? 'border-sky-500 ring-1 ring-sky-200' : 'border-slate-200'} ${dragging ? 'opacity-60' : ''}`}
    >
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          disabled={busy}
          className="min-h-11 min-w-0 flex-1 cursor-pointer rounded text-left text-sm font-semibold text-sky-950 underline-offset-4 [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => onOpen(order)}
          aria-label={`Открыть заказ «${title}»`}
        >
          {title}
        </button>
        {canDrag ? (
          <button
            type="button"
            draggable={!busy}
            disabled={busy}
            className="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-sky-700 active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50 [@media(pointer:coarse)]:hidden"
            aria-label={`Перетащить заказ «${title}» или выбрать этап`}
            title="Перетащите карточку или нажмите, чтобы выбрать этап"
            onClick={(event) => event.currentTarget.closest('article')?.querySelector('select')?.focus()}
            onDragStart={(event) => onDragStart(event, order)}
            onDragEnd={onDragEnd}
          >
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="5" cy="3" r="1.25" />
              <circle cx="11" cy="3" r="1.25" />
              <circle cx="5" cy="8" r="1.25" />
              <circle cx="11" cy="8" r="1.25" />
              <circle cx="5" cy="13" r="1.25" />
              <circle cx="11" cy="13" r="1.25" />
            </svg>
          </button>
        ) : null}
      </div>
      {(canSeeDate || clientName || place) && (
        <div className="space-y-1 text-xs leading-4 text-slate-600 [overflow-wrap:anywhere]">
          {canSeeDate && (
            <p className="font-medium text-slate-800 tabular-nums">
              {eventDate && Number.isFinite(+eventDate) ? <time dateTime={eventDate.toISOString()}>{dateFormatter.format(eventDate)}</time> : 'Дата не выбрана'}
            </p>
          )}
          {clientName && <p>{clientName}</p>}
          {place && <p>{place}</p>}
        </div>
      )}
      {(orderStatus || amount || tasks) && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
          {orderStatus && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-slate-700">{orderStatus}</span>}
          {amount && <span className="font-semibold text-slate-900 tabular-nums">{order.contractAmount.toLocaleString('ru-RU')} ₽</span>}
          {tasks && (
            <span className={`font-medium ${tasks.overdueCount > 0 ? 'text-red-700' : 'text-slate-600'}`}>
              {tasks.overdueCount > 0 ? `Просрочено задач: ${tasks.overdueCount}` : `Открытых задач: ${tasks.openCount}`}
            </span>
          )}
        </div>
      )}
      {transitions.length ? (
        <label className="block">
          <span className="sr-only">Передать заказ «{title}» на этап</span>
          <select
            value=""
            disabled={busy}
            className="min-h-11 w-full min-w-0 cursor-pointer rounded-lg border border-slate-300 bg-white px-2 text-base text-sky-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
            onChange={(event) => {
              if (
                transitions.some((target) => target.id === event.target.value)
              )
                onTransition(order, event.target.value)
            }}
          >
            <option value="" disabled>Переместить…</option>
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
  locations,
  board,
  filtered = false,
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
  const visibleStageIds = useMemo(() => new Set(stages.map((stage) => stage.id)), [stages])
  const locationsById = useMemo(
    () => new Map((locations ?? []).map((location) => [String(location._id), location])),
    [locations]
  )
  const timeZone = context?.company?.settings?.timeZone || defaultTimeZone
  const dateFormatter = useMemo(() => {
    try {
      return new Intl.DateTimeFormat('ru-RU', { ...boardDateOptions, timeZone })
    } catch {
      return new Intl.DateTimeFormat('ru-RU', { ...boardDateOptions, timeZone: defaultTimeZone })
    }
  }, [timeZone])
  const busy = Boolean(disabled)
  const canMove = canPartyAccess(context, { resource: 'orders', action: 'transition' })
  const multipleColumns = stages.length > 1
  const targets = dragged
    ? getPartyOrderBoardTransitions(context, workflow, dragged)
    : []
  return (
    <section className="min-w-0 space-y-3" aria-label="Доска заказов">
      {(multipleColumns || (canMove && stages.length > 0)) && (
        <p className={`text-xs text-slate-600 ${canMove ? '' : 'sm:hidden'}`}>
          {multipleColumns && <span className="sm:hidden">Листайте колонки. </span>}
          {canMove && (
            <>
              Выберите «Переместить…» в карточке.
              {multipleColumns && <span className="ml-1 [@media(pointer:coarse)]:hidden">На компьютере можно перетащить карточку.</span>}
            </>
          )}
        </p>
      )}
      {!stages.length ? (
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          Нет доступных этапов по выбранным условиям.
        </p>
      ) : null}
      <div
        role="region"
        aria-label="Колонки доски заказов"
        tabIndex={stages.length ? 0 : undefined}
        className="flex min-w-0 max-w-full snap-x snap-proximity items-start gap-3 overflow-x-auto overscroll-x-contain px-1 pb-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
      >
        {stages.map((stage) => {
          const column = columns[stage.id] || { orders: [], busy: true }
          const loadedCount = column.orders.length.toLocaleString('ru-RU')
          const accepts =
            !busy && targets.some((target) => target.id === stage.id)
          return (
            <section
              key={stage.id}
              aria-labelledby={`${id}-${stage.id}`}
              aria-busy={column.busy || column.busyMore}
              className={`w-[min(83vw,19rem)] max-w-full shrink-0 snap-start rounded-xl border p-3 ${accepts ? 'border-sky-500 bg-sky-50 outline-1 outline-sky-200' : 'border-slate-200 bg-slate-50'}`}
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
                setDragged(null)
                onTransition(dragged, stage.id)
              }}
            >
              <header className="mb-3 flex items-baseline justify-between gap-2">
                <h2
                  id={`${id}-${stage.id}`}
                  className="min-w-0 font-semibold break-words text-slate-800"
                >
                  {stage.title}
                </h2>
                {accepts ? (
                  <span className="shrink-0 text-xs font-semibold text-sky-900">Переместить сюда</span>
                ) : (
                  <span className="shrink-0 text-xs text-slate-600 tabular-nums">
                    {column.busy
                      ? 'Загрузка…'
                      : column.error
                        ? 'Не загружено'
                        : <>
                          <span className="sr-only">Загружено заказов: {loadedCount}{column.nextCursor ? '. Можно загрузить ещё.' : ''}</span>
                          <span aria-hidden="true">{loadedCount}{column.nextCursor ? '+' : ''}</span>
                        </>}
                  </span>
                )}
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
                    visibleStageIds={visibleStageIds}
                    dateFormatter={dateFormatter}
                    locationsById={locationsById}
                    dragging={String(dragged?._id) === String(order._id)}
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
                      const card = event.currentTarget?.closest('article')
                      if (card) event.dataTransfer.setDragImage?.(card, 20, 18)
                      setDragged(record)
                    }}
                    onDragEnd={() => setDragged(null)}
                  />
                ))}
                {!column.busy && !column.error && !column.orders.length ? (
                  <p className="rounded-lg border border-dashed border-slate-200 p-3 text-sm text-slate-600">
                    {column.nextCursor
                      ? 'Совпадений пока нет.'
                      : filtered
                        ? 'По этим условиям заказов нет. Сбросьте фильтры.'
                        : 'На этом этапе пока нет заказов.'}
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
                    disabled={busy || column.busyMore}
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
