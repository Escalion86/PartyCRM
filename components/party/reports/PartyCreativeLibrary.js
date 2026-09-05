'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

export default function PartyCreativeLibrary({ companies }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [items, setItems] = useState([])
  const [cursor, setCursor] = useState(null)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  useEffect(() => {
    const controller = new AbortController()
    apiJson('/api/party/report-library', {
      headers: { 'x-partycrm-company-id': companyId },
      signal: controller.signal,
      cache: 'no-store',
    })
      .then((json) => {
        setItems(json.data.items)
        setCursor(json.data.nextCursor)
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false)
      })
    return () => controller.abort()
  }, [companyId])
  const more = async () => {
    setBusy(true)
    setError('')
    try {
      const json = await apiJson(`/api/party/report-library?cursor=${cursor}`, {
        headers: { 'x-partycrm-company-id': companyId },
        cache: 'no-store',
      })
      setItems((previous) => [...previous, ...json.data.items])
      setCursor(json.data.nextCursor)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="mx-auto max-w-4xl space-y-4 px-4 py-6">
      <h1 className="text-2xl font-semibold">Опыт команды</h1>
      <p className="text-sm text-slate-600">
        Принятые творческие отчёты, которыми компания делится с исполнителями:
        удачные решения, впечатления и разбор ситуаций.
      </p>
      <label className="block text-sm">
        Компания
        <select
          className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2"
          value={companyId}
          onChange={(event) => {
            setCompanyId(event.target.value)
            setItems([])
            setCursor(null)
            setBusy(true)
            setError('')
          }}
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.title}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {busy && (
        <p role="status" className="text-sm text-slate-500">
          Загрузка…
        </p>
      )}
      {!busy && !error && !items.length && (
        <p className="rounded-xl bg-white p-5 text-sm text-slate-500">
          Опубликованных материалов пока нет.
        </p>
      )}
      {items.map((item) => (
        <article
          key={item.id}
          className="space-y-3 rounded-xl border border-sky-100 bg-white p-4"
        >
          <div>
            <h2 className="font-semibold">{item.label}</h2>
            <p className="text-sm text-slate-500">
              {item.orderTitle} ·{' '}
              {item.eventDate
                ? new Date(item.eventDate).toLocaleDateString('ru-RU')
                : ''}{' '}
              · {item.staffName}
            </p>
          </div>
          {item.notApplicable ? (
            <p className="text-sm text-slate-600">
              Не применимо: {item.notApplicableReason}
            </p>
          ) : (
            <div
              className="min-w-0 text-sm break-words [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_img]:rounded-lg [&_ol]:list-decimal [&_ol]:pl-6 [&_p]:my-2 [&_ul]:list-disc [&_ul]:pl-6"
              dangerouslySetInnerHTML={{ __html: item.html }}
            />
          )}
        </article>
      ))}
      {cursor && (
        <button
          type="button"
          disabled={busy}
          className="min-h-11 cursor-pointer rounded-lg border border-sky-200 bg-white px-4 text-sm font-semibold text-sky-800 disabled:opacity-50"
          onClick={more}
        >
          Показать ещё
        </button>
      )}
    </section>
  )
}
