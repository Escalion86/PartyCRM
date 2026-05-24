'use client'

import { useState } from 'react'
import Modal from '@components/Modal'
import Input from '@components/Input'
import Select from '@components/Select'

const specializationOptions = [
  { value: 'animator', label: 'Аниматор' },
  { value: 'magician', label: 'Фокусник' },
  { value: 'host', label: 'Ведущий' },
  { value: 'photographer', label: 'Фотограф' },
  { value: 'workshop', label: 'Мастер-класс' },
  { value: 'other', label: 'Другое' },
]

export function ServiceCreateModal({
  open,
  title = 'Новая услуга',
  serviceDraft,
  setServiceDraft,
  onClose,
  onSubmit,
  saving,
}) {
  const handleChange = (field) => (val) => {
    setServiceDraft((prev) => ({ ...prev, [field]: val }))
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
      <div className="flex flex-col gap-2">
        <Input
          label="Название услуги"
          value={serviceDraft.title || ''}
          onChange={handleChange('title')}
          placeholder="Название услуги"
          fullWidth
          tone="party"
          required
        />
        <Select
          label="Специализация"
          value={serviceDraft.specialization || 'other'}
          onChange={handleChange('specialization')}
          options={specializationOptions}
          fullWidth
          tone="party"
        />
        <Input
          label="Длительность, мин"
          type="number"
          value={serviceDraft.duration || ''}
          onChange={handleChange('duration')}
          step={5}
          fullWidth
          tone="party"
        />
        <Input
          label="Цена, ₽"
          type="number"
          value={serviceDraft.price || ''}
          onChange={handleChange('price')}
          step={1000}
          fullWidth
          tone="party"
        />
      </div>
    </Modal>
  )
}

export default ServiceCreateModal
