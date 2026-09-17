'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

export default function PartyReportCoordinator({ companyId, orderId, onChanged }) {
  const [data, setData] = useState(null)
  const [selected, setSelected] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const generation = useRef(0)
  const url = `/api/party/orders/${orderId}/report-coordinator`
  const load = useCallback(async () => {
    const current = ++generation.current
    setBusy(true)
    setError('')
    try {
      const json = await apiJson(url, { headers: { 'x-partycrm-company-id': companyId } })
      if (current !== generation.current) return
      setData(json.data)
      setSelected(json.data.coordinatorStaffId || '')
      setConflict(false)
    } catch (cause) {
      if (current === generation.current) setError(cause.message)
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }, [companyId, url])
  useEffect(() => {
    setData(null)
    load()
    return () => { generation.current += 1 }
  }, [load])
  const save = async () => {
    const current = generation.current
    setBusy(true)
    setError('')
    try {
      const json = await apiJson(url, {
        method: 'PATCH',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify({ staffId: selected || null, expectedRevision: data.revision }),
      })
      if (current !== generation.current) return
      setData(json.data)
      setSelected(json.data.coordinatorStaffId || '')
      onChanged?.(json.data)
    } catch (cause) {
      if (current !== generation.current) return
      setError(cause.message)
      setConflict(cause.status === 409)
    } finally {
      if (current === generation.current) setBusy(false)
    }
  }
  const button = 'min-h-10 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
  return (
    <section className="space-y-3 rounded-xl border border-sky-100 bg-white p-3 sm:p-4" aria-label="Координатор командного отчёта">
      <h3 className="font-semibold text-slate-900">Координатор командного отчёта</h3>
      <p className="text-sm text-slate-600">
        {data?.suggested ? 'В команде больше четырёх участников — назначьте координатора для общего отчёта.' : 'Координатора можно назначить для любой команды, в том числе при работе с подрядчиками.'}
      </p>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {data && <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-0 flex-1 text-sm text-slate-700">
          Участник команды
          <select className="mt-1 block min-h-11 w-full min-w-0 cursor-pointer rounded-lg border border-slate-300 bg-white p-2" value={selected} onChange={(event) => setSelected(event.target.value)} disabled={busy || conflict}>
            <option value="">Не назначен</option>
            {data.staff.map((person) => <option key={person._id} value={person._id}>{[person.firstName, person.secondName].filter(Boolean).join(' ') || 'Без имени'}</option>)}
          </select>
        </label>
        <button className={button} type="button" onClick={save} disabled={busy || conflict || selected === (data.coordinatorStaffId || '')}>Сохранить координатора</button>
      </div>}
      {busy && <p role="status" className="text-sm text-slate-500">Загрузка…</p>}
      {(conflict || (!data && error)) && <button className={button} type="button" onClick={load} disabled={busy}>Обновить назначение</button>}
    </section>
  )
}
