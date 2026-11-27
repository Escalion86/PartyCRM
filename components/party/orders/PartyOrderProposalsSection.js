'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import PartyOrderPublicLink, { partyOrderSecondaryButton } from './PartyOrderPublicLink'
import {
  buildPartyProposalItemsFromOrder,
  calculatePartyProposalItem,
  calculatePartyProposalTotals,
  formatPartyProposalAddress,
} from '@helpers/partyProposalCore'
import {
  exportPartyProposalDocx,
  formatPartyProposalDate,
  formatPartyProposalMoney,
  getPartyProposalTemplateVariablesMap,
  printPartyProposal,
} from '@helpers/partyProposalDocuments'

const STATUS_LABELS = {
  draft: 'Черновик',
  sent: 'Отправлено',
  accepted: 'Принято',
  rejected: 'Отклонено',
  expired: 'Истекло',
}
const MAX_PUBLIC_VARIANTS = 6

const toDateInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 10)
}

const toDateTimeInput = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

const addDays = (value, days) => {
  const date = new Date(value)
  date.setDate(date.getDate() + days)
  return toDateInput(date)
}

const getClientName = (client) =>
  [client?.secondName, client?.firstName, client?.thirdName]
    .filter(Boolean)
    .join(' ') || client?.name || ''

const getOrderAddress = (order = {}) => {
  if (order.bookingVersion === 2) return formatPartyProposalAddress(order)
  if (order.customAddress) return order.customAddress
  const address = order.clientAddress || {}
  return [
    address.town,
    address.street,
    address.house ? `д. ${address.house}` : '',
    address.room,
  ]
    .filter(Boolean)
    .join(', ')
}

const buildInitialDraft = ({ order, client, services, documents }) => {
  const now = new Date()
  return {
    number: `КП-${String(order._id || '').slice(-6).toUpperCase()}`,
    proposalDate: toDateInput(now),
    validUntil: addDays(now, Number(documents?.proposalValidityDays || 14)),
    requestNumber: '',
    requestDate: '',
    recipientSnapshot: {
      displayName: client?.legalName || getClientName(client),
      position: '',
      fullName: getClientName(client),
    },
    eventSnapshot: {
      title: order.title || order.serviceTitle || '',
      date: toDateTimeInput(order.eventDate),
      address: getOrderAddress(order),
    },
    items: buildPartyProposalItemsFromOrder(order, services),
    discount: Number(order.bookingVersion === 2 ? (order.pricingSnapshot?.discountKopecks || 0) / 100 : order.agreedProposal?.discount || 0),
    taxText:
      documents?.proposalTaxText ||
      'НДС не облагается в связи с применением специального налогового режима.',
    paymentTerms: documents?.proposalPaymentTerms || '',
    includedText: documents?.proposalIncludedText || '',
    additionalTerms: '',
  }
}

const buildDraftFromProposal = (proposal) => ({
  number: proposal.number || '',
  proposalDate: toDateInput(proposal.proposalDate),
  validUntil: toDateInput(proposal.validUntil),
  requestNumber: proposal.requestNumber || '',
  requestDate: toDateInput(proposal.requestDate),
  recipientSnapshot: { ...(proposal.recipientSnapshot || {}) },
  eventSnapshot: {
    ...(proposal.eventSnapshot || {}),
    date: toDateTimeInput(proposal.eventSnapshot?.date),
  },
  items: (proposal.items || []).map((item) => ({ ...item })),
  discount: proposal.discount || 0,
  taxText: proposal.taxText || '',
  paymentTerms: proposal.paymentTerms || '',
  includedText: proposal.includedText || '',
  additionalTerms: proposal.additionalTerms || '',
})

const fieldClassName =
  'h-10 w-full rounded-lg border border-sky-100 bg-white px-3 text-sm outline-none transition focus:border-sky-400'
const areaClassName =
  'w-full rounded-lg border border-sky-100 bg-white px-3 py-2 text-sm outline-none transition focus:border-sky-400'

