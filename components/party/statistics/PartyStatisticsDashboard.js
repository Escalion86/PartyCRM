'use client'

import { useEffect, useMemo, useState } from 'react'
import { buildPartyStatistics, getStatisticsPeriod } from '@helpers/partyStatistics'
import { formatMoney } from '@helpers/formatMoney'
import { apiJson } from '@helpers/apiClient'

const dateInput = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
const monthLabel = (key) => new Intl.DateTimeFormat('ru-RU', { month: 'short', year: '2-digit' }).format(new Date(`${key}-01T00:00:00`))

const Metric = ({ label, value, hint, accent = false }) => (
  <div className={`min-w-0 overflow-hidden rounded-2xl border p-4 ${accent ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className={`mt-2 break-words text-2xl font-bold ${accent ? 'text-emerald-700' : 'text-slate-900'}`}>{value}</p>
    {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
  </div>
)

const BarRows = ({ rows, valueKey, formatter = formatMoney, emptyText }) => {
  const max = Math.max(...rows.map((item) => Math.abs(item[valueKey])), 1)
  if (!rows.length) return <p className="py-10 text-center text-sm text-slate-500">{emptyText}</p>
  return <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">{rows.map((item) => (
    <div key={item.id ?? item.key} className="min-w-0 max-w-full">
      <div className="mb-1 flex min-w-0 max-w-full items-end gap-3 text-sm">
        <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">{item.title ?? monthLabel(item.key)}</span>
        <span className="shrink-0 whitespace-nowrap text-right font-bold text-slate-900">{formatter(item[valueKey])}</span>
      </div>
      <div className="h-2.5 w-full max-w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
        <div className={`h-full rounded-full ${item[valueKey] < 0 ? 'bg-rose-500' : 'bg-sky-500'}`} style={{ width: `${Math.max(Math.abs(item[valueKey]) / max * 100, 2)}%` }} />
      </div>
      <p className="mt-1 text-xs text-slate-400">{item.orders} заказов</p>
    </div>
  ))}</div>
}

export default function PartyStatisticsDashboard({ orders, services, clients, companyId }) {
  const initial = getStatisticsPeriod('month')
  const [preset, setPreset] = useState('month')
  const [from, setFrom] = useState(dateInput(initial.from))
  const [to, setTo] = useState(dateInput(initial.to))
  const [status, setStatus] = useState('all')
  const [placeType, setPlaceType] = useState('all')
  const [serviceId, setServiceId] = useState('all')
  const [source, setSource] = useState({ orders, services, clients, companyId: '' })
  const loading = source.companyId !== companyId

  useEffect(() => {
    let active = true
    apiJson('/api/party/statistics', {
      cache: 'no-store',
      headers: companyId ? { 'x-partycrm-company-id': companyId } : {},
    }).then((response) => {
      if (active) setSource({ ...(response.data ?? { orders, services, clients }), companyId })
    }).catch(() => {
      if (active) setSource({ orders, services, clients, companyId })
    })
    return () => { active = false }
  }, [companyId, orders, services, clients])

  const statistics = useMemo(() => buildPartyStatistics({ ...source, filters: { from, to, status, placeType, serviceId } }), [source, from, to, status, placeType, serviceId])
  const applyPreset = (value) => {
    const period = getStatisticsPeriod(value)
    setPreset(value); setFrom(dateInput(period.from)); setTo(dateInput(period.to))
  }
  const topService = statistics.services[0]

  return <div className="grid min-w-0 max-w-full grid-cols-[minmax(0,1fr)] gap-5">
    <section className="min-w-0 max-w-full overflow-hidden rounded-2xl border border-sky-100 bg-sky-50 p-4 sm:p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div><h1 className="text-2xl font-bold text-slate-900">Статистика</h1><p className="mt-1 text-sm text-slate-600">{loading ? 'Загружаем полную историю…' : 'Выручка, прибыль и эффективность услуг в одном срезе'}</p></div>
        <button type="button" onClick={() => { applyPreset('month'); setStatus('all'); setPlaceType('all'); setServiceId('all') }} className="cursor-pointer text-left text-sm font-semibold text-sky-700 hover:text-sky-900">Сбросить фильтры</button>
      </div>
      <div className="mt-5 flex min-w-0 max-w-full gap-2 overflow-x-auto pb-1">{[['month','Этот месяц'],['30days','30 дней'],['year','Этот год'],['last_year','Прошлый год']].map(([value,label]) => <button key={value} type="button" onClick={() => applyPreset(value)} className={`min-h-10 shrink-0 cursor-pointer rounded-lg px-3 text-sm font-semibold ${preset === value ? 'bg-sky-600 text-white' : 'border border-sky-200 bg-white text-sky-800'}`}>{label}</button>)}</div>
      <div className="mt-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600">С даты<input type="date" value={from} onChange={(e) => { setPreset('custom'); setFrom(e.target.value) }} className="min-h-10 w-full min-w-0 rounded-lg border border-sky-200 bg-white px-3 text-sm font-normal text-slate-900" /></label>
        <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600">По дату<input type="date" value={to} onChange={(e) => { setPreset('custom'); setTo(e.target.value) }} className="min-h-10 w-full min-w-0 rounded-lg border border-sky-200 bg-white px-3 text-sm font-normal text-slate-900" /></label>
        <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600">Статус<select value={status} onChange={(e) => setStatus(e.target.value)} className="min-h-10 w-full min-w-0 cursor-pointer rounded-lg border border-sky-200 bg-white px-3 text-sm font-normal text-slate-900"><option value="all">Все, кроме отменённых</option><option value="draft">Черновик</option><option value="active">Активный</option><option value="closed">Закрытый</option></select></label>
        <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600">Тип<select value={placeType} onChange={(e) => setPlaceType(e.target.value)} className="min-h-10 w-full min-w-0 cursor-pointer rounded-lg border border-sky-200 bg-white px-3 text-sm font-normal text-slate-900"><option value="all">Все типы</option><option value="company_location">На точке</option><option value="client_address">Выездной</option></select></label>
        <label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600">Услуга<select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="min-h-10 w-full min-w-0 cursor-pointer rounded-lg border border-sky-200 bg-white px-3 text-sm font-normal text-slate-900"><option value="all">Все услуги</option>{source.services.map((item) => <option key={item._id} value={String(item._id)}>{item.title}</option>)}</select></label>
      </div>
    </section>

    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-3 min-[380px]:grid-cols-2 lg:grid-cols-6">
      <Metric label="Выручка" value={formatMoney(statistics.totals.revenue)} />
      <Metric label="Прибыль" value={formatMoney(statistics.totals.profit)} hint={`${statistics.totals.marginRate.toFixed(1)}% маржа`} accent />
      <Metric label="Заказы" value={statistics.totals.orders} />
      <Metric label="Клиенты" value={statistics.totals.clients} />
      <Metric label="Средний чек" value={formatMoney(statistics.totals.averageOrder)} />
      <Metric label="Выплаты и расходы" value={formatMoney(statistics.totals.payouts + statistics.totals.expenses)} />
    </section>

    {topService ? <section className="rounded-2xl bg-slate-900 p-5 text-white"><p className="text-xs font-semibold uppercase tracking-wider text-sky-300">Самая прибыльная услуга в срезе</p><div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between"><h2 className="text-xl font-bold">{topService.title}</h2><p className="text-2xl font-bold text-emerald-300">{formatMoney(topService.profit)}</p></div></section> : null}

    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="text-lg font-bold text-slate-900">Динамика выручки</h2><p className="mb-5 text-sm text-slate-500">По месяцам выбранного периода</p><BarRows rows={statistics.monthly} valueKey="revenue" emptyText="В выбранном периоде нет заказов" /></section>
      <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6"><h2 className="text-lg font-bold text-slate-900">Услуги по прибыли</h2><p className="mb-5 text-sm text-slate-500">Если услуг несколько, суммы распределяются между ними поровну</p><BarRows rows={statistics.services.slice(0, 8)} valueKey="profit" emptyText="Нет данных по услугам" /></section>
    </div>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white"><div className="p-4 sm:p-6"><h2 className="text-lg font-bold text-slate-900">Клиенты по выручке</h2><p className="text-sm text-slate-500">Кто приносит больше заказов и дохода</p></div><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr><th className="px-5 py-3">Клиент</th><th className="px-5 py-3">Заказов</th><th className="px-5 py-3">Выручка</th><th className="px-5 py-3">Прибыль</th></tr></thead><tbody>{statistics.clients.slice(0, 15).map((item) => <tr key={item.id} className="border-t border-slate-100"><td className="px-5 py-3 font-semibold text-slate-800">{item.title}</td><td className="px-5 py-3">{item.orders}</td><td className="px-5 py-3 font-semibold">{formatMoney(item.revenue)}</td><td className={`px-5 py-3 font-semibold ${item.profit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>{formatMoney(item.profit)}</td></tr>)}</tbody></table>{!statistics.clients.length ? <p className="p-8 text-center text-sm text-slate-500">Нет данных по клиентам</p> : null}</div></section>
  </div>
}
