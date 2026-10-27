'use client'

import { useId, useMemo } from 'react'
import Modal from '@components/Modal'
import Input from '@components/Input'
import TownPicker from '@components/TownPicker'
import Textarea from '@components/Textarea'
import { apiJson } from '@helpers/apiClient'
import {
  normalizeAddressPoolString,
  normalizeTownList,
} from '@helpers/addressPool'
import useUnsavedChanges from '@helpers/useUnsavedChanges'
import FieldHelp from '@components/FieldHelp'

export default function LocationModal({
  open,
  title = 'Новая точка',
  locationDraft,
  setLocationDraft,
  saving,
  onClose,
  onSubmit,
  isEdit = false,
  companySettings,
  activeCompanyId,
  onCompanySettingsChange,
}) {
  const hasUnsavedChanges = useUnsavedChanges(locationDraft, open)
  const venueFieldsId = useId()
  const handleChange = (field) => (value) => {
    if (field.includes('.')) {
      const [parent, child] = field.split('.')
      setLocationDraft((prev) => ({
        ...prev,
        [parent]: { ...prev[parent], [child]: value },
      }))
    } else {
      setLocationDraft((prev) => ({ ...prev, [field]: value }))
    }
  }

  const townOptions = useMemo(
    () => (Array.isArray(companySettings?.towns) ? companySettings.towns : []),
    [companySettings?.towns]
  )

  const handleCreateTown = async (townName) => {
    const normalizedTown = normalizeAddressPoolString(townName)
    if (!normalizedTown) return

    const nextTowns = normalizeTownList([...townOptions, normalizedTown])

    try {
      const response = await apiJson('/api/party/company-settings', {
        method: 'PATCH',
        headers: activeCompanyId
          ? { 'x-partycrm-company-id': activeCompanyId }
          : undefined,
        body: JSON.stringify({ towns: nextTowns }),
      })
      onCompanySettingsChange?.(response.data ?? {})
    } catch {
      // ignore
    }
  }

  const footerContent = ({ requestClose }) => (
    <div className="flex gap-2">
      {isEdit && (
        <button
          type="button"
          className="cursor-pointer rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
          onClick={requestClose}
        >
          Отмена
        </button>
      )}
      <button
        type="button"
        className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={onSubmit}
        disabled={saving}
      >
        {saving ? 'Сохранение...' : isEdit ? 'Сохранить' : 'Добавить точку'}
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
        <Input
          label="Название"
          value={locationDraft.title}
          onChange={handleChange('title')}
          placeholder="Зал на Мира"
          fullWidth
          tone="party"
        />

        <TownPicker
          value={locationDraft.address?.town || ''}
          onChange={(town) => handleChange('address.town')(town ?? '')}
          townOptions={townOptions}
          onCreateTown={handleCreateTown}
          tone="party"
          noMargin
        />

        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            label="Улица"
            value={locationDraft.address?.street || ''}
            onChange={handleChange('address.street')}
            fullWidth
            tone="party"
          />
          <Input
            label="Дом"
            value={locationDraft.address?.house || ''}
            onChange={handleChange('address.house')}
            fullWidth
            tone="party"
          />
        </div>

        <Input
          label="Зал/комната"
          value={locationDraft.address?.room || ''}
          onChange={handleChange('address.room')}
          fullWidth
          tone="party"
        />

        <Textarea
          label="Комментарий"
          value={locationDraft.address?.comment || ''}
          onChange={handleChange('address.comment')}
          fullWidth
          tone="party"
          rows={2}
          placeholder="Например: вход со двора, домофон 12, парковка у шлагбаума"
        />
        <fieldset
          className="mt-3 space-y-3 rounded-xl border border-sky-100 p-3"
          disabled={saving}
        >
          <legend className="px-1 text-sm font-semibold text-slate-800">
            Занятость площадки
          </legend>
          <label className="block text-sm text-slate-700">
            Режим использования
            <select
              className="mt-1 min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2"
              value={locationDraft.usageMode || 'exclusive'}
              onChange={(event) =>
                handleChange('usageMode')(event.target.value)
              }
            >
              <option value="exclusive">Одно мероприятие одновременно</option>
              <option value="shared">Совместные билетные сеансы</option>
            </select>
          </label>
          <p className="text-xs text-slate-500">
            Частный заказ занимает площадку целиком. Для совместных сеансов
            суммарная вместимость не может превышать вместимость площадки.
          </p>
          <div>
            <div className="flex items-center gap-1 text-sm text-slate-700">
              <label htmlFor={`${venueFieldsId}-capacity`}>
                Вместимость площадки
              </label>
              <FieldHelp
                label="Вместимость площадки"
                text="Если вместимость не указана, нельзя планировать одновременные билетные сеансы. Для совместных сеансов укажите общую вместимость площадки."
              />
            </div>
            <input
              id={`${venueFieldsId}-capacity`}
              className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2"
              type="number"
              min={0}
              step={1}
              value={locationDraft.capacity ?? ''}
              onChange={(event) => handleChange('capacity')(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-700">
              Подготовка до начала, минут
              <input
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2"
                type="number"
                min={0}
                max={1440}
                step={1}
                value={locationDraft.preparationMinutes ?? 0}
                onChange={(event) =>
                  handleChange('preparationMinutes')(event.target.value)
                }
              />
            </label>
            <label className="block text-sm text-slate-700">
              Уборка после окончания, минут
              <input
                className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3 py-2"
                type="number"
                min={0}
                max={1440}
                step={1}
                value={locationDraft.cleanupMinutes ?? 0}
                onChange={(event) =>
                  handleChange('cleanupMinutes')(event.target.value)
                }
              />
            </label>
          </div>
          <p className="text-xs text-slate-500">
            Время подготовки и уборки также учитывается при проверке
            пересечений.
          </p>
        </fieldset>
      </div>
    </Modal>
  )
}
