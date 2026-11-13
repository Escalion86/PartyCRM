'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createStore, Provider } from 'jotai'
import Modal from '@components/Modal'
import OrderModal from '@components/party/modals/OrderModal'
import { apiJson } from '@helpers/apiClient'
import { normalizePartyLegacyOrderDraft } from '@helpers/partyLegacyOrderDraft'
import { getFormSnapshot } from '@helpers/useUnsavedChanges'
import serviceGroupsAtom from '@state/atoms/serviceGroupsAtom'

const button = 'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700'
const serverFields = new Set([
  '_id', 'tenantId', 'bookingVersion', 'commercialRevision', 'fulfillment',
  'orderTypeSnapshot', 'pricingSnapshot', 'transactions', 'workflowStageId',
  'createRequestKey', 'createRequestActorId', 'createRequestFingerprint',
])

export default function PartyAdvancedOrderEditor({ companyId, order, onSaved, onClose, onSwitchToOrdinary }) {
  const [orderDraft, setOrderDraft] = useState(() => normalizePartyLegacyOrderDraft(order))
  const baseline = useRef(orderDraft)
  const [draftRevision, setDraftRevision] = useState(0)
  const [store] = useState(createStore)
  const [catalogs, setCatalogs] = useState(null)
  const [companySettings, setCompanySettings] = useState({})
  const [aiAvailable, setAiAvailable] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [retry, setRetry] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saveWarning, setSaveWarning] = useState('')
  const savingRef = useRef(false)
  const headers = useMemo(() => ({ 'x-partycrm-company-id': companyId }), [companyId])

  useEffect(() => {
    const controller = new AbortController()
    const requestOptions = { headers, cache: 'no-store', signal: controller.signal }
    Promise.all([
      apiJson('/api/party/clients', requestOptions),
      apiJson('/api/party/staff', requestOptions),
      apiJson('/api/party/locations', requestOptions),
      apiJson('/api/party/services', requestOptions),
      apiJson('/api/party/company-settings', requestOptions),
      apiJson('/api/party/service-groups', requestOptions),
    ]).then(([clients, staff, locations, services, settings, groups]) => {
      if (controller.signal.aborted) return
      store.set(serviceGroupsAtom, groups.data ?? [])
      setCompanySettings(settings.data?.settings ?? {})
      setAiAvailable(settings.data?.access?.allowAi === true)
      setCatalogs({
        clients: clients.data ?? [], staff: staff.data ?? [],
        locations: locations.data ?? [], services: services.data ?? [],
      })
    }).catch((cause) => {
      if (!controller.signal.aborted) setLoadError(cause.message || 'Не удалось открыть расширенный режим')
    })
    return () => controller.abort()
  }, [headers, retry, store])

  const clients = catalogs?.clients
  const clientsById = useMemo(() => new Map((clients || []).map((client) => [String(client._id), client])), [clients])
  const addOption = (catalog, item) => setCatalogs((previous) => ({
    ...previous,
    [catalog]: [...previous[catalog], item],
  }))
  const applySavedOrder = (next, accessChanged = false, inventory) => {
    if (next && !accessChanged) {
      const draft = normalizePartyLegacyOrderDraft(next)
      baseline.current = draft
      setOrderDraft(draft)
      setDraftRevision((value) => value + 1)
    }
    onSaved(next, accessChanged || !next, inventory)
  }

  const submit = async () => {
    if (savingRef.current) return
    const patch = Object.fromEntries(Object.entries(orderDraft).filter(([field, value]) =>
      !serverFields.has(field) && getFormSnapshot(value) !== getFormSnapshot(baseline.current[field])
    ))
    if (!Object.keys(patch).length) return
    savingRef.current = true
    setSaving(true)
    setSaveWarning('')
    try {
      const result = await apiJson(`/api/party/orders/${encodeURIComponent(order._id)}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          ...patch,
          bookingVersion: baseline.current.bookingVersion,
          commercialRevision: baseline.current.commercialRevision || 0,
        }),
      })
      if (result.inventory?.warning || result.inventory?.hasShortage) {
        setSaveWarning(result.inventory.warning || 'В заказе не хватает реквизита. Проверьте комплект заказа.')
      }
      applySavedOrder(result.data, result.accessChanged, result.inventory)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  const close = useCallback(() => {
    if (!savingRef.current) onClose(true)
  }, [onClose])

  if (!catalogs) return (
    <Modal
      open title="Расширенный режим" tone="party" size="lg" onClose={close}
      footer={<div className="flex w-full flex-wrap justify-between gap-2">
        <button type="button" className={button} onClick={onSwitchToOrdinary}>Обычный режим</button>
        <button type="button" className={button} onClick={close}>Закрыть</button>
      </div>}
    >
      {loadError ? (
        <div className="space-y-3">
          <p role="alert" className="text-sm text-red-800">{loadError}</p>
          <button type="button" className={button} onClick={() => { setLoadError(''); setRetry((value) => value + 1) }}>Повторить загрузку</button>
        </div>
      ) : <p role="status" className="text-sm text-slate-600">Загрузка расширенной формы…</p>}
    </Modal>
  )

  return (
    <Provider store={store}>
      <OrderModal
        key={draftRevision}
        open
        title="Редактировать заказ"
        isEdit
        canManage
        orderDraft={orderDraft}
        setOrderDraft={setOrderDraft}
        activeCompanyId={companyId}
        companySettings={companySettings}
        aiAvailable={aiAvailable}
        clients={clients}
        clientsById={clientsById}
        staff={catalogs.staff}
        locations={catalogs.locations}
        services={catalogs.services}
        saving={saving}
        saveWarning={saveWarning}
        onClose={close}
        onSwitchToOrdinary={onSwitchToOrdinary}
        onSubmit={submit}
        onCompanySettingsChange={setCompanySettings}
        onServiceCreated={(item) => addOption('services', item)}
        onClientCreated={(item) => addOption('clients', item)}
        onLocationCreated={(item) => addOption('locations', item)}
        onOrderApplied={applySavedOrder}
      />
    </Provider>
  )
}