export default function PartyOrderProposalsSection({
  order,
  client,
  services = [],
  companySettings,
  activeCompanyId,
  onOrderUpdated,
  onDraftChange,
  disabled = false,
}) {
  const [loadedDocuments, setLoadedDocuments] = useState(null)
  const [proposals, setProposals] = useState([])
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(true)
  const [historyError, setHistoryError] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [applyingId, setApplyingId] = useState('')
  const [appliedMessage, setAppliedMessage] = useState('')
  const [error, setError] = useState('')
  const [selectedVariants, setSelectedVariants] = useState([])
  const [sharing, setSharing] = useState('')
  const [shareNotice, setShareNotice] = useState('')
  const [shareError, setShareError] = useState('')

  const draftOpen = Boolean(draft)
  usePartyUnsavedChanges(draftOpen, { label: 'коммерческое предложение', scope: activeCompanyId, pending: saving || Boolean(sharing) || Boolean(applyingId) })
  useEffect(() => {
    onDraftChange?.(draftOpen)
    return () => onDraftChange?.(false)
  }, [draftOpen, onDraftChange])

  const headers = useMemo(
    () =>
      activeCompanyId
        ? { 'x-partycrm-company-id': activeCompanyId }
        : {},
    [activeCompanyId]
  )

  const loadProposals = useCallback(async (signal) => {
    if (!order?._id || !activeCompanyId) return
    setLoading(true)
    setHistoryError('')
    try {
      const response = await apiJson(
        `/api/party/proposals?orderId=${encodeURIComponent(order._id)}`,
        { headers, cache: 'no-store', signal }
      )
      if (!signal?.aborted) setProposals(Array.isArray(response.data) ? response.data : [])
    } catch (requestError) {
      if (!signal?.aborted) setHistoryError(requestError.message || 'Не удалось загрузить КП')
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [activeCompanyId, headers, order?._id])

  useEffect(() => {
    const controller = new AbortController()
    loadProposals(controller.signal)
    return () => controller.abort()
  }, [loadProposals])

  const totals = useMemo(
    () => calculatePartyProposalTotals(draft?.items || [], draft?.discount || 0),
    [draft?.discount, draft?.items]
  )

  const getDocuments = async () => {
    if (companySettings?.documents) return companySettings.documents
    if (loadedDocuments) return loadedDocuments
    const { data } = await apiJson('/api/party/company-settings', { headers, cache: 'no-store' })
    const documents = data?.settings?.documents || {}
    setLoadedDocuments(documents)
    return documents
  }

  const startNew = async () => {
    setError('')
    setPreparing(true)
    try {
      const documents = await getDocuments()
      setDraft(buildInitialDraft({ order, client, services, documents }))
    } catch (requestError) {
      setError(requestError.message || 'Не удалось загрузить настройки КП')
    } finally {
      setPreparing(false)
    }
  }

  const activeProposal = proposals.find((proposal) => proposal.publicPath)
  const orderIsReadonly = ['closed', 'canceled'].includes(order.status)
  const shareableVariants = orderIsReadonly ? [] : proposals.filter((proposal) =>
    ['draft', 'sent'].includes(proposal.status)
  )
  const selectedShareableVariants = selectedVariants.filter((id) =>
    shareableVariants.some((proposal) => String(proposal._id) === id)
  )

  const toggleVariant = (id, checked) => {
    setShareNotice('')
    setSelectedVariants((current) => checked ? [...current, id] : current.filter((value) => value !== id))
  }

  const changeShare = async (method) => {
    const anchor = method === 'POST' ? selectedShareableVariants[0] : activeProposal?._id
    if (!anchor || sharing || disabled) return
    if (method === 'DELETE' && !window.confirm('Закрыть ссылку? Клиент больше не сможет открыть КП по этому адресу.')) return
    setSharing(method)
    setShareNotice('')
    setShareError('')
    try {
      const { data } = await apiJson(`/api/party/proposals/${encodeURIComponent(anchor)}/share`, {
        method,
        headers,
        ...(method === 'POST' ? { body: JSON.stringify({ variantIds: selectedShareableVariants }) } : {}),
      })
      setProposals(data)
      setSelectedVariants([])
      setShareNotice(method === 'POST' ? 'Ссылка готова к отправке клиенту.' : 'Ссылка закрыта.')
    } catch (requestError) {
      setShareError(requestError.message || 'Не удалось изменить ссылку на КП')
    } finally {
      setSharing('')
    }
  }

  const updateItem = (index, key, value) => {
    setDraft((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item
      ),
    }))
  }

  const removeItem = (index) => {
    setDraft((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  const saveProposal = async () => {
    if (!draft || saving || disabled) return
    setSaving(true)
    setError('')
    try {
      const response = await apiJson('/api/party/proposals', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          ...draft,
          orderId: order._id,
          items: totals.items,
          subtotal: totals.subtotal,
          discount: totals.discount,
          total: totals.total,
        }),
      })
      setProposals((current) => [response.data, ...current])
      setDraft(null)
    } catch (requestError) {
      setError(requestError.message || 'Не удалось сохранить КП')
    } finally {
      setSaving(false)
    }
  }

  const updateStatus = async (proposalId, status) => {
    setError('')
    try {
      const response = await apiJson(`/api/party/proposals/${proposalId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ status }),
      })
      setProposals((current) =>
        current.map((proposal) =>
          String(proposal._id) === String(proposalId)
            ? response.data
            : proposal
        )
      )
    } catch (requestError) {
      setError(requestError.message || 'Не удалось изменить статус')
    }
  }

  const applyToOrder = async (proposal) => {
    if (applyingId) return
    const confirmed = window.confirm(
      `Заменить коммерческий состав заказа позициями КП №${proposal.number}, версия ${proposal.version}, на сумму ${formatPartyProposalMoney(proposal.total)}? Оплаты и фактические движения денег не изменятся.`
    )
    if (!confirmed) return
    setApplyingId(String(proposal._id))
    setAppliedMessage('')
    setError('')
    try {
      const response = await apiJson(
        `/api/party/proposals/${proposal._id}/apply-to-order`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            expectedCommercialRevision: Number(order.commercialRevision || 0),
          }),
        }
      )
      onOrderUpdated?.(response.data.order)
      if (response.data.inventory?.warning) setError(response.data.inventory.warning)
      else if (response.data.inventory?.hasShortage) setError('КП перенесено, но реквизита не хватает. Откройте комплект заказа для проверки.')
      setAppliedMessage(
        response.data.repeated
          ? 'Эта версия уже перенесена в заказ.'
          : 'Состав и договорная сумма перенесены в заказ.'
      )
    } catch (requestError) {
      setError(requestError.message || 'Не удалось перенести КП в заказ')
    } finally {
      setApplyingId('')
    }
  }

  const downloadProposal = async (proposal) => {
    setError('')
    try {
      const documents = await getDocuments()
      if (documents.proposalDocxTemplateBase64) {
        const { default: exportDocxFromTemplate } = await import('@helpers/exportDocxFromTemplate')
        await exportDocxFromTemplate({
          templateBase64: documents.proposalDocxTemplateBase64,
          fileName: `Коммерческое предложение №${proposal.number} v${proposal.version}.docx`,
          variables: getPartyProposalTemplateVariablesMap(proposal),
        })
      } else {
        await exportPartyProposalDocx(proposal)
      }
    } catch (documentError) {
      setError(documentError.message || 'Не удалось сформировать DOCX')
    }
  }

  return (
    <section className="rounded-2xl border border-sky-100 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">
            Коммерческие предложения
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Каждое сохранение создаёт новую неизменяемую версию.
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          disabled={disabled || loading || Boolean(historyError) || draftOpen || preparing}
          className="min-h-11 cursor-pointer rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {preparing ? 'Загружаем настройки…' : 'Создать КП'}
        </button>
      </div>

      {error || historyError ? (
        <div role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error || historyError}
        </div>
      ) : null}
      {appliedMessage ? (
        <div role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {appliedMessage}
        </div>
      ) : null}

      {draft ? (
        <div className="mt-4 grid gap-4 border-t border-sky-100 pt-4">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Номер КП
              <input
                className={fieldClassName}
                value={draft.number}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    number: event.target.value,
                  }))
                }
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Дата КП
              <input
                type="date"
                className={fieldClassName}
                value={draft.proposalDate}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    proposalDate: event.target.value,
                  }))
                }
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Действительно до
              <input
                type="date"
                className={fieldClassName}
                value={draft.validUntil}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    validUntil: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="grid gap-3 rounded-xl bg-sky-50/60 p-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Организация адресата
              <input
                className={fieldClassName}
                value={draft.recipientSnapshot.displayName || ''}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    recipientSnapshot: {
                      ...current.recipientSnapshot,
                      displayName: event.target.value,
                    },
                  }))
                }
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Должность
              <input
                className={fieldClassName}
                value={draft.recipientSnapshot.position || ''}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    recipientSnapshot: {
                      ...current.recipientSnapshot,
                      position: event.target.value,
                    },
                  }))
                }
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500 md:col-span-2">
              ФИО адресата
              <input
                className={fieldClassName}
                value={draft.recipientSnapshot.fullName || ''}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    recipientSnapshot: {
                      ...current.recipientSnapshot,
                      fullName: event.target.value,
                    },
                  }))
                }
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Номер входящего запроса
              <input
                className={fieldClassName}
                value={draft.requestNumber}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    requestNumber: event.target.value,
                  }))
                }
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Дата запроса
              <input
                type="date"
                className={fieldClassName}
                value={draft.requestDate}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    requestDate: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-slate-500 md:col-span-2">
              Мероприятие
              <input
                className={fieldClassName}
                value={draft.eventSnapshot.title || ''}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    eventSnapshot: {
                      ...current.eventSnapshot,
                      title: event.target.value,
                    },
                  }))
                }
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Дата и время
              <input
                type="datetime-local"
                className={fieldClassName}
                value={draft.eventSnapshot.date || ''}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    eventSnapshot: {
                      ...current.eventSnapshot,
                      date: event.target.value,
                    },
                  }))
                }
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Место проведения
              <input
                className={fieldClassName}
                value={draft.eventSnapshot.address || ''}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    eventSnapshot: {
                      ...current.eventSnapshot,
                      address: event.target.value,
                    },
                  }))
                }
              />
            </label>
          </div>

          <div className="grid gap-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Услуги
              </div>
              <button
                type="button"
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    items: [
                      ...current.items,
                      {
                        title: '',
                        description: '',
                        quantity: 1,
                        unit: 'услуга',
                        unitPrice: 0,
                        discount: 0,
                      },
                    ],
                  }))
                }
                className="cursor-pointer text-xs font-semibold text-sky-700 hover:text-sky-900"
              >
                + Добавить строку
              </button>
            </div>
            {draft.items.map((item, index) => {
              const calculated = calculatePartyProposalItem(item)
              return (
                <div
                  key={item._id || `${index}-${item.serviceId || 'manual'}`}
                  className="grid gap-2 rounded-xl border border-sky-100 p-3 md:grid-cols-12"
                >
                  <label className="grid gap-1 text-xs text-slate-500 md:col-span-4">
                    Наименование
                    <input
                      className={fieldClassName}
                      value={item.title || ''}
                      onChange={(event) =>
                        updateItem(index, 'title', event.target.value)
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-500 md:col-span-2">
                    Количество
                    <input
                      type="number"
                      min="0.01"
                      step="any"
                      className={fieldClassName}
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(index, 'quantity', event.target.value)
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-500 md:col-span-2">
                    Единица
                    <input
                      className={fieldClassName}
                      value={item.unit || ''}
                      onChange={(event) =>
                        updateItem(index, 'unit', event.target.value)
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-500 md:col-span-2">
                    Цена
                    <input
                      type="number"
                      min="0"
                      step="100"
                      className={fieldClassName}
                      value={item.unitPrice}
                      onChange={(event) =>
                        updateItem(index, 'unitPrice', event.target.value)
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-xs text-slate-500 md:col-span-1">
                    Скидка
                    <input
                      type="number"
                      min="0"
                      step="100"
                      className={fieldClassName}
                      value={item.discount || 0}
                      onChange={(event) =>
                        updateItem(index, 'discount', event.target.value)
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeItem(index)}
                    className="h-10 cursor-pointer self-end rounded-lg border border-red-100 text-sm text-red-600 hover:bg-red-50 md:col-span-1"
                    aria-label={`Удалить услугу ${index + 1}`}
                  >
                    ×
                  </button>
                  <label className="grid gap-1 text-xs text-slate-500 md:col-span-4">
                    Длительность, минут
                    <input type="number" min="1" max="10080" step="1"
                      className={fieldClassName} value={item.durationMinutes ?? ''}
                      onChange={(event) => updateItem(index, 'durationMinutes', event.target.value)} />
                  </label>
                  <div className="text-right text-sm font-semibold text-slate-700 md:col-span-12">
                    {formatPartyProposalMoney(calculated?.total || 0)}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Налоговая формулировка
              <textarea
                rows={3}
                className={areaClassName}
                value={draft.taxText}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    taxText: event.target.value,
                  }))
                }
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Условия оплаты
              <textarea
                rows={3}
                className={areaClassName}
                value={draft.paymentTerms}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    paymentTerms: event.target.value,
                  }))
                }
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Что включено в стоимость
              <textarea
                rows={3}
                className={areaClassName}
                value={draft.includedText}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    includedText: event.target.value,
                  }))
                }
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-slate-500">
              Дополнительные условия
              <textarea
                rows={3}
                className={areaClassName}
                value={draft.additionalTerms}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    additionalTerms: event.target.value,
                  }))
                }
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
            <div className="text-base font-semibold text-slate-800">
              Итого: {formatPartyProposalMoney(totals.total)}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="h-9 cursor-pointer rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={disabled || saving || totals.items.length === 0}
                onClick={saveProposal}
                className="h-9 cursor-pointer rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Сохраняем...' : 'Сохранить версию'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeProposal || shareableVariants.length > 0 || shareNotice ? (
        <section className="mt-4 min-w-0 space-y-3 rounded-xl border border-sky-100 bg-sky-50/60 p-3">
          <h3 className="text-sm font-semibold text-slate-900">Ссылка на КП для клиента</h3>
          {activeProposal ? (
            <>
              <div className="space-y-1 text-sm text-slate-700">
                {activeProposal.publicVariantIds?.length > 1 ? <p>Вариантов в КП: {activeProposal.publicVariantIds.length}.</p> : null}
                {activeProposal.publicValidUntil ? <p>Срок действия до {formatPartyProposalDate(activeProposal.publicValidUntil)}.</p> : null}
                {activeProposal.publicCanRespond === false ? <p>Ответы клиента по этой ссылке больше не принимаются.</p> : null}
              </div>
              <PartyOrderPublicLink key={activeProposal.publicPath} path={activeProposal.publicPath} label="Ссылка на коммерческое предложение" openLabel="Открыть КП" />
              <div className="flex flex-wrap gap-2">
                <button type="button" className={partyOrderSecondaryButton} disabled={loading || Boolean(sharing)} onClick={() => loadProposals()}>
                  {loading ? 'Обновляем…' : 'Обновить статусы'}
                </button>
                <button type="button" className={partyOrderSecondaryButton} disabled={disabled || loading || Boolean(sharing)} onClick={() => changeShare('DELETE')}>
                  {sharing === 'DELETE' ? 'Закрываем ссылку…' : 'Закрыть ссылку'}
                </button>
              </div>
            </>
          ) : shareableVariants.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm text-slate-700">Отметьте до {MAX_PUBLIC_VARIANTS} версий ниже. Клиент сможет выбрать одну из них.</p>
              <p className="text-sm text-slate-700">Клиент увидит название компании, название и дату мероприятия, позиции с описаниями и ценами, а также условия КП. Проверьте их перед публикацией.</p>
              <button
                type="button"
                disabled={disabled || loading || Boolean(sharing) || selectedShareableVariants.length === 0}
                onClick={() => changeShare('POST')}
                className="min-h-11 cursor-pointer rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sharing === 'POST' ? 'Создаём ссылку…' : 'Создать ссылку'}
              </button>
            </div>
          ) : null}
          {shareNotice ? <p role="status" className="text-sm text-slate-700">{shareNotice}</p> : null}
          {shareError ? <p role="alert" className="text-sm text-red-800">{shareError}</p> : null}
        </section>
      ) : null}

      <div className="mt-4 grid gap-2">
        {loading && proposals.length === 0 ? (
          <div role="status" className="text-sm text-slate-600">Загружаем историю…</div>
        ) : historyError && proposals.length === 0 ? (
          <button type="button" className={`${partyOrderSecondaryButton} justify-self-start`} onClick={() => loadProposals()}>Повторить загрузку</button>
        ) : proposals.length === 0 ? (
          <div className="rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-500">
            Коммерческих предложений пока нет.
          </div>
        ) : (
          proposals.map((proposal) => (
            <div
              key={proposal._id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 px-3 py-3"
            >
              <div className="min-w-0 break-words">
                <div className="text-sm font-semibold text-slate-800">
                  КП №{proposal.number}, версия {proposal.version}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatPartyProposalDate(proposal.proposalDate)} ·{' '}
                  {formatPartyProposalMoney(proposal.total)}
                </div>
              </div>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                {!activeProposal && shareableVariants.includes(proposal) ? (
                  <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 px-1 text-sm font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={selectedShareableVariants.includes(String(proposal._id))}
                      disabled={disabled || loading || Boolean(sharing) || (selectedShareableVariants.length >= MAX_PUBLIC_VARIANTS && !selectedShareableVariants.includes(String(proposal._id)))}
                      onChange={(event) => toggleVariant(String(proposal._id), event.target.checked)}
                      aria-label={`В ссылку клиенту: КП №${proposal.number}, версия ${proposal.version}`}
                      className="size-4 cursor-pointer accent-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed"
                    />
                    В ссылку клиенту
                  </label>
                ) : proposal.publicPath ? (
                  <span className="text-sm font-medium text-slate-700">Доступно по ссылке</span>
                ) : null}
                <select
                  value={proposal.status}
                  disabled={disabled || Boolean(proposal.publicPath) || loading || Boolean(sharing)}
                  onChange={(event) =>
                    updateStatus(proposal._id, event.target.value)
                  }
                  className="min-h-11 cursor-pointer rounded-lg border border-sky-100 bg-white px-2 text-sm focus-visible:outline-2 focus-visible:outline-sky-700 disabled:cursor-default"
                  aria-label={`Статус КП №${proposal.number}, версия ${proposal.version}`}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                {proposal.status === 'accepted' ? (
                  <button
                    type="button"
                    disabled={
                      disabled || Boolean(applyingId) || Boolean(sharing) || loading ||
                      orderIsReadonly ||
                      String(order.agreedProposal?.proposalId || '') ===
                        String(proposal._id)
                    }
                    onClick={() => applyToOrder(proposal)}
                    className="min-h-11 cursor-pointer rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {String(order.agreedProposal?.proposalId || '') ===
                    String(proposal._id)
                      ? 'Перенесено в заказ'
                      : applyingId === String(proposal._id)
                        ? 'Переносим...'
                        : 'Перенести в заказ'}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={disabled || draftOpen || preparing}
                  onClick={() => setDraft(buildDraftFromProposal(proposal))}
                  className={partyOrderSecondaryButton}
                >
                  Новая версия
                </button>
                <button
                  type="button"
                  onClick={() => printPartyProposal(proposal)}
                  className={partyOrderSecondaryButton}
                >
                  PDF / печать
                </button>
                <button
                  type="button"
                  onClick={() => downloadProposal(proposal)}
                  className="min-h-11 cursor-pointer rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                >
                  DOCX
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
