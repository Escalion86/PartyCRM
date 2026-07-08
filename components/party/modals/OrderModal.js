'use client'

import { useState, useCallback, useMemo } from 'react'
import { useSetAtom } from 'jotai'
import { apiJson } from '@helpers/apiClient'
import {
  ClientSelectModal,
  ClientFormModal,
} from '@components/party/modals/ClientModal'
import { ServiceCreateModal } from '@components/party/modals/ServiceModal'
import LocationModal from '@components/party/modals/LocationModal'
import ClientPicker from '@components/ClientPicker'
import Modal from '@components/Modal'
import Input from '@components/Input'
import Select from '@components/Select'
import InputWrapper from '@components/InputWrapper'
import DateTimePicker from '@components/DateTimePicker'
import Textarea from '@components/Textarea'
import ServiceMultiSelect from '@components/ServiceMultiSelect'
import OtherContactsPicker from '@components/OtherContactsPicker'
import PartyAddressPoolPicker from '@components/party/inputs/PartyAddressPoolPicker'
import PartyOrderTypePicker from '@components/party/inputs/PartyOrderTypePicker'
import PartyOrderTransactionsSection from '@components/party/orders/PartyOrderTransactionsSection'
import PartyOrderDocumentsSection from '@components/party/orders/PartyOrderDocumentsSection'
import PartyAvitoConversationsPanel from '@components/party/integrations/PartyAvitoConversationsPanel'
import PartyVkConversationsPanel from '@components/party/integrations/PartyVkConversationsPanel'
import partyServicesAtom from '@state/atoms/partyServicesAtom'
import AddIconButton from '@components/AddIconButton'
import TabContext from '@components/Tabs/TabContext'
import TabPanel from '@components/Tabs/TabPanel'
import {
  EMPTY_PARTY_ADDITIONAL_EVENT,
  EMPTY_PARTY_CLIENT,
  EMPTY_PARTY_SERVICE,
  EMPTY_LOCATION,
} from '@helpers/partyHelpers'
import { normalizeCompanyDictionary } from '@helpers/companySettings'
import {
  PARTY_ORDER_PAYOUT_STATUSES,
  getPartyPayoutStatusLabel,
  normalizePartyPayoutStatus,
} from '@helpers/partyOrderTransactions'
import getPersonFullName from '@helpers/getPersonFullName'

// Нормализация телефона: цифры 11 символов, 8xxx → 7xxx
const normalizePhone = (value) => {
  if (!value) return null
  const digits = String(value).replace(/[^\d]/g, '')
  if (digits.length < 11) return null
  const normalized = digits.slice(0, 11)
  if (normalized.startsWith('8')) return `7${normalized.slice(1)}`
  if (normalized.startsWith('7')) return normalized
  return null
}

const specializationLabels = {
  animator: 'Аниматор',
  magician: 'Фокусник',
  host: 'Ведущий',
  photographer: 'Фотограф',
  workshop: 'Мастер-класс',
  other: 'Другое',
}

