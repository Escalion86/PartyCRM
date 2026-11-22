'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { partyDateAtTime, partyDateInZone } from '@helpers/partyWorkingSchedule'
import usePartyUnsavedChanges, {
  requestPartyLeave,
} from '@components/party/navigation/usePartyUnsavedChanges'
import { TicketError, TicketField } from './TicketingControls'
import { useTicketingCommand } from './useTicketingData'
import {
  ticketButton,
  ticketCard,
  ticketControl,
  ticketDate,
  ticketKopecks,
  ticketMoney,
  ticketPrimary,
} from './ticketingUi'

function useChannelSummary(companyId, sessionId, revision) {
  const [refresh, setRefresh] = useState(0)
  const [page, setPage] = useState(null)
  const [state, setState] = useState(null)
  const key = JSON.stringify([companyId, sessionId, revision, refresh])
  const cursor = page?.key === key ? page.cursor : ''
  const requestKey = JSON.stringify([key, cursor])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ section: 'channelSummary', sessionId })
    if (cursor) params.set('cursor', cursor)
    apiJson('/api/party/ticketing?' + params, {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(({ data }) => {
        if (controller.signal.aborted) return
        if (
          !data ||
          !Array.isArray(data.records) ||
          !Array.isArray(data.channels)
        )
          throw new Error('Не удалось получить данные по каналам')
        setState((previous) => ({
          key,
          requestKey,
          data: {
            ...data,
            records:
              cursor && previous?.key === key
                ? [
                    ...new Map(
                      [...previous.data.records, ...data.records].map((row) => [
                        row._id,
                        row,
                      ])
                    ).values(),
                  ]
                : data.records,
          },
          error: '',
        }))
      })
      .catch((cause) => {
        if (controller.signal.aborted) return
        setState((previous) => ({
          key,
          requestKey,
          data:
            cursor &&
            previous?.key === key &&
            ![401, 403].includes(cause.status)
              ? previous.data
              : null,
          error: cause.message || 'Не удалось загрузить продажи',
        }))
      })
    return () => controller.abort()
  }, [companyId, cursor, key, requestKey, sessionId])

  const data = state?.key === key ? state.data : null
  const busy = state?.requestKey !== requestKey
  const error = busy ? '' : state.error
  const reload = () => setRefresh((value) => value + 1)
  const more = () => {
    if (data?.meta?.nextCursor && !busy)
      setPage({ key, cursor: data.meta.nextCursor })
  }
  return { data, busy, error, reload, more }
}

