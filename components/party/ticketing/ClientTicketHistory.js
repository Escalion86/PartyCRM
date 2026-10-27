'use client'

import { TicketPager } from './TicketingControls'
import { useTicketingList } from './useTicketingData'
import { ticketDate, ticketMoney } from './ticketingUi'

export default function ClientTicketHistory({
  companyId,
  clientId,
  enabled,
  canFinance = false,
}) {
  const list = useTicketingList({
    companyId,
    section: 'clientSales',
    enabled: Boolean(companyId && clientId),
    filters: new URLSearchParams({ clientId: String(clientId) }).toString(),
  })
  if (!enabled && !list.rows.length && !list.error) return null
  return (
    <section
      aria-label="Билетная история клиента"
      className="space-y-3 rounded-lg border border-sky-100 bg-white p-3"
    >
      <h3 className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
        Билеты и посещения
      </h3>
      <div className="grid gap-2">
        {list.rows.map((sale) => (
          <article
            key={sale._id}
            className="space-y-1 rounded-lg border border-slate-100 bg-slate-50 p-3 text-sm"
          >
            <p className="font-semibold break-words text-slate-900">
              {sale.programTitle || 'Посещение'}
            </p>
            <p className="text-slate-600">
              Куплено: {ticketDate(sale.createdAt)} · Билетов: {sale.quantity}
            </p>
            <p className="text-slate-600">
              {sale.admission === 'open'
                ? 'Без фиксированного времени'
                : 'По сеансу'}
              {sale.status === 'canceled' ? ' · отменено' : ''}
              {sale.admittedQuantity > 0
                ? ` · вход отмечен: ${sale.admittedQuantity}`
                : ''}
              {sale.refundedQuantity > 0
                ? ` · отменено билетов: ${sale.refundedQuantity}`
                : ''}
            </p>
            {canFinance && Number.isSafeInteger(sale.totalAmountKopecks) ? (
              <p className="font-medium text-sky-800">
                Стоимость: {ticketMoney(sale.totalAmountKopecks)}
                {Number.isSafeInteger(sale.dueAmountKopecks)
                  ? ` · осталось оплатить: ${ticketMoney(sale.dueAmountKopecks)}`
                  : ''}
              </p>
            ) : null}
          </article>
        ))}
      </div>
      {!list.busy && !list.error && !list.rows.length ? (
        <p className="text-sm text-slate-500">Билетных покупок пока нет.</p>
      ) : null}
      <TicketPager list={list} />
    </section>
  )
}
