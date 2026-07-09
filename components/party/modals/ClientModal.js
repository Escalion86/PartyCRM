'use client'

import { useCallback, useMemo, useState } from 'react'
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons/faMagnifyingGlass'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { apiJson } from '@helpers/apiClient'
import { normalizeCompanyDictionary } from '@helpers/companySettings'
import getPersonFullName from '@helpers/getPersonFullName'
import DateInput from '@components/DateInput'
import PhoneInput from '@components/PhoneInput'
import Input from '@components/Input'
import Select from '@components/Select'
import Textarea from '@components/Textarea'
import CheckBox from '@components/CheckBox'
import Modal from '@components/Modal'
import ContactsIconsButtons from '@components/ContactsIconsButtons'
import PartyAddressBlock from '@components/party/inputs/PartyAddressBlock'
import PartyDictionaryPicker from '@components/party/inputs/PartyDictionaryPicker'
import PartyAvitoConversationsPanel from '@components/party/integrations/PartyAvitoConversationsPanel'
import PartyVkConversationsPanel from '@components/party/integrations/PartyVkConversationsPanel'

const similarReasonLabels = {
  phone: 'телефон',
  whatsapp: 'WhatsApp',
  viber: 'Viber',
  email: 'email',
  telegram: 'Telegram',
  vk: 'VK',
  instagram: 'Instagram',
}

const createSignificantDate = () => ({
  title: '',
  date: null,
  comment: '',
})

const normalizeSignificantDates = (items) =>
  (Array.isArray(items) ? items : [])
    .map((item) => ({
      title: String(item?.title ?? '').trim(),
      date: item?.date || null,
      comment: String(item?.comment ?? '').trim(),
    }))
    .filter((item) => item.title || item.date || item.comment)

const formatDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const ClientViewSection = ({ title, children }) => (
  <section className="rounded-lg border border-sky-100 bg-white p-3">
    <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">
      {title}
    </div>
    {children}
  </section>
)

const ClientViewLine = ({ label, children }) => (
  <div className="grid gap-1 text-sm sm:grid-cols-[10rem_1fr]">
    <div className="font-semibold text-slate-500">{label}</div>
    <div className="min-w-0 break-words text-slate-900">{children || '-'}</div>
  </div>
)

