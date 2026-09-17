'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { parsePartyInboxSchedule } from '@helpers/partyInboxSchedule'

const input = 'min-h-11 min-w-0 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm'
const button = 'min-h-11 cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:opacity-50'
const days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']

function Hours({ value, onChange, label }) {
  return <fieldset className="grid min-w-0 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-3">
    <legend className="px-1 text-sm font-medium">{label}</legend>
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={value.closed} onChange={event => onChange({ ...value, closed: event.target.checked })} />Выходной</label>
    <label className="min-w-0 text-sm">Начало<input type="time" required={!value.closed} disabled={value.closed} className={input} value={value.opens} onChange={event => onChange({ ...value, opens: event.target.value })} /></label>
    <label className="min-w-0 text-sm">Окончание<input type="time" required={!value.closed} disabled={value.closed} className={input} value={value.closes} onChange={event => onChange({ ...value, closes: event.target.value })} /></label>
  </fieldset>
}

function ScheduleForm({ activeCompanyId }) {
  const [draft, setDraft] = useState(null)
  const [revision, setRevision] = useState(0)
  const [zone, setZone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setDraft(null); setError(''); setMessage('')
    apiJson('/api/party/inbox/schedule', { cache: 'no-store', signal: controller.signal, headers: { 'x-partycrm-company-id': activeCompanyId } })
      .then(({ data }) => { if (!controller.signal.aborted) { setDraft(data.schedule); setRevision(data.revision); setZone(data.timeZone) } })
      .catch(cause => { if (!controller.signal.aborted) setError(cause.message) })
    return () => controller.abort()
  }, [activeCompanyId, reload])
  const change = value => { setDraft(value); setMessage(''); setError('') }
  const save = async event => {
    event.preventDefault(); setError(''); setMessage('')
    let schedule
    try { schedule = parsePartyInboxSchedule(draft) } catch (cause) { setError(cause.message); return }
    setBusy(true)
    try {
      const { data } = await apiJson('/api/party/inbox/schedule', { method: 'PATCH', headers: { 'x-partycrm-company-id': activeCompanyId }, body: JSON.stringify({ schedule, expectedRevision: revision }) })
      setDraft(data.schedule); setRevision(data.revision); setMessage('График сохранён. Новые обращения будут учитывать его.')
    } catch (cause) { setError(cause.message) } finally { setBusy(false) }
  }
  return <div className="max-w-3xl space-y-4">
    <p className="text-sm text-slate-600">В рабочие часы ответ нужен за 15 минут, вне графика — за 30 минут после ближайшего открытия. Часовой пояс: <strong>{zone || 'загрузка…'}</strong> (меняется в общих настройках). Существующие сроки ответа не пересчитываются.</p>
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{message}</p>}
    <button type="button" disabled={busy} className={button} onClick={() => { if (!draft || window.confirm('Загрузить сохранённый график? Несохранённые изменения будут потеряны.')) setReload(value => value + 1) }}>Загрузить сохранённый график</button>
    {!draft ? <p role="status">{error ? 'График не загружен.' : 'Загрузка графика…'}</p> : <form onSubmit={save}>
      <fieldset disabled={busy} className="min-w-0 space-y-4">
        <legend className="mb-3 text-lg font-semibold">Рабочая неделя</legend>
        {[1, 2, 3, 4, 5, 6, 0].map(index => <Hours key={index} label={days[index]} value={draft.week[index]} onChange={value => change({ ...draft, week: draft.week.map((day, i) => i === index ? value : day) })} />)}
        <div className="pt-4"><h2 className="text-lg font-semibold">Исключения по датам</h2><p className="mt-1 text-sm text-slate-600">Укажите выходной или особые часы на праздник. Исключение заменяет график недели только в указанную дату; государственные праздники автоматически не добавляются. Интервал должен заканчиваться в тот же день.</p></div>
        {draft.exceptions.map((exception, index) => <section key={index} aria-label={`Исключение ${index + 1}`} className="space-y-2 rounded-lg bg-slate-50 p-3">
          <div className="flex flex-wrap items-end gap-3"><label className="min-w-0 flex-1 text-sm">Дата<input type="date" required className={input} value={exception.date} onChange={event => change({ ...draft, exceptions: draft.exceptions.map((day, i) => i === index ? { ...day, date: event.target.value } : day) })} /></label><button type="button" className={button} onClick={() => change({ ...draft, exceptions: draft.exceptions.filter((_, i) => i !== index) })}>Удалить исключение</button></div>
          <Hours label="Часы в эту дату" value={exception} onChange={value => change({ ...draft, exceptions: draft.exceptions.map((day, i) => i === index ? value : day) })} />
        </section>)}
        <button type="button" disabled={draft.exceptions.length >= 366} className={button} onClick={() => change({ ...draft, exceptions: [...draft.exceptions, { date: '', closed: true, opens: '09:00', closes: '20:00' }] })}>Добавить исключение</button>
        <div><button type="submit" className={`${button} bg-sky-600 text-white`}>{busy ? 'Сохранение…' : 'Сохранить график'}</button></div>
      </fieldset>
    </form>}
  </div>
}

export default function CompanySettingsScheduleContent({ activeCompanyId }) {
  return <ScheduleForm key={activeCompanyId} activeCompanyId={activeCompanyId} />
}
