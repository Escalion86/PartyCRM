'use client'

import { useEffect, useRef, useState } from 'react'
import Modal from '@components/Modal'
import { ServiceCreateModal } from '@components/party/modals/ServiceModal'
import { apiJson } from '@helpers/apiClient'
import { EMPTY_PARTY_SERVICE } from '@helpers/partyHelpers'

export default function PartyOrderServiceModal({ companyId, serviceId, onClose, onSaved }) {
  const [draft, setDraft] = useState(() => serviceId ? null : EMPTY_PARTY_SERVICE)
  const [saving, setSaving] = useState(false)
  const [serviceGroups, setServiceGroups] = useState([])
  const [error, setError] = useState('')
  const pending = useRef(false)
  const title = serviceId ? 'Редактировать услугу' : 'Новая услуга'

  useEffect(() => {
    const controller = new AbortController()
    apiJson('/api/party/service-groups', {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    }).then(({ data }) => {
      if (!controller.signal.aborted) setServiceGroups(data)
    }).catch(() => {
      // The rest of the service editor works without the group catalog.
    })
    return () => controller.abort()
  }, [companyId])

  useEffect(() => {
    if (!serviceId) return
    const controller = new AbortController()
    apiJson('/api/party/services', {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    }).then(({ data }) => {
      if (controller.signal.aborted) return
      const service = data.find((item) => String(item._id) === serviceId)
      if (service) setDraft(service)
      else setError('Услуга не найдена в справочнике.')
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause.message)
    })
    return () => controller.abort()
  }, [companyId, serviceId])

  const save = async () => {
    if (pending.current) return
    pending.current = true
    setSaving(true)
    try {
      const { data } = await apiJson(serviceId ? `/api/party/services/${serviceId}` : '/api/party/services', {
        method: serviceId ? 'PUT' : 'POST',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify(draft),
      })
      onSaved(data, !serviceId)
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  if (!draft) return (
    <Modal open title={title} tone="party" onClose={onClose}>
      {error ? <p role="alert" className="text-sm text-red-800">{error}</p> : <p role="status" className="text-sm text-slate-600">Загрузка услуги…</p>}
    </Modal>
  )

  return <ServiceCreateModal open title={title} serviceDraft={draft} setServiceDraft={setDraft} saving={saving}
    serviceGroups={serviceGroups} setServiceGroups={setServiceGroups}
    activeCompanyId={companyId} onSubmit={save} onClose={() => { if (!pending.current) onClose() }} />
}