export function ClientViewModal({
  open,
  client,
  onClose,
  canManage = false,
  onEdit,
}) {
  const significantDates = Array.isArray(client?.significantDates)
    ? client.significantDates
    : []
  const hasLegalRequisites = Boolean(
    client?.legalName ||
      client?.legalAddress ||
      client?.inn ||
      client?.kpp ||
      client?.ogrn ||
      client?.bankName ||
      client?.bik ||
      client?.checkingAccount ||
      client?.correspondentAccount
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Просмотр клиента"
      tone="party"
      size="full"
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="cursor-pointer rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
            onClick={onClose}
          >
            Закрыть
          </button>
          {canManage ? (
            <button
              type="button"
              className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700"
              onClick={() => onEdit?.(client)}
            >
              Редактировать
            </button>
          ) : null}
        </div>
      }
    >
      <div className="grid gap-3">
        <ClientViewSection title="Клиент">
          <div className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-sky-100 bg-sky-50 text-base font-bold text-sky-700">
                {getPersonFullName(client, 'К').slice(0, 1).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="text-lg font-semibold break-words text-slate-950">
                  {getPersonFullName(client, 'Без имени')}
                </div>
                {client?.leadSource ? (
                  <div className="text-sm text-slate-500">
                    Откуда узнал о компании: {client.leadSource}
                  </div>
                ) : null}
              </div>
            </div>
            <ContactsIconsButtons
              user={client}
              showChat
              className="my-0 flex-wrap"
            />
          </div>
        </ClientViewSection>

        <ClientViewSection title="Контакты">
          <div className="grid gap-2">
            <ClientViewLine label="Телефон">
              {client?.phone ? `+${client.phone}` : ''}
            </ClientViewLine>
            <ClientViewLine label="WhatsApp">
              {client?.whatsapp ? `+${client.whatsapp}` : ''}
            </ClientViewLine>
            <ClientViewLine label="Viber">
              {client?.viber ? `+${client.viber}` : ''}
            </ClientViewLine>
            <ClientViewLine label="Telegram">
              {client?.telegram ? `@${client.telegram}` : ''}
            </ClientViewLine>
            <ClientViewLine label="Instagram">
              {client?.instagram ? `@${client.instagram}` : ''}
            </ClientViewLine>
            <ClientViewLine label="VK">
              {client?.vk ? `@${client.vk}` : ''}
            </ClientViewLine>
            <ClientViewLine label="Email">{client?.email}</ClientViewLine>
            <ClientViewLine label="Предпочтительный канал">
              {client?.preferredContactChannelOther ||
                client?.preferredContactChannel}
            </ClientViewLine>
          </div>
        </ClientViewSection>

        {client?.comment ? (
          <ClientViewSection title="Комментарий">
            <div className="whitespace-pre-wrap text-sm text-slate-700">
              {client.comment}
            </div>
          </ClientViewSection>
        ) : null}

        {significantDates.length > 0 ? (
          <ClientViewSection title="Значимые даты">
            <div className="grid gap-2">
              {significantDates.map((item, index) => (
                <div
                  key={`${item.title || 'date'}-${index}`}
                  className="rounded border border-slate-100 bg-slate-50 p-2 text-sm"
                >
                  <div className="font-semibold text-slate-900">
                    {item.title || 'Дата'}
                  </div>
                  <div className="text-slate-600">{formatDate(item.date)}</div>
                  {item.comment ? (
                    <div className="mt-1 whitespace-pre-wrap text-slate-700">
                      {item.comment}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </ClientViewSection>
        ) : null}

        {hasLegalRequisites ? (
          <ClientViewSection title="Реквизиты">
            <div className="grid gap-2">
              <ClientViewLine label="Юр. название">
                {client?.legalName}
              </ClientViewLine>
              <ClientViewLine label="Юр. адрес">
                {client?.legalAddress}
              </ClientViewLine>
              <ClientViewLine label="ИНН">{client?.inn}</ClientViewLine>
              <ClientViewLine label="КПП">{client?.kpp}</ClientViewLine>
              <ClientViewLine label="ОГРН">{client?.ogrn}</ClientViewLine>
              <ClientViewLine label="Банк">{client?.bankName}</ClientViewLine>
              <ClientViewLine label="БИК">{client?.bik}</ClientViewLine>
              <ClientViewLine label="Р/с">
                {client?.checkingAccount}
              </ClientViewLine>
              <ClientViewLine label="К/с">
                {client?.correspondentAccount}
              </ClientViewLine>
            </div>
          </ClientViewSection>
        ) : null}
      </div>
    </Modal>
  )
}

export function ClientSelectModal({
  open,
  clients,
  onClose,
  onSelect,
  onAddNew,
}) {
  const [search, setSearch] = useState('')

  const filtered = clients.filter((c) => {
    const name = getPersonFullName(c, '').toLowerCase()
    const phone = (c.phone || '').toLowerCase()
    const q = search.toLowerCase()
    return name.includes(q) || phone.includes(q)
  })

  const footerContent = (
    <div className="flex gap-2">
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
        onClick={() => {
          onAddNew()
        }}
      >
        + Новый клиент
      </button>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Выбрать клиента"
      tone="party"
      size="full"
      footer={footerContent}
    >
      <div className="flex flex-col gap-2">
        <Input
          placeholder="Поиск по имени или телефону..."
          value={search}
          onChange={setSearch}
          fullWidth
          size="sm"
          tone="party"
          prefix={
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="w-4 h-4 text-gray-400"
            />
          }
        />
        <div className="overflow-auto max-h-72">
          {filtered.length === 0 && (
            <p className="p-2 text-sm text-center text-gray-500">
              Клиенты не найдены
            </p>
          )}
          {filtered.map((client) => (
            <div
              key={client._id}
              className="p-2 border-b border-gray-200 cursor-pointer hover:bg-sky-50"
              onClick={() => {
                onSelect(client)
                onClose()
              }}
            >
              <p className="text-base font-medium">
                {getPersonFullName(client, 'Без имени')}
              </p>
              <p className="text-sm text-gray-500">
                {client.phone ? `+${client.phone}` : 'Телефон не указан'}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  )
}

export function ClientFormModal({
  open,
  title = 'Новый клиент',
  clientDraft,
  setClientDraft,
  onClose,
  onSubmit,
  saving,
  activeCompanyId = '',
  companySettings,
  onCompanySettingsChange,
  canManage = false,
  similarClients = [],
  onSimilarClientSelect,
  onMergeSimilarClient,
}) {
  const preferredChannelOptions = [
    { value: '', label: 'Не выбран' },
    { value: 'phone', label: 'Телефон' },
    { value: 'telegram', label: 'Telegram' },
    { value: 'whatsapp', label: 'WhatsApp' },
    { value: 'max', label: 'MAX' },
    { value: 'vk', label: 'VK' },
    { value: 'other', label: 'Другое' },
  ]

  const compactFieldProps = {
    fullWidth: true,
    tone: 'party',
    noMargin: true,
  }

  const compactPhoneProps = {
    tone: 'party',
    noMargin: true,
    className: 'w-full',
  }

  const hasLegalRequisites = Boolean(
    clientDraft.legalName ||
      clientDraft.legalAddress ||
      clientDraft.inn ||
      clientDraft.kpp ||
      clientDraft.ogrn ||
      clientDraft.bankName ||
      clientDraft.bik ||
      clientDraft.checkingAccount ||
      clientDraft.correspondentAccount
  )
  const isLegalEntity = clientDraft.isLegalEntity ?? hasLegalRequisites

  const handleChange = (field) => (value) => {
    setClientDraft((prev) => ({ ...prev, [field]: value }))
  }

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

  const handleLeadSourceCreate = useCallback(
    async (leadSource) => {
      if (!activeCompanyId) return

      const normalizedLeadSource = String(leadSource ?? '').trim()
      if (!normalizedLeadSource) return

      const nextLeadSources = normalizeCompanyDictionary([
        ...(Array.isArray(companySettings?.leadSources)
          ? companySettings.leadSources
          : []),
        normalizedLeadSource,
      ])

      const response = await apiJson('/api/party/company-settings', {
        method: 'PATCH',
        headers: requestHeaders,
        body: JSON.stringify({ leadSources: nextLeadSources }),
      })
      onCompanySettingsChange?.(response.data?.settings ?? response.data ?? {})
    },
    [
      activeCompanyId,
      companySettings?.leadSources,
      onCompanySettingsChange,
      requestHeaders,
    ]
  )

  const updateSignificantDate = (index, patch) => {
    setClientDraft((prev) => ({
      ...prev,
      significantDates: (prev.significantDates || []).map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      ),
    }))
  }

  const addSignificantDate = () => {
    setClientDraft((prev) => ({
      ...prev,
      significantDates: [
        ...(prev.significantDates || []),
        createSignificantDate(),
      ],
    }))
  }

  const removeSignificantDate = (index) => {
    setClientDraft((prev) => ({
      ...prev,
      significantDates: (prev.significantDates || []).filter(
        (_, itemIndex) => itemIndex !== index
      ),
    }))
  }

  const getNormalizedDraft = () => {
    const normalized = {
      ...clientDraft,
      isLegalEntity: Boolean(isLegalEntity),
      significantDates: normalizeSignificantDates(clientDraft.significantDates),
    }

    if (!normalized.isLegalEntity) {
      return {
        ...normalized,
        legalName: '',
        legalAddress: '',
        inn: '',
        kpp: '',
        ogrn: '',
        bankName: '',
        bik: '',
        checkingAccount: '',
        correspondentAccount: '',
      }
    }

    return normalized
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit(getNormalizedDraft())
  }

  const footerContent = (
    <div className="flex gap-2">
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
        disabled={saving}
        onClick={() => onSubmit(getNormalizedDraft())}
      >
        {saving ? 'Сохранение...' : 'Сохранить'}
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
      <div className="flex flex-col gap-3">
        <form
          id="client-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-2.5"
        >
          {similarClients.length > 0 && (
            <div className="grid gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              <p className="font-semibold">Похожий клиент уже есть</p>
              <div className="grid gap-2">
                {similarClients.map((item) => {
                  const similarClient = item.client || item
                  const reasons = (item.reasons || [])
                    .map((reason) => similarReasonLabels[reason] || reason)
                    .join(', ')
                  return (
                    <div
                      key={similarClient._id}
                      className="rounded border border-amber-200 bg-white px-3 py-2"
                    >
                      <button
                        type="button"
                        className="block w-full cursor-pointer text-left font-semibold transition hover:text-amber-700"
                        onClick={() =>
                          onSimilarClientSelect &&
                          onSimilarClientSelect(similarClient)
                        }
                      >
                        {getPersonFullName(similarClient, 'Без имени')}
                      </button>
                      <span className="block text-xs text-amber-800">
                        Совпадение: {reasons || 'контакты'}
                      </span>
                      {clientDraft._id && onMergeSimilarClient ? (
                        <button
                          type="button"
                          className="mt-2 cursor-pointer rounded border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100"
                          onClick={() => onMergeSimilarClient(similarClient)}
                        >
                          Объединить
                        </button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
          <Input
            label="Имя"
            value={clientDraft.firstName}
            onChange={handleChange('firstName')}
            {...compactFieldProps}
          />
          <Input
            label="Фамилия"
            value={clientDraft.secondName}
            onChange={handleChange('secondName')}
            {...compactFieldProps}
          />
          <Input
            label="Отчество"
            value={clientDraft.thirdName}
            onChange={handleChange('thirdName')}
            {...compactFieldProps}
          />
          <PhoneInput
            value={clientDraft.phone}
            onChange={(value) =>
              setClientDraft((prev) => ({ ...prev, phone: value }))
            }
            {...compactPhoneProps}
          />
          <PhoneInput
            label="WhatsApp"
            value={clientDraft.whatsapp}
            onChange={(value) =>
              setClientDraft((prev) => ({ ...prev, whatsapp: value }))
            }
            {...compactPhoneProps}
          />
          <PhoneInput
            label="Viber"
            value={clientDraft.viber}
            onChange={(value) =>
              setClientDraft((prev) => ({ ...prev, viber: value }))
            }
            {...compactPhoneProps}
          />
          <Input
            label="Telegram"
            value={clientDraft.telegram}
            onChange={handleChange('telegram')}
            {...compactFieldProps}
          />
          <Input
            label="Instagram"
            value={clientDraft.instagram}
            onChange={handleChange('instagram')}
            {...compactFieldProps}
          />
          <Input
            label="VK"
            value={clientDraft.vk}
            onChange={handleChange('vk')}
            {...compactFieldProps}
          />
          <Select
            label="Предпочтительный канал связи"
            value={clientDraft.preferredContactChannel || ''}
            onChange={handleChange('preferredContactChannel')}
            options={preferredChannelOptions}
            {...compactFieldProps}
          />
          {clientDraft.preferredContactChannel === 'other' && (
            <Input
              label="Свой канал связи"
              value={clientDraft.preferredContactChannelOther || ''}
              onChange={handleChange('preferredContactChannelOther')}
              {...compactFieldProps}
            />
          )}
          <Input
            label="Email"
            value={clientDraft.email}
            onChange={handleChange('email')}
            {...compactFieldProps}
          />
          <PartyDictionaryPicker
            label="Откуда узнал о компании"
            value={clientDraft.leadSource || ''}
            onChange={(value) => handleChange('leadSource')(value || '')}
            items={companySettings?.leadSources || []}
            onCreateItem={handleLeadSourceCreate}
            allowCreate={Boolean(activeCompanyId)}
            placeholder="Выберите источник"
            createPrompt="Новый источник заявки"
            addTitle="Добавить источник заявки"
          />
          <CheckBox
            checked={Boolean(isLegalEntity)}
            onClick={() =>
              setClientDraft((prev) => ({
                ...prev,
                isLegalEntity: !isLegalEntity,
              }))
            }
            label="Юр. лицо"
            labelClassName="text-sm font-semibold text-slate-700"
            wrapperClassName="mt-1.5 pl-0"
            noMargin
            tone="party"
          />
          {isLegalEntity && (
            <div className="relative mt-2 rounded border border-sky-200 p-3 pt-4">
              <div className="absolute -top-2 left-3 bg-white px-1 text-xs font-semibold tracking-wide uppercase text-slate-500">
                Реквизиты
              </div>
              <div className="flex flex-col gap-2.5">
                <Input
                  label="Юр. название"
                  value={clientDraft.legalName || ''}
                  onChange={handleChange('legalName')}
                  {...compactFieldProps}
                />
                <PartyAddressBlock
                  value={{
                    street: clientDraft.legalAddress || '',
                  }}
                  onChange={(field, nextValue) => {
                    if (field === 'street') handleChange('legalAddress')(nextValue)
                  }}
                  title=""
                  tone="party"
                  styleVariant="plain"
                  labels={{ street: 'Юр. адрес' }}
                  visibleFields={{
                    town: false,
                    street: true,
                    house: false,
                    room: false,
                    comment: false,
                  }}
                  noMargin
                />
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <Input
                    label="ИНН"
                    value={clientDraft.inn || ''}
                    onChange={handleChange('inn')}
                    {...compactFieldProps}
                  />
                  <Input
                    label="КПП"
                    value={clientDraft.kpp || ''}
                    onChange={handleChange('kpp')}
                    {...compactFieldProps}
                  />
                  <Input
                    label="ОГРН"
                    value={clientDraft.ogrn || ''}
                    onChange={handleChange('ogrn')}
                    {...compactFieldProps}
                  />
                </div>
                <Input
                  label="Банк"
                  value={clientDraft.bankName || ''}
                  onChange={handleChange('bankName')}
                  {...compactFieldProps}
                />
                <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                  <Input
                    label="БИК"
                    value={clientDraft.bik || ''}
                    onChange={handleChange('bik')}
                    {...compactFieldProps}
                  />
                  <Input
                    label="Р/с"
                    value={clientDraft.checkingAccount || ''}
                    onChange={handleChange('checkingAccount')}
                    {...compactFieldProps}
                  />
                  <Input
                    label="К/с"
                    value={clientDraft.correspondentAccount || ''}
                    onChange={handleChange('correspondentAccount')}
                    {...compactFieldProps}
                  />
                </div>
              </div>
            </div>
          )}
          <Textarea
            label="Комментарий"
            value={clientDraft.comment}
            onChange={handleChange('comment')}
            {...compactFieldProps}
            rows={3}
          />
          <div className="grid gap-3 rounded border border-sky-100 bg-sky-50/50 p-3">
            <div className="text-xs font-semibold tracking-wide uppercase text-slate-500">
              Значимые даты
            </div>
            {(clientDraft.significantDates || []).map((item, index) => (
              <div
                key={`significant-date-${index}`}
                className="grid gap-2 rounded border border-gray-200 bg-white p-3"
              >
                <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
                  <Input
                    label="Название"
                    value={item.title || ''}
                    onChange={(value) =>
                      updateSignificantDate(index, {
                        title: value.slice(0, 100),
                      })
                    }
                    fullWidth
                    tone="party"
                  />
                  <DateInput
                    label="Дата"
                    value={item.date || null}
                    onChange={(value) =>
                      updateSignificantDate(index, { date: value })
                    }
                    tone="party"
                    className="w-full md:w-48"
                  />
                </div>
                <Textarea
                  label="Комментарий"
                  value={item.comment || ''}
                  onChange={(value) =>
                    updateSignificantDate(index, {
                      comment: value.slice(0, 500),
                    })
                  }
                  fullWidth
                  tone="party"
                  rows={2}
                />
                <button
                  type="button"
                  className="w-fit cursor-pointer rounded border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                  onClick={() => removeSignificantDate(index)}
                >
                  Удалить дату
                </button>
              </div>
            ))}
            <button
              type="button"
              className="w-fit cursor-pointer rounded border border-sky-300 bg-white px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
              onClick={addSignificantDate}
            >
              Добавить дату
            </button>
          </div>
        </form>

        {clientDraft._id && activeCompanyId ? (
          <div className="grid gap-4 border-t border-gray-200 pt-4">
            <div className="text-xs font-semibold tracking-wide uppercase text-slate-500">
              Переписки
            </div>
            <PartyVkConversationsPanel
              clientId={clientDraft._id || ''}
              companyId={activeCompanyId}
              canReply={canManage}
            />
            <PartyAvitoConversationsPanel
              clientId={clientDraft._id || ''}
              companyId={activeCompanyId}
              canReply={canManage}
            />
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
