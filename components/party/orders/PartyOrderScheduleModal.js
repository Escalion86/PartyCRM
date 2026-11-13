'use client'

import { useEffect, useRef, useState } from 'react'
import Modal from '@components/Modal'
import PartyWorkingScheduleEditor from '@components/party/locations/PartyWorkingScheduleEditor'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import { apiJson } from '@helpers/apiClient'

const button = 'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:opacity-50'

export default function PartyOrderScheduleModal({ companyId, location, onClose, onSaved }) {
  const locationId = location?._id ? String(location._id) : ''
  const [saved, setSaved] = useState(() => locationId ? { schedule: location.workingSchedule } : null)
  const [schedule, setSchedule] = useState(() => location?.workingSchedule ?? null)
  const [retry, setRetry] = useState(0)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const dirty = Boolean(saved && JSON.stringify(saved.schedule) !== JSON.stringify(schedule))
  usePartyUnsavedChanges(dirty, { label: 'рабочий график', scope: companyId, pending: busy })

  useEffect(() => {
    if (locationId) return
    const controller = new AbortController()
    apiJson('/api/party/booking-settings', {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    }).then(({ data }) => {
      if (controller.signal.aborted) return
      setSaved(data)
      setSchedule(data.schedule)
      setError('')
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause.message)
    })
    return () => controller.abort()
  }, [companyId, locationId, retry])

  const save = async () => {
    if (saving.current || !dirty) return
    saving.current = true
    setBusy(true)
    setError('')
    try {
      const { data } = await apiJson(locationId ? `/api/party/locations/${locationId}` : '/api/party/booking-settings', {
        method: locationId ? 'PATCH' : 'PUT',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify(locationId ? { workingSchedule: schedule } : { schedule, expectedRevision: saved.revision }),
      })
      onSaved(locationId ? data : null)
    } catch (cause) {
      setError(cause.message || 'Не удалось сохранить график')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <Modal open tone="party" size="xl" title={locationId ? `График помещения «${location.title}»` : 'График бронирования компании'}
      onClose={() => { if (!saving.current) onClose() }} disableBackdropClick={busy} hasUnsavedChanges={dirty && !busy}
      footer={({ requestClose }) => <>
        <button className={button} type="button" disabled={busy} onClick={requestClose}>Отмена</button>
        <button className={`${button} bg-sky-700 !text-white`} type="button" disabled={busy || !dirty} onClick={save}>Сохранить график</button>
      </>}
    >
      <div className="space-y-3">
        {!locationId && <p className="text-sm text-slate-600">Этот график применяется к выездам и помещениям без собственного графика.</p>}
        {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
        {!locationId && error && <button type="button" className={button} disabled={busy} onClick={() => {
          if (!dirty || window.confirm('Загрузить график и отменить несохранённые изменения?')) setRetry((value) => value + 1)
        }}>Загрузить график заново</button>}
        {saved ? <PartyWorkingScheduleEditor value={schedule} onChange={setSchedule} disabled={busy}
          inheritLabel={locationId ? 'Использовать график компании' : 'Отключить график компании'}
          enableLabel={locationId ? undefined : 'Указать рабочие дни'} />
          : !error && <p role="status" className="text-sm text-slate-600">Загрузка графика…</p>}
      </div>
    </Modal>
  )
}
