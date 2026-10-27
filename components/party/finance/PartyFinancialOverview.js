'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import FieldHelp from '@components/FieldHelp'

const companyDate = (timeZone) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const read = (type) => parts.find((part) => part.type === type).value
  return `${read('year')}-${read('month')}-${read('day')}`
}
const money = (value) =>
  value === null || value === undefined
    ? 'Нет данных'
    : (value / 100).toLocaleString('ru-RU', {
        style: 'currency',
        currency: 'RUB',
      })
const control =
  'min-h-11 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'

export default function PartyFinancialOverview({
  companyId,
  timeZone = 'Asia/Krasnoyarsk',
}) {
  const [from, setFrom] = useState(
    () => companyDate(timeZone).slice(0, 7) + '-01'
  )
  const [to, setTo] = useState(() => companyDate(timeZone))
  const [query, setQuery] = useState(() => ({ from, to, retry: 0 }))
  const key = `${companyId}:${query.from}:${query.to}:${query.retry}`
  const [state, setState] = useState({
    key: '',
    data: null,
    busy: true,
    error: '',
  })
  useEffect(() => {
    const controller = new AbortController()
    apiJson(
      `/api/party/finance/overview?${new URLSearchParams({ from: query.from, to: query.to })}`,
      {
        headers: { 'x-partycrm-company-id': companyId },
        signal: controller.signal,
        cache: 'no-store',
      }
    )
      .then((result) => {
        if (!controller.signal.aborted)
          setState({ key, data: result.data, busy: false, error: '' })
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setState({
            key,
            data: null,
            busy: false,
            error: cause.message || 'Не удалось загрузить обзор',
          })
      })
    return () => controller.abort()
  }, [companyId, query, key])
  const data = state.key === key ? state.data : null
  const busy = state.key !== key || state.busy
  return (
    <section
      aria-label="Деньги и проведённые мероприятия"
      className="space-y-4 rounded-xl border border-sky-100 bg-white p-3 sm:p-5"
    >
      <div>
        <h2 className="text-lg font-semibold text-sky-950">
          Деньги и проведённые мероприятия
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Оплаты учитываются по дате операции, оказанные услуги — по отметке
          проведения. Период: часовой пояс компании.
        </p>
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault()
          setQuery({ from, to, retry: query.retry + 1 })
        }}
      >
        <label className="grid gap-1 text-sm">
          С
          <input
            type="date"
            required
            className={control}
            value={from}
            onChange={(event) => setFrom(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-sm">
          По
          <input
            type="date"
            required
            className={control}
            value={to}
            min={from}
            onChange={(event) => setTo(event.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className={`${control} cursor-pointer font-semibold text-sky-800 disabled:opacity-50`}
        >
          Показать
        </button>
      </form>
      {busy && (
        <p role="status" className="text-sm text-slate-500">
          Считаем подтверждённые записи…
        </p>
      )}
      {state.key === key && state.error && (
        <p role="alert" className="text-sm text-red-700">
          {state.error}
        </p>
      )}
      {data && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [
                'Поступления по заказам',
                data.orderPaymentsKopecks,
                data.access.orderPayments,
              ],
              [
                'Оказанные услуги по заказам',
                data.orderEarnedKopecks,
                data.access.orderEarned,
              ],
              [
                'Возвраты по заказам',
                data.orderRefundsKopecks,
                data.access.orderRefunds,
              ],
              [
                'Оплаты билетов',
                data.ticketPaymentsKopecks,
                data.access.ticketFinance,
              ],
              [
                'Оказанные билетные услуги',
                data.ticketEarnedKopecks,
                data.access.ticketFinance,
              ],
              [
                'Возвраты билетов',
                data.ticketRefundsKopecks,
                data.access.ticketFinance,
              ],
            ]
              .filter(([, , allowed]) => allowed)
              .map(([label, value]) => (
                <div key={label} className="rounded-lg bg-sky-50 p-3">
                  <p className="text-sm text-slate-600">{label}</p>
                  <p className="mt-1 text-xl font-semibold text-sky-950">
                    {money(value)}
                  </p>
                </div>
              ))}
          </div>
          {data.unmarkedPastOrders > 0 && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              Заказов за период без отметки проведения:{' '}
              {data.unmarkedPastOrders}. Они ещё не включены в оказанные услуги.
            </p>
          )}
          {data.access.ticketFinance && (
            <p className="text-sm text-slate-600">
              Продано билетов: {data.ticketQuantity}; отменено за период:{' '}
              {data.refundedTicketQuantity}.{' '}
              <FieldHelp
                label="Продажи и оказанные услуги"
                text="Для сеансов услуга учитывается после отметки проведения; для свободного посещения — при регистрации входа. Ручная запись оплаты не означает подтверждение банка или кассы. Сверка выплат агрегаторов появится после подключения подтверждённого обмена."
              />
            </p>
          )}
        </>
      )}
    </section>
  )
}
