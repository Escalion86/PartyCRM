'use client'

import { useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { formatPhoneNumber } from '@helpers/phoneInput'
import usePartyUnsavedChanges, {
  requestPartyLeave,
} from '@components/party/navigation/usePartyUnsavedChanges'
import { TicketError, TicketField, TicketPager } from './TicketingControls'
import { useTicketingCommand, useTicketingList } from './useTicketingData'
import {
  ticketButton,
  ticketCard,
  ticketControl,
  ticketDate,
  ticketKopecks,
  ticketMoney,
  ticketPrimary,
  ticketRubles,
} from './ticketingUi'

const initialOperation = (action, sale) => ({
  action,
  quantity: '1',
  amount:
    action === 'payment.record' && Number.isSafeInteger(sale.dueAmountKopecks)
      ? ticketRubles(sale.dueAmountKopecks)
      : '0.00',
  method: 'cash',
  comment: '',
})
function SaleOperation({
  companyId,
  sale,
  caps,
  enabled,
  maintenanceActions = [],
  detailBusy,
  onChanged,
}) {
  const actions = [
    enabled && caps.payments && ['payment.record', 'Оплата'],
    caps.checkin &&
      (enabled || maintenanceActions.includes('admission.record')) && [
        'admission.record',
        'Вход',
      ],
    caps.refund &&
      (enabled || maintenanceActions.includes('refund.record')) && [
        'refund.record',
        'Возврат',
      ],
  ].filter(Boolean)
  const [draft, setDraft] = useState(() =>
    initialOperation(actions[0]?.[0] || '', sale)
  )
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft))
  const [completed, setCompleted] = useState(false)
  const [error, setError] = useState('')
  const command = useTicketingCommand(companyId)
  const dirty = !completed && JSON.stringify(draft) !== baseline
  usePartyUnsavedChanges(dirty, {
    label: 'операция с билетами',
    scope: `${companyId}:ticket-operation`,
    pending: command.busy,
  })
  const action = actions.some(([key]) => key === draft.action)
    ? draft.action
    : actions[0]?.[0]
  const locked = command.busy || command.uncertain || !action
  const set = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setError('')
  }
  const reset = (nextAction) => {
    const next = initialOperation(nextAction, sale)
    setDraft(next)
    setBaseline(JSON.stringify(next))
    setCompleted(false)
    setError('')
  }
  const choose = (nextAction) => {
    if (
      requestPartyLeave({
        kind: 'record',
        target: 'ticket-action-' + nextAction,
        scope: `${companyId}:ticket-operation`,
      })
    )
      reset(nextAction)
  }
  const submit = async (event) => {
    event.preventDefault()
    if (!action || command.busy) return
    const quantity = Number(draft.quantity),
      amount = ticketKopecks(draft.amount)
    if (
      action !== 'payment.record' &&
      (!Number.isSafeInteger(quantity) ||
        quantity < (action === 'refund.record' ? 0 : 1))
    ) {
      setError('Проверьте количество билетов.')
      return
    }
    if (
      action !== 'admission.record' &&
      (amount === null || amount < (action === 'payment.record' ? 1 : 0))
    ) {
      setError('Проверьте сумму.')
      return
    }
    if (action === 'refund.record' && !draft.comment.trim()) {
      setError('Укажите причину возврата.')
      return
    }
    const payload = {
      saleId: String(sale._id),
      ...(action === 'payment.record'
        ? {
            amountKopecks: amount,
            method: draft.method,
            comment: draft.comment.trim(),
          }
        : action === 'refund.record'
          ? {
              quantity,
              amountKopecks: amount,
              method: draft.method,
              reason: draft.comment.trim(),
            }
          : { quantity }),
    }
    const result = await command.run(action, payload)
    if (result) {
      setCompleted(action)
      onChanged()
    }
  }
  if (!actions.length) return null
  if (completed)
    return (
      <div className="space-y-3 rounded-xl bg-emerald-50 p-3">
        <p role="status" className="font-medium text-emerald-900">
          {completed === 'payment.record'
            ? 'Полученная оплата записана вручную.'
            : completed === 'refund.record'
              ? 'Возврат записан. Перечисление денег здесь не выполнялось.'
              : 'Вход отмечен.'}
        </p>
        <button
          type="button"
          className={ticketButton}
          disabled={detailBusy}
          onClick={() => reset(action)}
        >
          Новая операция
        </button>
      </div>
    )
  return (
    <form
      aria-label="Операция с билетами"
      onSubmit={submit}
      className="space-y-3 rounded-xl border border-slate-200 p-3"
    >
      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label="Вид операции"
      >
        {actions.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={
              ticketButton +
              (action === key ? ' bg-sky-50 ring-1 ring-sky-400' : '')
            }
            aria-pressed={action === key}
            disabled={locked}
            onClick={() => choose(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {action !== 'payment.record' ? (
        <TicketField
          label={
            action === 'refund.record'
              ? 'Количество отменяемых билетов'
              : 'Количество вошедших посетителей'
          }
        >
          <input
            className={ticketControl}
            type="number"
            min={action === 'refund.record' ? '0' : '1'}
            step="1"
            value={draft.quantity}
            disabled={locked}
            onChange={(event) => set('quantity', event.target.value)}
          />
        </TicketField>
      ) : null}
      {action !== 'admission.record' ? (
        <>
          <TicketField
            label={
              action === 'refund.record'
                ? 'Сумма фактического возврата, ₽'
                : 'Полученная сумма, ₽'
            }
          >
            <input
              className={ticketControl}
              inputMode="decimal"
              value={draft.amount}
              disabled={locked}
              onChange={(event) => set('amount', event.target.value)}
            />
          </TicketField>
          <TicketField
            label={
              action === 'payment.record'
                ? 'Способ полученной оплаты'
                : 'Способ фактического возврата'
            }
          >
            <select
              className={ticketControl + ' cursor-pointer'}
              value={draft.method}
              disabled={locked}
              onChange={(event) => set('method', event.target.value)}
            >
              <option value="cash">Наличные</option>
              <option value="card">Карта</option>
            </select>
          </TicketField>
          {action === 'refund.record' ? (
            <p className="text-xs text-slate-500">
              Сумма 0 отменяет неоплаченные билеты. Количество 0 позволяет
              отметить возврат денег за уже отменённые билеты.
            </p>
          ) : null}
          <TicketField
            label={
              action === 'refund.record'
                ? 'Причина возврата'
                : 'Комментарий к оплате'
            }
          >
            <input
              className={ticketControl}
              maxLength="1000"
              value={draft.comment}
              required={action === 'refund.record'}
              disabled={locked}
              onChange={(event) => set('comment', event.target.value)}
            />
          </TicketField>
        </>
      ) : null}
      <TicketError>{error || command.error}</TicketError>
      <button
        type="submit"
        className={ticketPrimary}
        disabled={command.busy || !action}
      >
        {command.busy
          ? 'Сохраняем…'
          : command.uncertain
            ? 'Повторить сохранение'
            : action === 'payment.record'
              ? 'Записать полученную оплату'
              : action === 'refund.record'
                ? 'Записать возврат'
                : 'Отметить вход'}
      </button>
      {action !== 'admission.record' ? (
        <p className="text-xs text-slate-500">
          Это отметка сотрудника о состоявшейся операции. Чек и операции с
          терминалом здесь не выполняются.
        </p>
      ) : null}
    </form>
  )
}

export default function TicketingHistory({
  companyId,
  catalog,
  revision,
  onChanged,
}) {
  const caps = catalog.capabilities || {}
  const list = useTicketingList({
    companyId,
    section: 'sales',
    enabled: true,
    revision,
  })
  const [selectedId, setSelectedId] = useState('')
  const [detailState, setDetail] = useState({
    key: '',
    sale: null,
    busy: false,
    error: '',
  })
  const [retry, setRetry] = useState(0)
  const detailKey = JSON.stringify([companyId, selectedId, revision, retry])
  const detail = {
    ...detailState,
    busy:
      Boolean(selectedId) &&
      (detailState.key !== detailKey || detailState.busy),
    error: detailState.key === detailKey ? detailState.error : '',
  }
  const generation = useRef(0)
  useEffect(() => {
    const current = ++generation.current
    if (!selectedId) return
    const controller = new AbortController()
    apiJson(
      `/api/party/ticketing?section=sale&id=${encodeURIComponent(selectedId)}`,
      {
        headers: { 'x-partycrm-company-id': companyId },
        cache: 'no-store',
        signal: controller.signal,
      }
    )
      .then((result) => {
        if (current === generation.current)
          setDetail({
            key: detailKey,
            sale: result.data,
            busy: false,
            error: '',
          })
      })
      .catch((cause) => {
        if (current === generation.current && cause.name !== 'AbortError')
          setDetail((previous) => ({
            sale: [403, 404].includes(cause.status) ? null : previous.sale,
            busy: false,
            key: detailKey,
            error: cause.message || 'Не удалось открыть продажу',
          }))
      })
    return () => {
      generation.current += 1
      controller.abort()
    }
  }, [companyId, selectedId, detailKey])
  const choose = (id) => {
    if (
      !requestPartyLeave({
        kind: 'record',
        target: 'ticket-sale-' + id,
        scope: `${companyId}:ticket-operation`,
      })
    )
      return
    setDetail({ sale: null, busy: Boolean(id), error: '' })
    setSelectedId(id)
  }
  const sale = detail.sale
  return (
    <section aria-label="История билетных продаж" className="space-y-4">
      <h2 className="text-lg font-semibold text-sky-950">
        История продаж и броней
      </h2>
      {selectedId ? (
        <div className={ticketCard + ' space-y-4'}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold text-sky-950">
              {sale?.programTitle || 'Продажа'}
            </h3>
            <button
              type="button"
              className={ticketButton}
              onClick={() => choose('')}
            >
              Закрыть продажу
            </button>
          </div>
          {detail.busy ? (
            <p role="status" className="text-sm text-slate-500">
              Обновляем продажу…
            </p>
          ) : null}
          <TicketError>{detail.error}</TicketError>
          {detail.error ? (
            <button
              type="button"
              className={ticketButton}
              onClick={() => setRetry((value) => value + 1)}
            >
              Повторить загрузку продажи
            </button>
          ) : null}
          {sale ? (
            <>
              <p className="text-sm text-slate-600">
                Билетов: {sale.quantity} · Отменено:{' '}
                {sale.refundedQuantity || 0} · Вход отмечен:{' '}
                {sale.admittedQuantity || 0}
              </p>
              <p className="text-sm text-slate-600">
                {sale.admission === 'session'
                  ? 'Посещение по сеансу'
                  : 'Без фиксированного времени'}
                {sale.status === 'canceled' ? ' · отменено' : ''}
              </p>
              {caps.contacts &&
              sale.contact &&
              Object.values(sale.contact).some(Boolean) ? (
                <div className="flex flex-wrap gap-3 text-sm text-slate-700">
                  {sale.contact.name ? <span>{sale.contact.name}</span> : null}
                  {sale.contact.phone ? (
                    <a
                      className="inline-flex min-h-11 cursor-pointer items-center text-sky-700 underline"
                      href={`tel:+${String(sale.contact.phone).replace(/\D/g, '')}`}
                    >
                      {formatPhoneNumber(sale.contact.phone)}
                    </a>
                  ) : null}
                  {sale.contact.email ? (
                    <a
                      className="inline-flex min-h-11 cursor-pointer items-center break-all text-sky-700 underline"
                      href={`mailto:${sale.contact.email}`}
                    >
                      {sale.contact.email}
                    </a>
                  ) : null}
                </div>
              ) : null}
              {caps.finance ? (
                <dl className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-3 text-sm">
                  <dt>Стоимость</dt>
                  <dd className="text-right">
                    {ticketMoney(sale.totalAmountKopecks)}
                  </dd>
                  <dt>Получено</dt>
                  <dd className="text-right">
                    {ticketMoney(sale.paidAmountKopecks)}
                  </dd>
                  <dt>Возвращено</dt>
                  <dd className="text-right">
                    {ticketMoney(sale.refundedAmountKopecks)}
                  </dd>
                  <dt>Осталось оплатить</dt>
                  <dd className="text-right font-semibold">
                    {ticketMoney(sale.dueAmountKopecks)}
                  </dd>
                </dl>
              ) : null}
              <SaleOperation
                key={sale._id}
                companyId={companyId}
                sale={sale}
                caps={caps}
                enabled={catalog.enabled}
                maintenanceActions={catalog.maintenanceActions || []}
                detailBusy={detail.busy}
                onChanged={onChanged}
              />
              {caps.finance && Array.isArray(sale.ledger) ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-700">
                    Операции
                  </h4>
                  {sale.ledger.map((row) => (
                    <article
                      key={row._id}
                      className="rounded-lg border border-slate-200 p-3 text-sm text-slate-600"
                    >
                      <p className="font-semibold text-slate-800">
                        {row.kind === 'payment'
                          ? 'Оплата'
                          : row.kind === 'refund'
                            ? 'Возврат'
                            : 'Вход'}{' '}
                        · {ticketDate(row.occurredAt)}
                      </p>
                      <p>
                        {row.kind === 'admission'
                          ? `Посетителей: ${row.quantity}`
                          : ticketMoney(row.amountKopecks)}
                        {row.method
                          ? ` · ${row.method === 'card' ? 'карта' : 'наличные'}`
                          : ''}
                      </p>
                      <p>
                        {row.source === 'manual'
                          ? 'Отмечено сотрудником'
                          : row.source === 'provider'
                            ? 'Подтверждено провайдером'
                            : 'Источник подтверждения не указан'}
                      </p>
                      {row.comment ? (
                        <p className="break-words">{row.comment}</p>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        {list.rows.map((row) => (
          <button
            type="button"
            key={row._id}
            className={
              ticketCard +
              ' cursor-pointer space-y-2 text-left hover:border-sky-300'
            }
            onClick={() => choose(String(row._id))}
          >
            <p className="font-semibold break-words text-sky-950">
              {row.programTitle || 'Посещение'}
            </p>
            <p className="text-sm text-slate-600">
              {ticketDate(row.createdAt)} · Билетов: {row.quantity}
            </p>
            {caps.contacts && row.contact?.name ? (
              <p className="text-sm break-words text-slate-600">
                {row.contact.name}
              </p>
            ) : null}
            {caps.finance ? (
              <p className="text-sm font-medium text-sky-800">
                {ticketMoney(row.totalAmountKopecks)}
                {Number.isSafeInteger(row.dueAmountKopecks)
                  ? ` · остаток ${ticketMoney(row.dueAmountKopecks)}`
                  : ''}
              </p>
            ) : null}
            <p className="text-xs text-slate-500">
              {row.status === 'canceled' ? 'Отменено' : 'Действующая запись'}
            </p>
          </button>
        ))}
      </div>
      {!list.busy && !list.error && !list.rows.length ? (
        <p className={ticketCard + ' text-sm text-slate-500'}>
          Продаж и броней пока нет.
        </p>
      ) : null}
      <TicketPager list={list} />
    </section>
  )
}
