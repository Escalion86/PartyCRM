'use client'

import Input from '@components/Input'
import useCompanySettings from '../useCompanySettings'

const TIME_ZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/Moscow', label: 'UTC+03 Москва' },
  { value: 'Asia/Krasnoyarsk', label: 'UTC+07 Красноярск' },
  { value: 'Asia/Irkutsk', label: 'UTC+08 Иркутск' },
]

export default function CompanySettingsGeneralContent({ activeCompanyId }) {
  const { settings, loading, saving, error, savePatch } =
    useCompanySettings(activeCompanyId)

  if (loading) {
    return (
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-6 text-sm text-slate-500">
        Загружаем настройки компании...
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <div className="border-danger/30 bg-danger/10 text-danger rounded-md border p-3 text-sm">
          {error}
        </div>
      ) : null}

      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <label className="grid gap-2">
          <span className="text-sm font-semibold">Часовой пояс компании</span>
          <select
            value={settings?.timeZone ?? 'Asia/Krasnoyarsk'}
            onChange={(event) => savePatch({ timeZone: event.target.value })}
            className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
          >
            {TIME_ZONE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <Input
          label="Стандартная длительность заказа, мин"
          type="number"
          min={15}
          step={5}
          value={settings?.defaultOrderDurationMinutes ?? 60}
          onChange={(val) =>
            savePatch({
              defaultOrderDurationMinutes: Number(val) || 60,
            })
          }
          tone="party"
          showArrows
          noMargin
        />
        <p className="mt-2 text-xs text-slate-500">
          Используется как значение по умолчанию при создании нового заказа.
        </p>
        {saving ? (
          <p className="mt-2 text-xs text-slate-500">Сохраняем...</p>
        ) : null}
      </div>
    </div>
  )
}
