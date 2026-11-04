'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import PartyWorkingScheduleEditor from '@components/party/locations/PartyWorkingScheduleEditor'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'

export default function CompanySettingsBookingContent({ activeCompanyId }) {
  const [state, setState] = useState(null)
  const [schedule, setSchedule] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [retry, setRetry] = useState(0)
  const dirty = Boolean(
    state && JSON.stringify(schedule) !== JSON.stringify(state.schedule)
  )
  usePartyUnsavedChanges(dirty, {
    label: 'график бронирования',
    scope: activeCompanyId,
    pending: busy,
  })
  useEffect(() => {
    const controller = new AbortController()
    apiJson('/api/party/booking-settings', {
      headers: { 'x-partycrm-company-id': activeCompanyId },
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) {
          setState(result.data)
          setSchedule(result.data.schedule)
          setError('')
        }
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message)
      })
    return () => controller.abort()
  }, [activeCompanyId, retry])
  const save = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const result = await apiJson('/api/party/booking-settings', {
        method: 'PUT',
        headers: { 'x-partycrm-company-id': activeCompanyId },
        body: JSON.stringify({ schedule, expectedRevision: state.revision }),
      })
      setState({ ...state, ...result.data })
      setNotice('Рабочий график сохранён.')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        График компании используется для выездов и помещений без собственного
        графика. Он не связан с графиком ответов на входящие обращения.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      <button
        type="button"
        disabled={busy}
        className="min-h-11 cursor-pointer text-sm font-semibold text-sky-800 underline"
        onClick={() => {
          if (
            !dirty ||
            window.confirm(
              'Загрузить график и отменить несохранённые изменения?'
            )
          )
            setRetry((value) => value + 1)
        }}
      >
        Загрузить сохранённый график
      </button>
      {state ? (
        <>
          <p className="text-sm">Часовой пояс: {state.timeZone}</p>
          <PartyWorkingScheduleEditor
            value={schedule}
            onChange={setSchedule}
            disabled={busy}
            inheritLabel="График пока не настроен"
          />
          <button
            type="button"
            disabled={busy || !dirty}
            className="min-h-11 cursor-pointer rounded-lg bg-sky-700 px-4 py-2 font-semibold text-white disabled:opacity-50"
            onClick={save}
          >
            {busy ? 'Сохранение…' : 'Сохранить график'}
          </button>
        </>
      ) : !error ? (
        <p role="status">Загрузка графика…</p>
      ) : null}
    </div>
  )
}
