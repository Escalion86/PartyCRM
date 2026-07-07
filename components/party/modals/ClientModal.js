'use client'

import { useState } from 'react'
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons/faMagnifyingGlass'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import getPersonFullName from '@helpers/getPersonFullName'
import DateInput from '@components/DateInput'
import PhoneInput from '@components/PhoneInput'
import Input from '@components/Input'
import Select from '@components/Select'
import Textarea from '@components/Textarea'
import Modal from '@components/Modal'
import PartyAddressBlock from '@components/party/inputs/PartyAddressBlock'
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
    { value: 'vk', label: 'VK' },
    { value: 'other', label: 'Другое' },
  ]

  const handleChange = (field) => (value) => {
    setClientDraft((prev) => ({ ...prev, [field]: value }))
  }

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

  const getNormalizedDraft = () => ({
    ...clientDraft,
    significantDates: normalizeSignificantDates(clientDraft.significantDates),
  })

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
      <div className="flex flex-col gap-4">
        <form
          id="client-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-2"
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
            fullWidth
            tone="party"
          />
          <Input
            label="Фамилия"
            value={clientDraft.secondName}
            onChange={handleChange('secondName')}
            fullWidth
            tone="party"
          />
          <Input
            label="Отчество"
            value={clientDraft.thirdName}
            onChange={handleChange('thirdName')}
            fullWidth
            tone="party"
          />
          <PhoneInput
            value={clientDraft.phone}
            onChange={(value) =>
              setClientDraft((prev) => ({ ...prev, phone: value }))
            }
            tone="party"
          />
          <PhoneInput
            label="WhatsApp"
            value={clientDraft.whatsapp}
            onChange={(value) =>
              setClientDraft((prev) => ({ ...prev, whatsapp: value }))
            }
            tone="party"
          />
          <PhoneInput
            label="Viber"
            value={clientDraft.viber}
            onChange={(value) =>
              setClientDraft((prev) => ({ ...prev, viber: value }))
            }
            tone="party"
          />
          <Input
            label="Telegram"
            value={clientDraft.telegram}
            onChange={handleChange('telegram')}
            fullWidth
            tone="party"
          />
          <Input
            label="Instagram"
            value={clientDraft.instagram}
            onChange={handleChange('instagram')}
            fullWidth
            tone="party"
          />
          <Input
            label="VK"
            value={clientDraft.vk}
            onChange={handleChange('vk')}
            fullWidth
            tone="party"
          />
          <Select
            label="Предпочтительный канал связи"
            value={clientDraft.preferredContactChannel || ''}
            onChange={handleChange('preferredContactChannel')}
            options={preferredChannelOptions}
            fullWidth
            tone="party"
          />
          {clientDraft.preferredContactChannel === 'other' && (
            <Input
              label="Свой канал связи"
              value={clientDraft.preferredContactChannelOther || ''}
              onChange={handleChange('preferredContactChannelOther')}
              fullWidth
              tone="party"
            />
          )}
          <Input
            label="Email"
            value={clientDraft.email}
            onChange={handleChange('email')}
            fullWidth
            tone="party"
          />
          <PartyAddressBlock
            value={{
              town: clientDraft.town || '',
              street: clientDraft.legalAddress || '',
            }}
            onChange={(field, nextValue) => {
              if (field === 'town') handleChange('town')(nextValue)
              if (field === 'street') handleChange('legalAddress')(nextValue)
            }}
            title="Адрес"
            tone="party"
            styleVariant="plain"
            labels={{ street: 'Юридический адрес' }}
            visibleFields={{
              town: true,
              street: true,
              house: false,
              room: false,
              comment: false,
            }}
          />
          <Input
            label="Юр. название"
            value={clientDraft.legalName || ''}
            onChange={handleChange('legalName')}
            fullWidth
            tone="party"
          />
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Input
              label="ИНН"
              value={clientDraft.inn || ''}
              onChange={handleChange('inn')}
              fullWidth
              tone="party"
            />
            <Input
              label="КПП"
              value={clientDraft.kpp || ''}
              onChange={handleChange('kpp')}
              fullWidth
              tone="party"
            />
            <Input
              label="ОГРН"
              value={clientDraft.ogrn || ''}
              onChange={handleChange('ogrn')}
              fullWidth
              tone="party"
            />
          </div>
          <Input
            label="Банк"
            value={clientDraft.bankName || ''}
            onChange={handleChange('bankName')}
            fullWidth
            tone="party"
          />
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <Input
              label="БИК"
              value={clientDraft.bik || ''}
              onChange={handleChange('bik')}
              fullWidth
              tone="party"
            />
            <Input
              label="Р/с"
              value={clientDraft.checkingAccount || ''}
              onChange={handleChange('checkingAccount')}
              fullWidth
              tone="party"
            />
            <Input
              label="К/с"
              value={clientDraft.correspondentAccount || ''}
              onChange={handleChange('correspondentAccount')}
              fullWidth
              tone="party"
            />
          </div>
          <Textarea
            label="Комментарий"
            value={clientDraft.comment}
            onChange={handleChange('comment')}
            fullWidth
            tone="party"
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
