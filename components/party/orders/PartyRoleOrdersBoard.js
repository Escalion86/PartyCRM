'use client'

import { useId, useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faEllipsis, faLocationDot, faUser } from '@fortawesome/free-solid-svg-icons'
import Menu from '@mui/material/Menu'
import MenuItem from '@mui/material/MenuItem'
import { canPartyAccess } from '@helpers/partyRolePermissions'
import {
  getPartyOrderBoardTransitions,
  projectPartyOrderBoardColumns,
} from '@helpers/partyOrderBoard'

const button =
  'min-h-11 cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:border-sky-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50'
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
  const moveButtonId = useId()
  const moveMenuId = `${moveButtonId}-menu`
  const [moveAnchor, setMoveAnchor] = useState(null)
  const can = (resource) => canPartyAccess(context, { resource })
  const title =
    (can('orders.title') && order.title) ||
    (can('orders.serviceTitle') && order.serviceTitle) ||
    'Заказ'
  const transitions = getPartyOrderBoardTransitions(context, workflow, order)
  const canDrag = transitions.some((target) => visibleStageIds.has(target.id))
  const canMove = transitions.length > 0
  const moveMenuOpen = Boolean(moveAnchor && canMove && !busy)
  const canSeeDate = can('orders.eventDate')
  const eventDate = canSeeDate && order.eventDate ? new Date(order.eventDate) : null
  const dateParts = eventDate && Number.isFinite(eventDate.getTime())
    ? Object.fromEntries(dateFormatter.formatToParts(eventDate).map(({ type, value }) => [type, value]))
    : null
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
      className={`min-w-0 space-y-2.5 rounded-xl border bg-white px-3 pt-2 pb-3 ${String(order._id) === selectedId ? 'border-sky-500 ring-1 ring-sky-200' : 'border-gray-200 hover:border-sky-400'} ${dragging ? 'opacity-60' : ''}`}
    >
      <div className={`grid min-w-0 items-start gap-2.5 ${dateParts ? 'grid-cols-[auto_minmax(0,1fr)]' : ''}`}>
        {dateParts && (
          <time
            dateTime={eventDate.toISOString()}
            aria-label={dateFormatter.format(eventDate)}
            className="grid w-[3.625rem] rounded-lg bg-sky-50 px-1.5 py-1.5 text-center text-xs font-semibold leading-tight text-sky-900 tabular-nums"
          >
            <span className="text-2xl leading-none">{dateParts.day}</span>
            <span>{dateParts.month.replace(/\.$/, '')}</span>
            <span className="mt-1 border-t border-sky-200 pt-1">{dateParts.hour}:{dateParts.minute}</span>
          </time>
        )}
        <div className="grid min-w-0 gap-0.5">
          {(orderStatus || canMove) && (
            <div className="flex min-w-0 items-center gap-1">
              {orderStatus && (
                <span className="status-chip status-chip--neutral [overflow-wrap:anywhere]">{orderStatus}</span>
              )}
              {canMove && (
                <button
                  id={moveButtonId}
                  type="button"
                  aria-label={`Переместить заказ «${title}»`}
                  aria-haspopup="menu"
                  aria-expanded={moveMenuOpen}
                  aria-controls={moveMenuOpen ? moveMenuId : undefined}
                  draggable={canDrag && !busy}
                  disabled={busy}
                  className={`group -mt-2 -mr-1 ml-auto grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg pt-1.5 text-gray-600 focus-visible:outline-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50 ${canDrag ? '[@media(pointer:fine)]:cursor-grab [@media(pointer:fine)]:active:cursor-grabbing' : ''}`}
                  onClick={(event) => setMoveAnchor(event.currentTarget)}
                  onDragStart={(event) => onDragStart(event, order)}
                  onDragEnd={onDragEnd}
                >
                  <span className="grid h-7 w-8 place-items-center rounded-md border border-gray-200 group-hover:border-gray-300 group-hover:bg-gray-50 group-aria-expanded:bg-gray-50">
                    <FontAwesomeIcon icon={faEllipsis} className="size-4" aria-hidden="true" />
                  </span>
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            disabled={busy}
            className="flex min-h-8 w-full cursor-pointer items-start rounded text-left text-base font-semibold leading-tight text-gray-900 underline-offset-4 [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-60 [@media(pointer:coarse)]:min-h-11"
            onClick={() => onOpen(order)}
            aria-label={`Открыть заказ «${title}»`}
          >
            {title}
          </button>
          {((canSeeDate && !dateParts) || clientName || place) && (
            <div className="space-y-1 text-sm leading-5 text-gray-600 [overflow-wrap:anywhere]">
              {canSeeDate && !dateParts && <p>Дата не назначена</p>}
              {(clientName || place) && (
                <dl className="space-y-1">
                  {clientName && (
                    <div>
                      <dt className="sr-only">Клиент</dt>
                      <dd className="flex items-baseline gap-1.5">
                        <FontAwesomeIcon icon={faUser} className="size-3 shrink-0" aria-hidden="true" />
                        <span className="min-w-0">{clientName}</span>
                      </dd>
                    </div>
                  )}
                  {place && (
                    <div>
                      <dt className="sr-only">Место проведения</dt>
                      <dd className="flex items-baseline gap-1.5">
                        <FontAwesomeIcon icon={faLocationDot} className="size-3 shrink-0" aria-hidden="true" />
                        <span className="min-w-0">{place}</span>
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          )}
        </div>
      </div>
      {(tasks || amount) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-gray-200 pt-2 text-xs">
          {tasks && (
            <span className={tasks.overdueCount > 0 ? 'status-chip status-chip--overdue' : 'font-medium text-gray-600'}>
              {tasks.overdueCount > 0 ? `Просрочено задач: ${tasks.overdueCount}` : `Открытых задач: ${tasks.openCount}`}
            </span>
          )}
          {amount && <span className="ml-auto text-right text-sm font-semibold text-gray-900 tabular-nums">{order.contractAmount.toLocaleString('ru-RU')} ₽</span>}
        </div>
      )}
      {moveAnchor && (
        <Menu
          anchorEl={moveAnchor}
          open={moveMenuOpen}
          onClose={() => setMoveAnchor(null)}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          slotProps={{
            list: { id: moveMenuId, 'aria-labelledby': moveButtonId },
            paper: { className: 'min-w-44 rounded-lg border border-gray-200 bg-white text-gray-900' },
          }}
        >
          {transitions.map((target) => (
            <MenuItem
              key={target.id}
              className="min-h-11 cursor-pointer text-sm whitespace-normal [overflow-wrap:anywhere]"
              onClick={() => {
                setMoveAnchor(null)
                onTransition(order, target.id)
              }}
            >
              {target.title}
            </MenuItem>
          ))}
        </Menu>
      )}
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
              Выберите этап в меню «…» карточки.
              {multipleColumns && <span className="ml-1 [@media(pointer:coarse)]:hidden">Мышью можно перетащить карточку за эту же кнопку.</span>}
            </>
          )}
        </p>
      )}
      {!stages.length ? (
        <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
          Нет доступных этапов по выбранным условиям.
        </p>
      ) : null}
      <div
        role="region"
        aria-label="Колонки доски заказов"
        tabIndex={stages.length ? 0 : undefined}
        className="flex min-w-0 max-w-full snap-x snap-proximity items-start gap-3 overflow-x-auto overscroll-x-contain px-1 pb-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
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
              className={`${multipleColumns ? 'w-[min(83vw,19rem)]' : 'w-full sm:max-w-md'} max-w-full shrink-0 snap-start rounded-xl border p-3 ${accepts ? 'border-sky-500 bg-sky-50 outline-1 outline-sky-200' : 'border-gray-200 bg-gray-50'}`}
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
              <header className="mb-3 flex items-start justify-between gap-2 px-1">
                <h2
                  id={`${id}-${stage.id}`}
                  className={`min-w-0 pt-0.5 text-sm font-semibold leading-5 [overflow-wrap:anywhere] ${accepts ? 'text-sky-900' : 'text-gray-800'}`}
                >
                  {stage.title}
                </h2>
                {accepts ? (
                  <span className="shrink-0 text-xs font-semibold text-sky-900">Переместить сюда</span>
                ) : (
                  <span className="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white px-1.5 text-xs font-semibold text-gray-700 tabular-nums">
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
                  <p className={`rounded-lg border border-dashed border-gray-300 p-3 text-sm leading-5 ${accepts ? 'text-sky-900' : 'text-gray-600'}`}>
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
