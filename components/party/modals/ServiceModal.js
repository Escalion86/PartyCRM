'use client'

import { useState, useCallback, useMemo } from 'react'
import Modal from '@components/Modal'
import Input from '@components/Input'
import Select from '@components/Select'
import InputWrapper from '@components/InputWrapper'
import AddIconButton from '@components/AddIconButton'
import { useAtomValue, useSetAtom } from 'jotai'
import serviceGroupsAtom from '@state/atoms/serviceGroupsAtom'
import { apiJson } from '@helpers/apiClient'
import useUnsavedChanges from '@helpers/useUnsavedChanges'

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
  activeCompanyId,
}) {
  const serviceGroups = useAtomValue(serviceGroupsAtom)
  const setServiceGroups = useSetAtom(serviceGroupsAtom)
  const [groupModalOpen, setGroupModalOpen] = useState(false)
  const [groupDraft, setGroupDraft] = useState({ title: '', order: 0 })
  const [groupSaving, setGroupSaving] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const hasUnsavedChanges = useUnsavedChanges(serviceDraft, open)
  const hasUnsavedGroupChanges = useUnsavedChanges(groupDraft, groupModalOpen)

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

  const handleChange = (field) => (val) => {
    setServiceDraft((prev) => ({ ...prev, [field]: val }))
  }

  const groupOptions = [
    { value: '', label: 'Без группы' },
    ...serviceGroups
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((g) => ({ value: g._id, label: g.title })),
  ]

  const handleGroupCreate = useCallback(async () => {
    setGroupSaving(true)
    try {
      const response = await apiJson('/api/party/service-groups', {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({ title: groupDraft.title }),
      })
      if (response.data) {
        setServiceGroups((prev) => [...prev, response.data])
        setServiceDraft((prev) => ({ ...prev, groupId: response.data._id }))
      }
      setGroupModalOpen(false)
      setGroupDraft({ title: '' })
    } catch (err) {
      console.error('Ошибка создания группы:', err)
      alert(err.message || 'Не удалось создать группу')
    } finally {
      setGroupSaving(false)
    }
  }, [groupDraft.title, requestHeaders, setServiceGroups, setServiceDraft])

  const handleSubmit = () => {
    setSubmitError('')
    if (!serviceDraft.title?.trim()) {
      setSubmitError('Укажите название услуги')
      return
    }
    onSubmit()
  }

  const footerContent = ({ requestClose }) => (
    <div className="flex flex-col w-full gap-1">
      {submitError && (
        <div className="px-3 py-2 text-sm text-red-600 rounded bg-red-50">
          {submitError}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          className="px-4 py-2 text-sm font-semibold text-gray-700 transition border border-gray-300 rounded cursor-pointer hover:bg-gray-50"
          onClick={requestClose}
        >
          Отмена
        </button>
        <button
          type="button"
          className="px-4 py-2 text-sm font-semibold text-white transition rounded cursor-pointer bg-sky-600 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={saving}
          onClick={handleSubmit}
        >
          {saving ? 'Сохранение...' : 'Сохранить'}
        </button>
      </div>
    </div>
  )

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        hasUnsavedChanges={hasUnsavedChanges}
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
          <InputWrapper label="Группа" tone="party">
            <div className="relative flex items-center flex-1">
              <select
                className="w-full px-1 text-black bg-transparent outline-none appearance-none cursor-pointer peer"
                value={serviceDraft.groupId || ''}
                onChange={(e) => handleChange('groupId')(e.target.value)}
              >
                {groupOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
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
                  setGroupDraft({ title: '', order: 0 })
                  setGroupModalOpen(true)
                }}
                title="Создать группу"
                size="xs"
                tone="party"
                className="shrink-0"
              />
            </div>
          </InputWrapper>
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

      {/* Group creation modal */}
      <Modal
        open={groupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        hasUnsavedChanges={hasUnsavedGroupChanges}
        title="Новая группа услуг"
        tone="party"
        size="sm"
        footer={({ requestClose }) => (
          <div className="flex gap-2">
            <button
              type="button"
              className="px-4 py-2 text-sm font-semibold text-gray-700 transition border border-gray-300 rounded cursor-pointer hover:bg-gray-50"
              onClick={requestClose}
            >
              Отмена
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm font-semibold text-white transition rounded cursor-pointer bg-sky-600 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={groupSaving || !groupDraft.title.trim()}
              onClick={handleGroupCreate}
            >
              {groupSaving ? 'Сохранение...' : 'Создать'}
            </button>
          </div>
        )}
      >
        <div className="flex flex-col gap-2">
          <Input
            label="Название группы"
            value={groupDraft.title}
            onChange={(val) =>
              setGroupDraft((prev) => ({ ...prev, title: val }))
            }
            placeholder="Название группы"
            fullWidth
            tone="party"
            required
          />
        </div>
      </Modal>
    </>
  )
}

export default ServiceCreateModal
