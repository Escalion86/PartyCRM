'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import exportDocxFromTemplate from '@helpers/exportDocxFromTemplate'
import {
  calculatePartyProposalItem,
  calculatePartyProposalTotals,
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

const getClientName = (client = {}) =>
  [client.secondName, client.firstName, client.thirdName]
    .filter(Boolean)
    .join(' ')

const getOrderAddress = (order = {}) => {
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

const buildInitialItems = (order, services) => {
  const servicesById = new Map(
    (services || []).map((service) => [String(service._id), service])
  )
  const selected = (order.servicesIds || [])
    .map((id) => servicesById.get(String(id)))
    .filter(Boolean)
  const source =
    selected.length > 0
      ? selected
      : order.serviceTitle
        ? [{ title: order.serviceTitle, price: order.contractAmount || 0 }]
        : []
  const items = source.map((service) => ({
    serviceId: service._id || null,
    title: service.title || '',
    description: service.description || '',
    quantity: 1,
    unit: service.duration ? 'час' : 'услуга',
    unitPrice: Number(service.price || 0),
    discount: 0,
  }))
  const calculated = calculatePartyProposalTotals(items)
  if (
    calculated.total === 0 &&
    Number(order.contractAmount || order.clientPayment?.totalAmount || 0) > 0 &&
    items.length > 0
  ) {
    items[0].unitPrice = Number(
      order.contractAmount || order.clientPayment?.totalAmount || 0
    )
  }
  return items
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
    items: buildInitialItems(order, services),
    discount: 0,
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
}) {
  const documents = companySettings?.documents || {}
  const [proposals, setProposals] = useState([])
  const [draft, setDraft] = useState(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const headers = useMemo(
    () =>
      activeCompanyId
        ? { 'x-partycrm-company-id': activeCompanyId }
        : {},
    [activeCompanyId]
  )

  const loadProposals = useCallback(async () => {
    if (!order?._id || !activeCompanyId) return
    setLoading(true)
    setError('')
    try {
      const response = await apiJson(
        `/api/party/proposals?orderId=${encodeURIComponent(order._id)}`,
        { headers, cache: 'no-store' }
      )
      setProposals(Array.isArray(response.data) ? response.data : [])
    } catch (requestError) {
      setError(requestError.message || 'Не удалось загрузить КП')
    } finally {
      setLoading(false)
    }
  }, [activeCompanyId, headers, order?._id])

  useEffect(() => {
    loadProposals()
  }, [loadProposals])

  const totals = useMemo(
    () => calculatePartyProposalTotals(draft?.items || [], draft?.discount || 0),
    [draft?.discount, draft?.items]
  )

  const startNew = () => {
    setError('')
    setDraft(buildInitialDraft({ order, client, services, documents }))
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
    if (!draft || saving) return
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

  const downloadProposal = async (proposal) => {
    setError('')
    try {
      if (documents.proposalDocxTemplateBase64) {
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
          className="h-9 cursor-pointer rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700"
        >
          Создать КП
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
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
                      step="0.5"
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
                disabled={saving || totals.items.length === 0}
                onClick={saveProposal}
                className="h-9 cursor-pointer rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? 'Сохраняем...' : 'Сохранить версию'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-4 grid gap-2">
        {loading ? (
          <div className="text-xs text-slate-500">Загружаем историю...</div>
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
              <div>
                <div className="text-sm font-semibold text-slate-700">
                  КП №{proposal.number}, версия {proposal.version}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatPartyProposalDate(proposal.proposalDate)} ·{' '}
                  {formatPartyProposalMoney(proposal.total)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={proposal.status}
                  onChange={(event) =>
                    updateStatus(proposal._id, event.target.value)
                  }
                  className="h-8 cursor-pointer rounded-lg border border-sky-100 bg-white px-2 text-xs"
                  aria-label={`Статус КП №${proposal.number}`}
                >
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setDraft(buildDraftFromProposal(proposal))}
                  className="h-8 cursor-pointer rounded-lg border border-sky-100 px-3 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                >
                  Новая версия
                </button>
                <button
                  type="button"
                  onClick={() => printPartyProposal(proposal)}
                  className="h-8 cursor-pointer rounded-lg border border-sky-100 px-3 text-xs font-semibold text-sky-700 hover:bg-sky-50"
                >
                  PDF / печать
                </button>
                <button
                  type="button"
                  onClick={() => downloadProposal(proposal)}
                  className="h-8 cursor-pointer rounded-lg bg-sky-600 px-3 text-xs font-semibold text-white hover:bg-sky-700"
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