export default function OrderModal({
  open,
  title = 'Новый заказ',
  orderDraft,
  setOrderDraft,
  locations,
  onLocationCreated,
  staff,
  clients,
  clientsById,
  services,
  companySettings,
  activeCompanyId,
  canManage = false,
  saving,
  onClose,
  onSubmit,
  onCompanySettingsChange,
  onServiceCreated,
  onClientCreated,
  isEdit,
}) {
  const [clientModal, setClientModal] = useState('')
  const [clientDraft, setClientDraft] = useState(EMPTY_PARTY_CLIENT)
  const [clientSaving, setClientSaving] = useState(false)
  const [otherContactSelectIndex, setOtherContactSelectIndex] = useState(null)

  const [serviceModal, setServiceModal] = useState(false)
  const [serviceDraft, setServiceDraft] = useState(EMPTY_PARTY_SERVICE)
  const [serviceSaving, setServiceSaving] = useState(false)

  const [locationModal, setLocationModal] = useState(false)
  const [locationDraft, setLocationDraft] = useState(EMPTY_LOCATION)
  const [locationSaving, setLocationSaving] = useState(false)

  const setPartyServices = useSetAtom(partyServicesAtom)

  // Ошибка отправки формы (показывается внизу модального окна)
  const [submitError, setSubmitError] = useState('')

  const selectedClient = orderDraft.clientId
    ? (clientsById.get(String(orderDraft.clientId)) ?? null)
    : null

  const requestHeaders = useMemo(
    () =>
      activeCompanyId
        ? {
            'Content-Type': 'application/json',
            'x-partycrm-company-id': activeCompanyId,
          }
        : { 'Content-Type': 'application/json' },
    [activeCompanyId]
  )

  // Определяем, является ли заказ новым (без _id) — для блокировки транзакций
  const isNewOrder = !orderDraft._id

  const handleChange = useCallback(
    (field, value) => {
      setOrderDraft((prev) => ({ ...prev, [field]: value }))
    },
    [setOrderDraft]
  )

  const handleCompanySettingsResponse = useCallback(
    (payload = {}) => {
      onCompanySettingsChange?.(payload?.settings ?? payload ?? {})
    },
    [onCompanySettingsChange]
  )

  const handleOrderTypeCreate = useCallback(
    async (type) => {
      if (!activeCompanyId) return

      const normalizedType = String(type ?? '').trim()
      if (!normalizedType) return

      const nextOrderTypes = normalizeCompanyDictionary([
        ...(Array.isArray(companySettings?.orderTypes)
          ? companySettings.orderTypes
          : []),
        normalizedType,
      ])

      const response = await apiJson('/api/party/company-settings', {
        method: 'PATCH',
        headers: requestHeaders,
        body: JSON.stringify({ orderTypes: nextOrderTypes }),
      })
      handleCompanySettingsResponse(response.data)
    },
    [
      activeCompanyId,
      companySettings?.orderTypes,
      handleCompanySettingsResponse,
      requestHeaders,
    ]
  )

  const closeClientModal = useCallback(() => {
    setClientModal('')
    setOtherContactSelectIndex(null)
  }, [])

  const handleAdditionalEventChange = useCallback(
    (index, field, value) => {
      setOrderDraft((prev) => ({
        ...prev,
        additionalEvents: (prev.additionalEvents || []).map(
          (item, itemIndex) =>
            itemIndex === index
              ? {
                  ...item,
                  [field]: value,
                  ...(field === 'done'
                    ? { doneAt: value ? new Date().toISOString() : null }
                    : {}),
                }
              : item
        ),
      }))
    },
    [setOrderDraft]
  )

  const handleAddAdditionalEvent = useCallback(() => {
    setOrderDraft((prev) => ({
      ...prev,
      additionalEvents: [
        ...(prev.additionalEvents || []),
        { ...EMPTY_PARTY_ADDITIONAL_EVENT },
      ],
    }))
  }, [setOrderDraft])

  const handleRemoveAdditionalEvent = useCallback(
    (index) => {
      setOrderDraft((prev) => ({
        ...prev,
        additionalEvents: (prev.additionalEvents || []).filter(
          (_, itemIndex) => itemIndex !== index
        ),
      }))
    },
    [setOrderDraft]
  )

  const handleStaffToggle = useCallback(
    (staffId, checked) => {
      setOrderDraft((prev) => {
        const current = prev.assignedStaff || []
        if (checked) {
          return {
            ...prev,
            assignedStaff: [
              ...current,
              { staffId, payoutAmount: '', payoutStatus: 'planned' },
            ],
          }
        }
        return {
          ...prev,
          assignedStaff: current.filter((s) => s.staffId !== staffId),
        }
      })
    },
    [setOrderDraft]
  )

  const handlePayoutChange = useCallback(
    (staffId, value) => {
      setOrderDraft((prev) => ({
        ...prev,
        assignedStaff: (prev.assignedStaff || []).map((s) =>
          s.staffId === staffId ? { ...s, payoutAmount: value } : s
        ),
      }))
    },
    [setOrderDraft]
  )

  const handlePayoutStatusChange = useCallback(
    (staffId, value) => {
      setOrderDraft((prev) => ({
        ...prev,
        assignedStaff: (prev.assignedStaff || []).map((s) =>
          s.staffId === staffId
            ? { ...s, payoutStatus: normalizePartyPayoutStatus(value) }
            : s
        ),
      }))
    },
    [setOrderDraft]
  )

  const handleClientSelect = useCallback(
    (client) => {
      if (otherContactSelectIndex !== null) {
        setOrderDraft((prev) => ({
          ...prev,
          otherContacts: (prev.otherContacts || []).map((contact, index) =>
            index === otherContactSelectIndex
              ? { ...contact, clientId: client._id }
              : contact
          ),
        }))
        setOtherContactSelectIndex(null)
        return
      }
      setOrderDraft((prev) => ({ ...prev, clientId: client._id }))
    },
    [otherContactSelectIndex, setOrderDraft]
  )

  const handleOtherContactAdd = useCallback(() => {
    setOrderDraft((prev) => ({
      ...prev,
      otherContacts: [...(prev.otherContacts || []), { clientId: '', comment: '' }],
    }))
  }, [setOrderDraft])

  const handleOtherContactSelect = useCallback((index) => {
    setOtherContactSelectIndex(index)
    setClientModal('select')
  }, [])

  const handleOtherContactCommentChange = useCallback(
    (index, value) => {
      setOrderDraft((prev) => ({
        ...prev,
        otherContacts: (prev.otherContacts || []).map((contact, itemIndex) =>
          itemIndex === index ? { ...contact, comment: value } : contact
        ),
      }))
    },
    [setOrderDraft]
  )

  const handleOtherContactRemove = useCallback(
    (index) => {
      setOrderDraft((prev) => ({
        ...prev,
        otherContacts: (prev.otherContacts || []).filter(
          (_, itemIndex) => itemIndex !== index
        ),
      }))
    },
    [setOrderDraft]
  )

  const handleClientCreate = useCallback(async (clientPayload = clientDraft) => {
    // Проверка дубликата по телефону
    const normalizedPhone = normalizePhone(clientPayload.phone)
    if (normalizedPhone) {
      const existingClient = clients.find(
        (item) =>
          item?.phone &&
          normalizePhone(item.phone) === normalizedPhone &&
          item._id !== orderDraft.clientId
      )
      if (existingClient) {
        const fullName = getPersonFullName(existingClient, {
          fallback: 'Без имени',
        })
        const confirmed = window.confirm(
          `Найден клиент: ${fullName}. Выбрать его?`
        )
        if (confirmed) {
          if (otherContactSelectIndex !== null) {
            setOrderDraft((prev) => ({
              ...prev,
              otherContacts: (prev.otherContacts || []).map((contact, index) =>
                index === otherContactSelectIndex
                  ? { ...contact, clientId: existingClient._id }
                  : contact
              ),
            }))
            setOtherContactSelectIndex(null)
          } else {
            setOrderDraft((prev) => ({ ...prev, clientId: existingClient._id }))
          }
        }
        setClientModal('')
        return
      }
    }

    setClientSaving(true)
    try {
      const response = await apiJson('/api/party/clients', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(clientPayload),
      })
      if (response.data) {
        if (otherContactSelectIndex !== null) {
          setOrderDraft((prev) => ({
            ...prev,
            otherContacts: (prev.otherContacts || []).map((contact, index) =>
              index === otherContactSelectIndex
                ? { ...contact, clientId: response.data._id }
                : contact
            ),
          }))
          setOtherContactSelectIndex(null)
        } else {
          setOrderDraft((prev) => ({ ...prev, clientId: response.data._id }))
        }
        if (onClientCreated) {
          onClientCreated(response.data)
        }
      }
    } finally {
      setClientSaving(false)
      closeClientModal()
    }
  }, [
    clientDraft,
    clients,
    orderDraft.clientId,
    otherContactSelectIndex,
    requestHeaders,
    setOrderDraft,
    onClientCreated,
    closeClientModal,
  ])

  const handleClientEdit = useCallback(async (clientPayload = clientDraft) => {
    const clientId = clientPayload?._id || orderDraft.clientId
    if (!clientId) return
    setClientSaving(true)
    try {
      await apiJson(`/api/party/clients/${clientId}`, {
        method: 'PATCH',
        headers: requestHeaders,
        body: JSON.stringify(clientPayload),
      })
    } finally {
      setClientSaving(false)
      closeClientModal()
    }
  }, [clientDraft, orderDraft.clientId, requestHeaders, closeClientModal])

  const handleServiceCreate = useCallback(async () => {
    setServiceSaving(true)
    try {
      const response = await apiJson('/api/party/services', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(serviceDraft),
      })
      if (response.data) {
        setPartyServices((prev) => [...prev, response.data])
        setOrderDraft((prev) => ({
          ...prev,
          servicesIds: [...(prev.servicesIds || []), response.data._id],
        }))
        if (onServiceCreated) {
          onServiceCreated(response.data)
        }
      }
    } finally {
      setServiceSaving(false)
      setServiceModal(false)
    }
  }, [
    onServiceCreated,
    requestHeaders,
    serviceDraft,
    setOrderDraft,
    setPartyServices,
  ])

  const handleLocationCreate = useCallback(async () => {
    setLocationSaving(true)
    try {
      const response = await apiJson('/api/party/locations', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(locationDraft),
      })
      if (response.data) {
        setOrderDraft((prev) => ({
          ...prev,
          locationId: response.data._id,
        }))
        if (onLocationCreated) {
          onLocationCreated(response.data)
        }
      }
    } finally {
      setLocationSaving(false)
      setLocationModal(false)
      setLocationDraft(EMPTY_LOCATION)
    }
  }, [onLocationCreated, requestHeaders, locationDraft, setOrderDraft])

  // Автосохранение перед открытием транзакции (для нового заказа)
  const handleAutosaveBeforeTransaction = useCallback(async () => {
    if (isNewOrder) {
      const savedOrder = await onSubmit({ keepOpen: true })
      if (savedOrder?._id) {
        return savedOrder._id
      }
      return null
    }
    return orderDraft._id
  }, [isNewOrder, onSubmit, orderDraft._id])

  // Валидация полей и отправка формы
  const handleSubmit = useCallback(async () => {
    setSubmitError('')

    // Проверка: клиент не выбран
    if (!orderDraft.clientId) {
      setSubmitError('Укажите клиента')
      return
    }

    // Проверка: услуги не выбраны
    if (!orderDraft.servicesIds || orderDraft.servicesIds.length === 0) {
      setSubmitError('Укажите услугу')
      return
    }

    try {
      await onSubmit()
    } catch (err) {
      setSubmitError(err.message || 'Ошибка при сохранении заказа')
    }
  }, [orderDraft.clientId, orderDraft.servicesIds, onSubmit])

  // Footer with action buttons
  const footerContent = (
    <div className="flex flex-col w-full gap-1">
      {submitError && (
        <div className="px-3 py-2 text-sm text-red-600 rounded bg-red-50">
          {submitError}
        </div>
      )}
      <div className="flex items-center justify-end w-full gap-1">
        <button
          type="button"
          className="px-4 py-2 text-sm font-semibold text-gray-700 transition border border-gray-300 rounded cursor-pointer hover:bg-gray-50"
          onClick={onClose}
        >
          Отмена
        </button>
        <button
          type="button"
          className="px-4 py-2 text-sm font-semibold text-white transition rounded cursor-pointer bg-sky-600 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Добавить заказ'}
        </button>
      </div>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      tone="party"
      size="full"
      footer={footerContent}
    >
      <TabContext value="Основное">
        {/* ====== Вкладка 1: Основное ====== */}
        <TabPanel tabName="Основное">
          <div className="flex flex-col gap-2">
            <PartyOrderTypePicker
              value={orderDraft.title || ''}
              onChange={(val) => handleChange('title', val || '')}
              orderTypes={companySettings?.orderTypes || []}
              onCreateOrderType={handleOrderTypeCreate}
              allowCreate={Boolean(activeCompanyId)}
            />
            <ServiceMultiSelect
              value={orderDraft.servicesIds || []}
              onChange={(val) => handleChange('servicesIds', val)}
              services={services}
              atom={partyServicesAtom}
              onCreate={() => setServiceModal(true)}
              required
              tone="party"
            />
            <div className="flex flex-col gap-2 md:flex-row">
              <DateTimePicker
                label="Дата и время"
                value={orderDraft.eventDate}
                onChange={(val) => handleChange('eventDate', val)}
                tone="party"
                required
              />
              <Input
                label="Длительность, мин"
                type="number"
                value={orderDraft.durationMinutes}
                onChange={(val) => handleChange('durationMinutes', val)}
                tone="party"
              />
            </div>

            <Select
              label="Место"
              value={orderDraft.placeType}
              onChange={(val) => {
                handleChange('placeType', val)
                if (val === 'company_location') {
                  handleChange('locationId', orderDraft.locationId || '')
                } else {
                  handleChange('locationId', '')
                }
              }}
              options={[
                { value: 'company_location', label: 'Точка компании' },
                { value: 'client_address', label: 'Выезд к клиенту' },
              ]}
              fullWidth
              tone="party"
            />

            {orderDraft.placeType === 'company_location' ? (
              <InputWrapper label="Точка" tone="party">
                <div className="relative flex items-center flex-1">
                  <select
                    className="w-full px-1 text-black bg-transparent outline-none appearance-none cursor-pointer peer"
                    value={orderDraft.locationId || ''}
                    onChange={(e) => handleChange('locationId', e.target.value)}
                  >
                    <option value="">Без точки</option>
                    {locations.map((loc) => (
                      <option key={loc._id} value={loc._id}>
                        {loc.title}
                      </option>
                    ))}
                  </select>
                  <div className="text-gray-400 pointer-events-none shrink-0">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </div>
                  <AddIconButton
                    onClick={() => {
                      setLocationDraft(EMPTY_LOCATION)
                      setLocationModal(true)
                    }}
                    title="Добавить точку"
                    size="xs"
                    tone="party"
                    className="shrink-0"
                  />
                </div>
              </InputWrapper>
            ) : (
              <PartyAddressPoolPicker
                value={orderDraft.clientAddress || {}}
                onChange={(nextAddress) => {
                  handleChange('clientAddress', nextAddress)
                  const parts = [
                    nextAddress.town,
                    nextAddress.street,
                    nextAddress.house ? `д. ${nextAddress.house}` : '',
                    nextAddress.room,
                  ].filter(Boolean)
                  const line =
                    parts.join(', ') +
                    (nextAddress.comment ? ` (${nextAddress.comment})` : '')
                  handleChange('customAddress', line)
                }}
                companySettings={companySettings}
                activeCompanyId={activeCompanyId}
                onCompanySettingsChange={onCompanySettingsChange}
              />
            )}
            <Textarea
              label="Комментарий"
              value={orderDraft.adminComment || ''}
              onChange={(val) => handleChange('adminComment', val)}
              rows={3}
              fullWidth
              tone="party"
            />
          </div>
        </TabPanel>

        {/* ====== Вкладка 2: Клиенты и контакты ====== */}
        <TabPanel tabName="Клиенты и контакты">
          <div className="flex flex-col gap-2">
            <ClientPicker
              label="Клиент"
              selectedClient={selectedClient}
              selectedClientId={orderDraft.clientId || null}
              onSelectClick={() => setClientModal('select')}
              onCreateClick={() => {
                setClientDraft(EMPTY_PARTY_CLIENT)
                setClientModal('create')
              }}
              onEditClick={() => {
                if (selectedClient) {
                  setClientDraft(selectedClient)
                }
                setClientModal('edit')
              }}
              compact
              fullWidth
              tone="party"
            />
            <OtherContactsPicker
              label="Доп. контакты"
              contacts={orderDraft.otherContacts || []}
              clients={clients}
              tone="party"
              onSelectContact={handleOtherContactSelect}
              onChangeComment={handleOtherContactCommentChange}
              onRemoveContact={handleOtherContactRemove}
              onEditContact={(index) => {
                const contact = orderDraft.otherContacts?.[index]
                const contactClient = contact?.clientId
                  ? clientsById.get(String(contact.clientId))
                  : null
                if (contactClient) {
                  setClientDraft(contactClient)
                  setClientModal('edit')
                }
              }}
              onViewContact={(index) => {
                const contact = orderDraft.otherContacts?.[index]
                const contactClient = contact?.clientId
                  ? clientsById.get(String(contact.clientId))
                  : null
                if (contactClient) {
                  setClientDraft(contactClient)
                  setClientModal('edit')
                } else {
                  handleOtherContactSelect(index)
                }
              }}
              onAddContact={handleOtherContactAdd}
            />
          </div>
        </TabPanel>

        {/* ====== Вкладка 3: Команда ====== */}
        <TabPanel tabName="Команда">
          <div className="flex flex-col gap-1">
            {staff.filter((p) => p.role !== 'owner').length === 0 && (
              <p className="mb-2 text-sm text-gray-500">
                Добавьте исполнителей в блоке сотрудников ниже.
              </p>
            )}
            {staff
              .filter((p) => p.role !== 'owner')
              .map((person) => {
                const assigned = (orderDraft.assignedStaff || []).find(
                  (s) => s.staffId === person._id
                )
                const displayName =
                  [person.secondName, person.firstName]
                    .filter(Boolean)
                    .join(' ') ||
                  person.phone ||
                  person.email ||
                  'Без имени'
                return (
                  <div
                    key={person._id}
                    className={`rounded-2xl border border-gray-200 p-2 ${
                      assigned ? 'bg-sky-50' : 'bg-white'
                    }`}
                  >
                    <div className="flex flex-row items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!!assigned}
                        onChange={(e) =>
                          handleStaffToggle(person._id, e.target.checked)
                        }
                        className="cursor-pointer"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">{displayName}</p>
                        {person.specialization && (
                          <span className="inline-block rounded bg-sky-100 px-2 py-0.5 text-xs text-sky-700">
                            {specializationLabels[person.specialization] ||
                              person.specialization}
                          </span>
                        )}
                      </div>
                      {assigned && (
                        <div className="grid gap-2 sm:grid-cols-[9rem_12rem]">
                          <Input
                            label="Выплата"
                            type="number"
                            value={assigned.payoutAmount}
                            onChange={(val) =>
                              handlePayoutChange(person._id, val)
                            }
                            tone="party"
                            postfix="₽"
                          />
                          <InputWrapper label="Статус выплаты" tone="party">
                            <select
                              className="w-full px-1 text-sm text-black bg-transparent outline-none appearance-none cursor-pointer"
                              value={normalizePartyPayoutStatus(
                                assigned.payoutStatus
                              )}
                              onChange={(e) =>
                                handlePayoutStatusChange(
                                  person._id,
                                  e.target.value
                                )
                              }
                            >
                              {PARTY_ORDER_PAYOUT_STATUSES.map((status) => (
                                <option key={status} value={status}>
                                  {getPartyPayoutStatusLabel(status)}
                                </option>
                              ))}
                            </select>
                          </InputWrapper>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>
        </TabPanel>

        {/* ====== Вкладка 4: Финансы и документы ====== */}
        <TabPanel tabName="Финансы и документы">
          <div className="flex flex-col gap-2">
            <Input
              label="Сумма клиента"
              type="number"
              value={
                orderDraft.clientPayment?.totalAmount ??
                orderDraft.contractAmount ??
                ''
              }
              onChange={(val) => {
                setOrderDraft((prev) => ({
                  ...prev,
                  contractAmount: val,
                  clientPayment: {
                    ...(prev.clientPayment || {}),
                    totalAmount: val,
                  },
                }))
              }}
              min={0}
              step={1000}
              noMargin
              tone="party"
              postfix="₽"
            />

            <hr className="border-t border-gray-200" />

            <PartyOrderTransactionsSection
              orderId={orderDraft._id || ''}
              contractAmount={
                orderDraft.clientPayment?.totalAmount ??
                orderDraft.contractAmount ??
                0
              }
              isDraft={orderDraft.status === 'draft'}
              isClosed={orderDraft.status === 'closed'}
              onRequestAutosave={handleAutosaveBeforeTransaction}
            />

            <hr className="border-t border-gray-200" />

            <div className="mt-2">
              <div className="mb-2 text-xs font-semibold tracking-wide uppercase text-slate-500">
                Документы
              </div>
              <PartyOrderDocumentsSection
                order={orderDraft}
                client={selectedClient}
                services={services}
                companySettings={companySettings}
                activeCompanyId={activeCompanyId}
              />
            </div>

            <hr className="border-t border-gray-200" />

            <div className="mt-2 grid gap-4">
              <div className="text-xs font-semibold tracking-wide uppercase text-slate-500">
                Переписки
              </div>
              {orderDraft._id ? (
                <>
                  <PartyVkConversationsPanel
                    clientId={orderDraft.clientId || ''}
                    orderId={orderDraft._id || ''}
                    companyId={activeCompanyId}
                    canReply={canManage}
                  />
                  <PartyAvitoConversationsPanel
                    clientId={orderDraft.clientId || ''}
                    orderId={orderDraft._id || ''}
                    companyId={activeCompanyId}
                    canReply={canManage}
                  />
                </>
              ) : (
                <p className="text-sm text-gray-500">
                  Переписки появятся после сохранения заказа.
                </p>
              )}
            </div>
          </div>
        </TabPanel>

        {/* ====== Вкладка 5: Доп. события ====== */}
        <TabPanel tabName="Доп. события">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-end">
              <button
                type="button"
                className="cursor-pointer rounded-md border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                onClick={handleAddAdditionalEvent}
              >
                Добавить
              </button>
            </div>

            {(orderDraft.additionalEvents || []).length === 0 ? (
              <p className="text-sm text-gray-500">
                Дополнительные события еще не добавлены.
              </p>
            ) : (
              <div className="grid gap-2">
                {(orderDraft.additionalEvents || []).map((item, index) => (
                  <div
                    key={item._id || index}
                    className="p-3 border rounded-2xl border-sky-100 bg-sky-50/50"
                  >
                    <div className="grid gap-2 md:grid-cols-[1fr_auto]">
                      <Input
                        label="Название"
                        value={item.title}
                        onChange={(val) =>
                          handleAdditionalEventChange(index, 'title', val)
                        }
                        fullWidth
                        tone="party"
                      />
                      <DateTimePicker
                        label="Дата и время"
                        value={item.date}
                        onChange={(val) =>
                          handleAdditionalEventChange(index, 'date', val)
                        }
                        tone="party"
                      />
                    </div>
                    <Textarea
                      label="Описание"
                      value={item.description}
                      onChange={(val) =>
                        handleAdditionalEventChange(index, 'description', val)
                      }
                      fullWidth
                      tone="party"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                      <label className="flex items-center gap-2 text-sm font-semibold cursor-pointer text-slate-700">
                        <input
                          type="checkbox"
                          checked={Boolean(item.done)}
                          onChange={(e) =>
                            handleAdditionalEventChange(
                              index,
                              'done',
                              e.target.checked
                            )
                          }
                          className="cursor-pointer"
                        />
                        Выполнено
                      </label>
                      <button
                        type="button"
                        className="cursor-pointer rounded-md border border-red-100 bg-white px-3 py-1.5 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                        onClick={() => handleRemoveAdditionalEvent(index)}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabPanel>
      </TabContext>

      {/* Client Modals */}
      <ClientSelectModal
        open={clientModal === 'select'}
        clients={clients}
        onClose={closeClientModal}
        onSelect={handleClientSelect}
        onAddNew={() => {
          setClientDraft(EMPTY_PARTY_CLIENT)
          setClientModal('create')
        }}
      />

      <ClientFormModal
        open={clientModal === 'create'}
        title="Новый клиент"
        clientDraft={clientDraft}
        setClientDraft={setClientDraft}
        onClose={closeClientModal}
        onSubmit={handleClientCreate}
        saving={clientSaving}
        activeCompanyId={activeCompanyId}
        companySettings={companySettings}
        onCompanySettingsChange={onCompanySettingsChange}
      />

      <ClientFormModal
        open={clientModal === 'edit'}
        title="Редактировать клиента"
        clientDraft={clientDraft}
        setClientDraft={setClientDraft}
        onClose={closeClientModal}
        onSubmit={handleClientEdit}
        saving={clientSaving}
        activeCompanyId={activeCompanyId}
        companySettings={companySettings}
        onCompanySettingsChange={onCompanySettingsChange}
      />

      <ServiceCreateModal
        open={serviceModal}
        serviceDraft={serviceDraft}
        setServiceDraft={setServiceDraft}
        onClose={() => setServiceModal(false)}
        onSubmit={handleServiceCreate}
        saving={serviceSaving}
        activeCompanyId={activeCompanyId}
      />

      <LocationModal
        open={locationModal}
        locationDraft={locationDraft}
        setLocationDraft={setLocationDraft}
        onClose={() => {
          setLocationModal(false)
          setLocationDraft(EMPTY_LOCATION)
        }}
        onSubmit={handleLocationCreate}
        saving={locationSaving}
        companySettings={companySettings}
        activeCompanyId={activeCompanyId}
        onCompanySettingsChange={onCompanySettingsChange}
      />
    </Modal>
  )
}