function ChannelRecordForm({
  companyId,
  sessionId,
  timeZone,
  channels,
  sale,
  onSaved,
  onClose,
}) {
  const today = partyDateInZone(new Date(), timeZone)
  const [initial] = useState(() => ({
    channel: sale?.channelTitle || '',
    date: today,
    quantity: sale ? '0' : '',
    amount: sale ? '0' : '',
    paymentMethod: '',
    reference: '',
    comment: '',
  }))
  const [draft, setDraft] = useState(initial)
  const [error, setError] = useState('')
  const command = useTicketingCommand(companyId)
  const listId = useId()
  const paymentMethodsId = useId()
  const firstField = useRef(null)
  const locked = command.busy || command.uncertain
  const dirty = Object.keys(initial).some(
    (name) => draft[name] !== initial[name]
  )
  usePartyUnsavedChanges(dirty, {
    label: 'операция по билетам',
    scope: companyId + ':ticket-channel',
    pending: locked,
  })
  useEffect(() => firstField.current?.focus(), [])

  const set = (field, value) => {
    setDraft((previous) => ({ ...previous, [field]: value }))
    setError('')
  }

  const submit = async (event) => {
    event.preventDefault()
    const amountKopecks = ticketKopecks(draft.amount)
    const quantity = Number(draft.quantity)
    if (
      !draft.quantity ||
      !Number.isSafeInteger(quantity) ||
      quantity < (sale ? 0 : 1) ||
      amountKopecks === null ||
      (!quantity && !amountKopecks) ||
      (!sale && !draft.channel.trim())
    ) {
      setError(
        sale
          ? 'Укажите количество билетов или сумму возврата.'
          : 'Проверьте канал, количество и сумму продажи.'
      )
      return
    }

    let occurredAt
    try {
      const dayStart = partyDateAtTime(draft.date, '00:00', timeZone)
      const saleTime = sale && new Date(sale.occurredAt)
      occurredAt =
        saleTime && partyDateInZone(saleTime, timeZone) === draft.date
          ? saleTime.toISOString()
          : dayStart.toISOString()
    } catch (cause) {
      setError(cause.message)
      return
    }

    const result = await command.run('channel.record', {
      sessionId,
      kind: sale ? 'refund' : 'sale',
      ...(sale
        ? { saleRecordId: sale._id }
        : { channelTitle: draft.channel.trim() }),
      occurredAt,
      quantity,
      amountKopecks,
      ...(draft.paymentMethod.trim()
        ? { paymentMethod: draft.paymentMethod.trim() }
        : {}),
      externalReference: draft.reference.trim(),
      comment: draft.comment.trim(),
    })
    if (result) onSaved(sale ? 'Возврат записан.' : 'Продажа записана.')
  }

  return (
    <form
      onSubmit={submit}
      aria-label={sale ? 'Запись возврата' : 'Запись продажи с площадки'}
      className="space-y-3 rounded-xl border border-sky-100 bg-slate-50 p-3 sm:p-4"
    >
      <h4 className="font-semibold text-slate-950">
        {sale ? 'Записать возврат' : 'Записать продажу с площадки'}
      </h4>
      {sale ? (
        <p className="text-sm text-slate-700">
          {sale.channelTitle}
          {sale.externalReference ? ', № ' + sale.externalReference : ''}. По
          этой продаже можно вернуть до {sale.remainingQuantity} билетов на
          сумму до {ticketMoney(sale.refundableAmountKopecks)}.
        </p>
      ) : (
        <p className="text-sm text-slate-700">
          Внесите одну операцию из отчёта площадки. Укажите полную сумму оплаты
          до вычета комиссии.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {!sale ? (
          <TicketField label="Канал продаж">
            <input
              ref={firstField}
              required
              list={listId}
              className={ticketControl}
              maxLength={120}
              value={draft.channel}
              disabled={locked}
              onChange={(event) => set('channel', event.target.value)}
            />
            <datalist id={listId}>
              {channels.map((channel) => (
                <option key={channel.channelKey} value={channel.channelTitle} />
              ))}
            </datalist>
          </TicketField>
        ) : null}
        <TicketField label={sale ? 'Дата возврата' : 'Дата продажи'}>
          <input
            ref={sale ? firstField : undefined}
            required
            type="date"
            className={ticketControl}
            value={draft.date}
            min={sale ? partyDateInZone(sale.occurredAt, timeZone) : undefined}
            max={today}
            disabled={locked}
            onChange={(event) => set('date', event.target.value)}
          />
        </TicketField>
        <TicketField label="Количество билетов">
          <input
            required
            type="number"
            inputMode="numeric"
            min={sale ? 0 : 1}
            max={sale?.remainingQuantity ?? 100000}
            step={1}
            className={ticketControl}
            value={draft.quantity}
            disabled={locked}
            onChange={(event) => set('quantity', event.target.value)}
          />
        </TicketField>
        <TicketField
          label={sale ? 'Сумма возврата, ₽' : 'Сумма продажи до комиссии, ₽'}
        >
          <input
            required
            inputMode="decimal"
            className={ticketControl}
            value={draft.amount}
            disabled={locked}
            onChange={(event) => set('amount', event.target.value)}
          />
        </TicketField>
        <TicketField
          label={
            sale
              ? 'Способ возврата (если известен)'
              : 'Способ оплаты (если известен)'
          }
        >
          <input
            list={paymentMethodsId}
            className={ticketControl}
            maxLength={80}
            value={draft.paymentMethod}
            disabled={locked}
            onChange={(event) => set('paymentMethod', event.target.value)}
          />
          <datalist id={paymentMethodsId}>
            {['Карта', 'Наличные', 'СБП', 'Перевод', 'Счёт'].map((method) => (
              <option key={method} value={method} />
            ))}
          </datalist>
        </TicketField>
      </div>
      <details className="rounded-lg border border-slate-200 bg-white px-3">
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-slate-700">
          Номер записи и комментарий
        </summary>
        <div className="grid gap-3 pb-3 sm:grid-cols-2">
          <TicketField label="Номер операции или строки из отчёта">
            <input
              className={ticketControl}
              maxLength={180}
              value={draft.reference}
              disabled={locked}
              onChange={(event) => set('reference', event.target.value)}
            />
          </TicketField>
          <TicketField label="Комментарий">
            <input
              className={ticketControl}
              maxLength={1000}
              value={draft.comment}
              disabled={locked}
              onChange={(event) => set('comment', event.target.value)}
            />
          </TicketField>
        </div>
      </details>
      <TicketError>{error || command.error}</TicketError>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={ticketPrimary} disabled={command.busy}>
          {command.busy
            ? 'Сохраняем…'
            : command.uncertain
              ? 'Повторить сохранение'
              : sale
                ? 'Сохранить возврат'
                : 'Сохранить продажу'}
        </button>
        <button
          type="button"
          className={ticketButton}
          disabled={locked}
          onClick={onClose}
        >
          Отмена
        </button>
      </div>
    </form>
  )
}

function ChannelTotals({ channels, totals }) {
  return (
    <table className="w-full table-fixed border-collapse text-sm tabular-nums">
      <caption className="sr-only">
        Количество и стоимость билетов после возвратов
      </caption>
      <thead className="border-b border-slate-200 text-slate-700">
        <tr>
          <th scope="col" className="w-[43%] py-2 pr-1 text-left font-medium">
            Канал
          </th>
          <th scope="col" className="w-[18%] py-2 text-right font-medium">
            Билеты
          </th>
          <th scope="col" className="py-2 pl-2 text-right font-medium">
            Сумма
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {channels.map((channel) => (
          <tr key={channel.channelKey}>
            <th
              scope="row"
              className="py-2 pr-1 text-left font-medium break-words"
            >
              {channel.channelTitle}
            </th>
            <td className="py-2 text-right break-words">
              {channel.netQuantity}
            </td>
            <td className="py-2 pl-2 text-right break-words">
              {ticketMoney(channel.netAmountKopecks)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot className="border-t border-slate-200 font-semibold text-slate-950">
        <tr>
          <th scope="row" className="py-2 text-left">
            Итого
          </th>
          <td className="py-2 text-right break-words">{totals.netQuantity}</td>
          <td className="py-2 pl-2 text-right break-words">
            {ticketMoney(totals.netAmountKopecks)}
          </td>
        </tr>
      </tfoot>
    </table>
  )
}

export default function TicketSessionSales({
  companyId,
  session,
  timeZone = 'Europe/Moscow',
  revision,
  canSell,
  canRefund,
  headingRef,
  onClose,
  onOpenDirectSales,
}) {
  const headingId = useId()
  const formScope = companyId + ':ticket-channel'
  const summary = useChannelSummary(companyId, String(session._id), revision)
  const { data } = summary
  const [editor, setEditor] = useState(null)
  const [notice, setNotice] = useState('')
  const editorTrigger = useRef(null)
  const allowedEditor = editor && (editor.sale ? canRefund : canSell)
  const date = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    dateStyle: 'medium',
  })
  const changeEditor = (next, trigger) => {
    if (editor && next && editor.sale?._id === next.sale?._id) return
    if (
      editor &&
      !requestPartyLeave({
        kind: 'record',
        target: `ticket-channel-${next?.sale?._id || (next ? 'sale' : 'close-form')}`,
        scope: formScope,
      })
    )
      return
    setNotice('')
    setEditor(next)
    if (trigger) editorTrigger.current = trigger
    if (!next) requestAnimationFrame(() => editorTrigger.current?.focus())
  }

  return (
    <section aria-labelledby={headingId} className={ticketCard + ' space-y-4'}>
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3
            id={headingId}
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-semibold text-sky-950"
          >
            Продажи по каналам
          </h3>
          <p className="text-sm break-words text-slate-700">
            {session.title || 'Сеанс'} · {ticketDate(session.startsAt)}
          </p>
        </div>
        <button type="button" className={ticketButton} onClick={onClose}>
          Закрыть сверку
        </button>
      </header>
      <TicketError>{summary.error}</TicketError>
      {!data ? (
        summary.busy ? (
          <p role="status" className="text-sm text-slate-700">
            Загружаем продажи…
          </p>
        ) : (
          <button
            type="button"
            className={ticketButton}
            onClick={summary.reload}
          >
            Повторить загрузку
          </button>
        )
      ) : (
        <>
          <div>
            <p className="text-sm text-slate-700">
              Продажи после возвратов, до вычета комиссии площадок
            </p>
            <ChannelTotals channels={data.channels} totals={data.totals} />
            {data.unpaidQuantity > 0 ? (
              <p className="text-sm text-slate-700">
                В бронях CRM без полной оплаты: {data.unpaidQuantity} билетов на{' '}
                {ticketMoney(data.unpaidAmountKopecks)}.
              </p>
            ) : null}
            {data.unclassifiedRefundQuantity > 0 ||
            data.unclassifiedRefundAmountKopecks > 0 ? (
              <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                Проверьте возвраты по частично оплаченным броням CRM в истории
                билетов. Они не вошли в сверку.
              </p>
            ) : null}
            {onOpenDirectSales ? (
              <button
                type="button"
                className={ticketButton + ' mt-2'}
                onClick={() => onOpenDirectSales(String(session._id))}
              >
                История прямых продаж
              </button>
            ) : null}
          </div>
          {canSell ? (
            <button
              type="button"
              className={ticketPrimary}
              onClick={(event) =>
                changeEditor({ sale: null }, event.currentTarget)
              }
            >
              Записать продажу с площадки
            </button>
          ) : null}
          {allowedEditor ? (
            <ChannelRecordForm
              key={editor.sale?._id || 'sale'}
              companyId={companyId}
              sessionId={String(session._id)}
              timeZone={timeZone}
              channels={
                data.suggestedChannels ||
                data.channels.filter((channel) => channel.source === 'manual')
              }
              sale={editor.sale}
              onClose={() => changeEditor(null)}
              onSaved={(message) => {
                setEditor(null)
                setNotice(message)
                summary.reload()
                headingRef.current?.focus()
              }}
            />
          ) : null}
          <section
            aria-label="Записи с площадок"
            className="space-y-2 border-t border-slate-200 pt-3"
          >
            <h4 className="font-semibold text-slate-950">Записи с площадок</h4>
            {data.records.length ? (
              <ul className="divide-y divide-slate-200">
                {data.records.map((record) => (
                  <li
                    key={record._id}
                    className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"
                  >
                    <div className="min-w-0 text-sm text-slate-700">
                      <p className="font-medium break-words text-slate-950">
                        {record.channelTitle} ·{' '}
                        {record.kind === 'sale' ? 'Продажа' : 'Возврат'}
                      </p>
                      <p className="tabular-nums">
                        {date.format(new Date(record.occurredAt))} ·{' '}
                        {record.quantity} бил. ·{' '}
                        {ticketMoney(record.amountKopecks)}
                      </p>
                      {record.externalReference ? (
                        <p className="break-words">
                          № {record.externalReference}
                        </p>
                      ) : null}
                      {record.paymentMethod ? (
                        <p className="break-words">
                          {record.kind === 'sale' ? 'Оплата' : 'Возврат'}:{' '}
                          {record.paymentMethod}
                        </p>
                      ) : null}
                      {record.comment ? (
                        <p className="break-words">{record.comment}</p>
                      ) : null}
                    </div>
                    {canRefund &&
                    record.kind === 'sale' &&
                    (record.remainingQuantity > 0 ||
                      record.refundableAmountKopecks > 0) ? (
                      <button
                        type="button"
                        className={ticketButton + ' justify-self-start'}
                        onClick={(event) =>
                          changeEditor({ sale: record }, event.currentTarget)
                        }
                      >
                        Записать возврат
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-700">
                Продаж с внешних площадок пока нет.
              </p>
            )}
            {data.meta?.nextCursor ? (
              <button
                type="button"
                className={ticketButton}
                disabled={summary.busy}
                onClick={summary.error ? summary.reload : summary.more}
              >
                {summary.busy
                  ? 'Загружаем…'
                  : summary.error
                    ? 'Загрузить список заново'
                    : 'Показать ещё записи'}
              </button>
            ) : null}
          </section>
        </>
      )}
      {notice ? (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
    </section>
  )
}
