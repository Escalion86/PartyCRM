'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import PartyOrderReports from './PartyOrderReports'

export default function PartyReportReviewQueue({ companies }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [reports, setReports] = useState([])
  const [nextCursor, setNextCursor] = useState(null)
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    apiJson('/api/party/reports', { headers: { 'x-partycrm-company-id': companyId }, signal: controller.signal }).then((json) => { setReports(json.data.reports); setNextCursor(json.data.nextCursor) }).catch((cause) => { if (!controller.signal.aborted) setError(cause.message) })
    return () => controller.abort()
  }, [companyId])
  const more = async () => {
    setBusy(true); setError('')
    try {
      const json = await apiJson(`/api/party/reports?cursor=${nextCursor}`, { headers: { 'x-partycrm-company-id': companyId } })
      setReports((previous) => [...previous, ...json.data.reports]); setNextCursor(json.data.nextCursor)
    } catch (cause) { setError(cause.message) }
    finally { setBusy(false) }
  }
  const orders = [...new Map(reports.map((report) => [String(report.orderId), report])).values()]
  return <section className="mx-auto max-w-5xl space-y-4 px-4 py-6">
    <h1 className="text-2xl font-semibold text-slate-900">Проверка отчётов</h1>
    <p className="text-sm text-slate-600">Праздники, в формах которых вы назначены проверяющим. Вам доступны только разрешённые поля.</p>
    <label className="block text-sm">Компания<select className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2" value={companyId} onChange={(event) => { setCompanyId(event.target.value); setSelected(''); setReports([]); setError('') }}>{companies.map((company) => <option key={company.id} value={company.id}>{company.title}</option>)}</select></label>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <div className="grid gap-3 md:grid-cols-[16rem_1fr]"><div className="space-y-2">{orders.map((report) => <button key={report.orderId} type="button" className={`min-h-11 w-full cursor-pointer rounded-lg border p-3 text-left text-sm ${selected === String(report.orderId) ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white'}`} onClick={() => setSelected(String(report.orderId))}><strong className="block">{report.orderTitle || 'Праздник'}</strong>{report.orderDate ? new Date(report.orderDate).toLocaleString('ru-RU') : 'Дата не указана'}</button>)}{!orders.length && !error && <p className="text-sm text-slate-500">Отчётов для проверки пока нет.</p>}{nextCursor && <button type="button" disabled={busy} className="min-h-11 cursor-pointer rounded border px-3 text-sm" onClick={more}>Показать ещё</button>}</div><div className="min-w-0">{selected && <PartyOrderReports key={`${companyId}:${selected}`} companyId={companyId} orderId={selected} />}</div></div>
  </section>
}
