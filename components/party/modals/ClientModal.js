'use client'

import { useState } from 'react'
import { faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons/faMagnifyingGlass'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import getPersonFullName from '@helpers/getPersonFullName'
import PhoneInput from '@components/PhoneInput'
import Input from '@components/Input'
import Select from '@components/Select'
import Textarea from '@components/Textarea'
import Modal from '@components/Modal'
import PartyAddressBlock from '@components/party/inputs/PartyAddressBlock'
import PartyAvitoConversationsPanel from '@components/party/integrations/PartyAvitoConversationsPanel'
import PartyVkConversationsPanel from '@components/party/integrations/PartyVkConversationsPanel'

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

  const handleSubmit = (e) => {
    e.preventDefault()
    onSubmit()
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
        onClick={onSubmit}
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
