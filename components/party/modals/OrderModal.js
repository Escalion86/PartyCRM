'use client'

import { useState, useCallback, useMemo } from 'react'
import { useSetAtom } from 'jotai'
import { apiJson } from '@helpers/apiClient'
import {
  ClientSelectModal,
  ClientFormModal,
} from '@components/party/modals/ClientModal'
import { ServiceCreateModal } from '@components/party/modals/ServiceModal'
import ClientPicker from '@components/ClientPicker'
import Modal from '@components/Modal'
import Input from '@components/Input'
import Select from '@components/Select'
import DateTimePicker from '@components/DateTimePicker'
import Textarea from '@components/Textarea'
import ServiceMultiSelect from '@components/ServiceMultiSelect'
import PartyAddressPoolPicker from '@components/party/inputs/PartyAddressPoolPicker'
import partyServicesAtom from '@state/atoms/partyServicesAtom'
import AddIconButton from '@components/AddIconButton'
import TabContext from '@components/Tabs/TabContext'
import TabPanel from '@components/Tabs/TabPanel'
import {
  EMPTY_PARTY_ADDITIONAL_EVENT,
  EMPTY_PARTY_CLIENT,
  EMPTY_PARTY_SERVICE,
} from '@helpers/partyHelpers'

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
  staff,
  clients,
  clientsById,
  services,
  companySettings,
  activeCompanyId,
  saving,
  onClose,
  onSubmit,
  onCompanySettingsChange,
  onServiceCreated,
  isEdit,
}) {
  const [clientModal, setClientModal] = useState('')
  const [clientDraft, setClientDraft] = useState(EMPTY_PARTY_CLIENT)
  const [clientSaving, setClientSaving] = useState(false)

  const [serviceModal, setServiceModal] = useState(false)
  const [serviceDraft, setServiceDraft] = useState(EMPTY_PARTY_SERVICE)
  const [serviceSaving, setServiceSaving] = useState(false)

  const setPartyServices = useSetAtom(partyServicesAtom)

  // Транзакции — заглушка (будет заменена на реальные хуки после создания API)
  const [financeError, setFinanceError] = useState('')
  const [financeLoading, setFinanceLoading] = useState(false)

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
            assignedStaff: [...current, { staffId, payoutAmount: '' }],
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

  const handleClientSelect = useCallback(
    (client) => {
      setOrderDraft((prev) => ({ ...prev, clientId: client._id }))
    },
    [setOrderDraft]
  )

  const handleClientCreate = useCallback(async () => {
    setClientSaving(true)
    try {
      const response = await apiJson('/api/party/clients', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify(clientDraft),
      })
      if (response.data) {
        setOrderDraft((prev) => ({ ...prev, clientId: response.data._id }))
      }
    } finally {
      setClientSaving(false)
      setClientModal('')
    }
  }, [clientDraft, requestHeaders, setOrderDraft])

  const handleClientEdit = useCallback(async () => {
    if (!orderDraft.clientId) return
    setClientSaving(true)
    try {
      await apiJson(`/api/party/clients/${orderDraft.clientId}`, {
        method: 'PATCH',
        headers: requestHeaders,
        body: JSON.stringify(clientDraft),
      })
    } finally {
      setClientSaving(false)
      setClientModal('')
    }
  }, [clientDraft, orderDraft.clientId, requestHeaders])

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

  // Автосохранение перед открытием транзакции (для нового заказа)
  const handleAutosaveBeforeTransaction = useCallback(async () => {
    if (isNewOrder) {
      setFinanceError('Сначала сохраните заказ')
      return null
    }
    return orderDraft._id
  }, [isNewOrder, orderDraft._id])

  const openTransactionModal = useCallback(
    (transactionId) => {
      setFinanceError('')
      const orderId = handleAutosaveBeforeTransaction()
      if (!orderId) return

      // Заглушка: транзакции будут доступны после реализации API
      setFinanceError(
        'Раздел транзакций находится в разработке. ' +
          'Пока используйте поле "Сумма клиента" для фиксации договорной суммы.'
      )
    },
    [handleAutosaveBeforeTransaction]
  )

  // Footer with action buttons
  const footerContent = (
    <div className="flex w-full items-center justify-end gap-1">
      <button
        type="button"
        className="cursor-pointer rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        onClick={onClose}
      >
        Отмена
      </button>
      <button
        type="button"
        className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onSubmit}
        disabled={saving}
      >
        {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Добавить заказ'}
      </button>
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
            <ServiceMultiSelect
              value={orderDraft.servicesIds || []}
              onChange={(val) => handleChange('servicesIds', val)}
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
              <Select
                label="Точка"
                value={orderDraft.locationId}
                onChange={(val) => handleChange('locationId', val)}
                options={[
                  { value: '', label: 'Без точки' },
                  ...locations.map((loc) => ({
                    value: loc._id,
                    label: loc.title,
                  })),
                ]}
                fullWidth
                tone="party"
              />
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
                        <Input
                          label="Выплата"
                          type="number"
                          value={assigned.payoutAmount}
                          onChange={(val) =>
                            handlePayoutChange(person._id, val)
                          }
                          className="w-36"
                          tone="party"
                          postfix="₽"
                        />
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

            {/* Блок транзакций */}
            <div className="flex items-center justify-between gap-3">
              <div className="text-base font-semibold text-gray-900">
                Транзакции
              </div>
              <AddIconButton
                onClick={() => openTransactionModal()}
                disabled={isNewOrder || financeLoading}
                title="Добавить транзакцию"
                size="sm"
                className="disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>

            {isNewOrder ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Сохраните заказ, чтобы добавить транзакции.
              </div>
            ) : null}

            {financeError && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                {financeError}
              </div>
            )}

            {financeLoading ? (
              <p className="text-sm text-gray-500">Загрузка транзакций...</p>
            ) : null}
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
                    className="rounded-2xl border border-sky-100 bg-sky-50/50 p-3"
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
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-700">
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
        onClose={() => setClientModal('')}
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
        onClose={() => setClientModal('')}
        onSubmit={handleClientCreate}
        saving={clientSaving}
      />

      <ClientFormModal
        open={clientModal === 'edit'}
        title="Редактировать клиента"
        clientDraft={clientDraft}
        setClientDraft={setClientDraft}
        onClose={() => setClientModal('')}
        onSubmit={handleClientEdit}
        saving={clientSaving}
      />

      <ServiceCreateModal
        open={serviceModal}
        serviceDraft={serviceDraft}
        setServiceDraft={setServiceDraft}
        onClose={() => setServiceModal(false)}
        onSubmit={handleServiceCreate}
        saving={serviceSaving}
      />
    </Modal>
  )
}
