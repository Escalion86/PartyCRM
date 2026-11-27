'use client'

import { useEffect, useId, useMemo, useState } from 'react'
import Link from 'next/link'
import Modal from '@components/Modal'
import { apiJson } from '@helpers/apiClient'
import { formatAddressPoolShort } from '@helpers/addressPool'
import { getPartyContractTemplateVariablesMap } from '@helpers/partyGenerateContractTemplate'
import { formatPartyDocumentFileDate, getPartyContractServiceTitles, getPartyDocumentDate } from './partyOrderDocuments'

const endpoint = '/api/party/contract-templates'
const inputClass = 'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-700 sm:text-sm'
const buttonClass = 'min-h-11 cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50'
const primaryButton = `${buttonClass} bg-sky-700 text-white hover:bg-sky-800`
const secondaryButton = `${buttonClass} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`
const settingsLink = <Link className="font-semibold text-sky-800 underline underline-offset-2" href="/company/settings/documents">Настройки документов</Link>

const resourceId = (value) => String(value?._id || value || '')
const safelyReadReference = (url, options) => apiJson(url, options).then(({ data }) => data).catch((error) => {
  if (error.status !== 404) throw error
  return null
})

function PartyOrderContractForm({ orderId, companyId, services, onClose, onDownloaded, blocked }) {
  const formId = useId()
  const [attempt, setAttempt] = useState(0)
  const [view, setView] = useState({ status: 'loading' })
  const [selectedId, setSelectedId] = useState('')
  const [number, setNumber] = useState('')
  const [date, setDate] = useState('')
  const [exporting, setExporting] = useState(false)
  const [result, setResult] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    const options = { headers: { 'x-partycrm-company-id': companyId }, signal: controller.signal, cache: 'no-store' }
    const load = async () => {
      try {
        const [{ data: catalog }, { data: order }] = await Promise.all([
          apiJson(endpoint, options),
          apiJson(`/api/party/orders/${encodeURIComponent(orderId)}`, options),
        ])
        const clientId = resourceId(order.clientId)
        const locationId = resourceId(order.locationId)
        const [client, location] = await Promise.all([
          clientId ? safelyReadReference(`/api/party/clients/${encodeURIComponent(clientId)}`, options) : null,
          locationId && order.placeType === 'company_location' && order.bookingVersion !== 2
            ? safelyReadReference(`/api/party/locations/${encodeURIComponent(locationId)}`, options) : null,
        ])
        if (controller.signal.aborted) return
        const available = [...catalog.templates, ...catalog.builtIns, ...(catalog.legacyTemplate ? [catalog.legacyTemplate] : [])]
        const preferredId = available.some((item) => item.id === catalog.defaultTemplateId)
          ? catalog.defaultTemplateId : catalog.legacyTemplate?.id || catalog.builtIns[0]?.id || ''
        const timeZone = location?.timeZone || catalog.documentContext?.timeZone
        setSelectedId(preferredId)
        setNumber((current) => current || String(order._id).slice(-6).toUpperCase())
        setDate((current) => current || getPartyDocumentDate(new Date(), timeZone))
        setView({
          status: 'ready', order, catalog, client: client || (order.client && { ...order.client, firstName: order.client.name }), location,
          requisites: catalog.documentContext?.requisites || {}, timeZone,
        })
      } catch (error) {
        if (controller.signal.aborted) return
        setView(error.code === 'partycrm_contract_templates_tariff_required'
          ? { status: 'blocked' } : { status: 'error', message: error.message || 'Не удалось загрузить данные договора.' })
      }
    }
    load()
    return () => controller.abort()
  }, [orderId, companyId, attempt])

  const data = useMemo(() => view.status === 'ready' ? getPartyContractTemplateVariablesMap({
    order: view.order,
    client: view.client,
    serviceTitles: getPartyContractServiceTitles(view.order, services),
    companyRequisites: view.requisites,
    locationTitle: view.location?.title,
    locationAddress: formatAddressPoolShort(view.location?.address),
    docMeta: { documentNumber: number, contractDate: date, requisitesSidesMode: 'docx', timeZone: view.timeZone },
  }) : null, [view, services, number, date])

  const requiresRequisites = data && !view.requisites.providerFullName && !view.requisites.providerDisplayName
  const download = async (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (exporting || blocked || !data || !selectedId || requiresRequisites) return
    setExporting(true)
    setResult(null)
    try {
      const [{ data: template }, { default: exportDocxFromTemplate }] = await Promise.all([
        apiJson(`${endpoint}/${encodeURIComponent(selectedId)}`, { headers: { 'x-partycrm-company-id': companyId }, cache: 'no-store' }),
        import('@helpers/exportDocxFromTemplate'),
      ])
      const fileNumber = number.trim().replace(/[<>:"/\\|?*]/g, '-')
      const fileName = `Договор №${fileNumber} от ${formatPartyDocumentFileDate(date)}.docx`
      await exportDocxFromTemplate({ templateBase64: template.templateBase64, fileName, variables: data })
      onDownloaded?.(date)
      setResult({ text: 'Договор скачан.' })
    } catch (error) {
      setResult({ text: error.status === 404 ? 'Шаблон удалён. Обновите список и выберите другой.' : error.message || 'Не удалось скачать договор.', error: true })
    } finally {
      setExporting(false)
    }
  }

  const retry = () => {
    setView({ status: 'loading' })
    setResult(null)
    setAttempt((value) => value + 1)
  }
  const close = () => { if (!exporting) onClose() }
  const preview = data ? [
    ['Исполнитель', data['НАИМЕНОВАНИЕ КОМПАНИИ']], ['Заказчик', data['НАИМЕНОВАНИЕ КЛИЕНТА']],
    ['Мероприятие', data['ДАТА СОБЫТИЯ']], ['Адрес', data['АДРЕС СОБЫТИЯ']],
    ['Услуги', data['СПИСОК УСЛУГ']], ['Сумма', data['ДОГОВОРНАЯ СУММА']],
  ] : []
  const selectedSample = view.status === 'ready' ? view.catalog.builtIns.find((item) => item.id === selectedId) : null

  return (
    <Modal open onClose={close} size="xl" title="Сформировать договор" footer={(
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={close} disabled={exporting} className={secondaryButton}>Закрыть</button>
        <button type="submit" form={formId} disabled={blocked || exporting || !selectedId || !number.trim() || !date || !data || requiresRequisites} className={primaryButton}>
          {exporting ? 'Готовим DOCX…' : 'Скачать DOCX'}
        </button>
      </div>
    )}>
      {view.status === 'loading' && <p role="status" className="text-sm text-slate-600">Загружаем шаблоны и данные заказа…</p>}
      {view.status === 'blocked' && <p className="text-sm text-slate-700">Документы недоступны на текущем тарифе компании.</p>}
      {view.status === 'error' && (
        <div className="space-y-3"><p role="alert" className="text-sm text-red-800">{view.message}</p><button type="button" className={secondaryButton} onClick={retry}>Повторить загрузку</button></div>
      )}
      {view.status === 'ready' && (
        <form id={formId} onSubmit={download} className="space-y-5">
          <div className="space-y-2">
            <label className="grid gap-1 text-sm font-medium text-slate-800">
              Шаблон договора
              <select className={`${inputClass} cursor-pointer`} value={selectedId} onChange={(event) => { setSelectedId(event.target.value); setResult(null) }} disabled={exporting}>
                {view.catalog.templates.length > 0 && <optgroup label="Шаблоны компании">{view.catalog.templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>}
                {view.catalog.legacyTemplate && <optgroup label="Прежний шаблон"><option value={view.catalog.legacyTemplate.id}>{view.catalog.legacyTemplate.name}</option></optgroup>}
                <optgroup label="Готовые образцы">{view.catalog.builtIns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
              </select>
            </label>
            {selectedSample && <p className="text-sm text-slate-600">{selectedSample.description}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-800">Номер договора<input className={inputClass} value={number} onChange={(event) => setNumber(event.target.value)} maxLength={48} required disabled={exporting} /></label>
            <label className="grid min-w-0 gap-1 text-sm font-medium text-slate-800">Дата договора<input className={inputClass} type="date" value={date} onChange={(event) => setDate(event.target.value)} required disabled={exporting} /></label>
          </div>
          <section className="space-y-2 border-t border-slate-200 pt-4" aria-label="Данные из заказа">
            <h3 className="text-sm font-semibold text-slate-900">Данные из заказа</h3>
            <dl className="divide-y divide-slate-100">
              {preview.map(([label, value]) => <div key={label} className="grid gap-0.5 py-2 text-sm sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:gap-3"><dt className="text-slate-600">{label}</dt><dd className="whitespace-pre-line break-words text-slate-900">{!value || /^_+$/.test(value) ? 'Не указано' : value}</dd></div>)}
            </dl>
          </section>
          {requiresRequisites ? <p className="text-sm text-amber-900">Укажите наименование исполнителя в реквизитах компании. {settingsLink}</p> : null}
          {!view.client?.firstName && !view.client?.legalName && <p className="text-sm text-amber-900">В заказе не указан заказчик. Его данные останутся пустыми.</p>}
          {result && <p role={result.error ? 'alert' : 'status'} className={`text-sm ${result.error ? 'text-red-800' : 'text-emerald-800'}`}>{result.text}</p>}
          {result?.error && <button type="button" className={secondaryButton} onClick={retry}>Обновить данные</button>}
        </form>
      )}
    </Modal>
  )
}

export default function PartyOrderContractPanel({ order, companyId, services, disabled = false, unsaved = false, onDownloaded }) {
  const [open, setOpen] = useState(false)
  if (!companyId || !order?._id) return null
  return (
    <div className="space-y-3 rounded-xl border border-sky-100 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Договор оказания услуг</h3>
        <button type="button" className={primaryButton} disabled={disabled || unsaved} onClick={() => setOpen(true)}>Сформировать договор</button>
      </div>
      {unsaved && <p role="status" className="text-sm text-amber-900">Сохраните изменения заказа перед формированием договора.</p>}
      {open && <PartyOrderContractForm key={`${companyId}:${order._id}`} companyId={companyId} orderId={order._id} services={services} onDownloaded={onDownloaded} blocked={disabled || unsaved} onClose={() => setOpen(false)} />}
    </div>
  )
}
