'use client'

import PhoneInput from '@components/PhoneInput'
import Input from '@components/Input'
import Select from '@components/Select'
import Modal from '@components/Modal'
import useUnsavedChanges from '@helpers/useUnsavedChanges'

const ALL_ROLE_OPTIONS = [
  { value: 'performer', label: 'Исполнитель' },
  { value: 'admin', label: 'Администратор' },
  { value: 'owner', label: 'Владелец' },
]

const getRoleOptions = (contextRole, staffDraft) => {
  // Только владелец может назначать владельца
  if (contextRole !== 'owner') {
    return ALL_ROLE_OPTIONS.filter((opt) => opt.value !== 'owner')
  }
  // Владельцем нельзя назначить подрядчика без привязанного аккаунта
  if (!staffDraft?.authUserId) {
    return ALL_ROLE_OPTIONS.filter((opt) => opt.value !== 'owner')
  }
  return ALL_ROLE_OPTIONS
}

const specializationOptions = [
  { value: 'animator', label: 'Аниматор' },
  { value: 'magician', label: 'Фокусник' },
  { value: 'host', label: 'Ведущий' },
  { value: 'photographer', label: 'Фотограф' },
  { value: 'workshop', label: 'Мастер-класс' },
  { value: 'other', label: 'Другое' },
]

export default function StaffModal({
  open,
  title = 'Новый сотрудник',
  staffDraft,
  setStaffDraft,
  saving,
  onClose,
  onSubmit,
  isEdit,
  contextRole = '',
}) {
  const hasUnsavedChanges = useUnsavedChanges(staffDraft, open)
  const handleChange = (field) => (value) => {
    setStaffDraft((prev) => ({ ...prev, [field]: value }))
  }

  const footerContent = ({ requestClose }) => (
    <div className="flex gap-2">
      <button
        type="button"
        className="cursor-pointer rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
        onClick={requestClose}
      >
        Отмена
      </button>
      <button
        type="button"
        className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onSubmit}
        disabled={saving}
      >
        {saving
          ? 'Сохранение...'
          : isEdit
            ? 'Сохранить'
            : 'Добавить сотрудника'}
      </button>
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      hasUnsavedChanges={hasUnsavedChanges}
      title={title}
      tone="party"
      size="full"
      footer={footerContent}
    >
      <div className="flex flex-col gap-2 pt-1">
        <p className="text-sm text-gray-500">
          Карточка без привязанного аккаунта считается подрядчиком. Для такой
          карточки нужны имя и телефон; пригласить в систему можно будет
          следующим шагом.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            label="Имя"
            value={staffDraft.firstName}
            onChange={handleChange('firstName')}
            fullWidth
            tone="party"
          />
          <Input
            label="Фамилия"
            value={staffDraft.secondName}
            onChange={handleChange('secondName')}
            fullWidth
            tone="party"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <PhoneInput
            value={staffDraft.phone}
            onChange={(value) =>
              setStaffDraft((prev) => ({ ...prev, phone: value }))
            }
            tone="party"
          />
          <Input
            label="Email"
            value={staffDraft.email}
            onChange={handleChange('email')}
            fullWidth
            type="email"
            tone="party"
          />
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select
            label="Роль"
            value={staffDraft.role}
            onChange={(value) =>
              setStaffDraft((prev) => ({ ...prev, role: value }))
            }
            options={getRoleOptions(contextRole, staffDraft)}
            fullWidth
            tone="party"
          />
          <Select
            label="Специализация"
            value={staffDraft.specialization}
            onChange={(value) =>
              setStaffDraft((prev) => ({ ...prev, specialization: value }))
            }
            options={specializationOptions}
            fullWidth
            tone="party"
          />
        </div>
        <Input
          label="Описание"
          value={staffDraft.description}
          onChange={handleChange('description')}
          fullWidth
          multiline
          rows={3}
          placeholder="Например, работает с детьми 4-8 лет, ведет бумажное шоу и квесты"
          tone="party"
        />
      </div>
    </Modal>
  )
}
