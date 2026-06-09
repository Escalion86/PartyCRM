'use client'

import Input from '@components/Input'
import { useMemo, useState } from 'react'
import useCompanySettings from '../useCompanySettings'

const TIME_ZONE_OPTIONS = [
  { value: 'UTC', label: 'UTC' },
  { value: 'Europe/Moscow', label: 'UTC+03 Москва' },
  { value: 'Asia/Krasnoyarsk', label: 'UTC+07 Красноярск' },
  { value: 'Asia/Irkutsk', label: 'UTC+08 Иркутск' },
]

const DEFAULT_ORDER_NUMBER_FORMAT = 'P-{YYYY}-{SEQ}'

function CompanyProfileForm({ company, saving, savePatch }) {
  const [profileForm, setProfileForm] = useState({
    title: company?.title ?? '',
    legalTitle: company?.legalTitle ?? '',
    phone: company?.phone ?? '',
    email: company?.email ?? '',
  })
  const profileChanged = useMemo(
    () =>
      ['title', 'legalTitle', 'phone', 'email'].some(
        (key) => (profileForm[key] ?? '') !== (company?.[key] ?? '')
      ),
    [company, profileForm]
  )

  const saveProfile = async () => {
    await savePatch({ company: profileForm })
  }

  return (
    <div className="rounded-2xl border border-sky-100 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-950">
          Профиль компании
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Эти данные используются в кабинете, документах и платежных сценариях.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <Input
          label="Название в кабинете"
          value={profileForm.title}
          onChange={(value) =>
            setProfileForm((current) => ({ ...current, title: value }))
          }
          tone="party"
          noMargin
          fullWidth
        />
        <Input
          label="Юридическое название"
          value={profileForm.legalTitle}
          onChange={(value) =>
            setProfileForm((current) => ({ ...current, legalTitle: value }))
          }
          tone="party"
          noMargin
          fullWidth
        />
        <Input
          label="Телефон компании"
          value={profileForm.phone}
          onChange={(value) =>
            setProfileForm((current) => ({ ...current, phone: value }))
          }
          tone="party"
          noMargin
          fullWidth
        />
        <Input
          label="Email компании"
          type="email"
          value={profileForm.email}
          onChange={(value) =>
            setProfileForm((current) => ({ ...current, email: value }))
          }
          tone="party"
          noMargin
          fullWidth
        />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={saveProfile}
          disabled={!profileChanged || saving}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          Сохранить профиль
        </button>
        {profileChanged ? (
          <span className="text-xs text-slate-500">
            Есть несохраненные изменения
          </span>
        ) : null}
      </div>
    </div>
  )
}

function OrderNumberFormatField({ value, saving, savePatch }) {
  const [orderNumberFormat, setOrderNumberFormat] = useState(
    value || DEFAULT_ORDER_NUMBER_FORMAT
  )
  const orderNumberFormatChanged =
    orderNumberFormat !== (value || DEFAULT_ORDER_NUMBER_FORMAT)

  const saveOrderNumberFormat = async () => {
    await savePatch({ orderNumberFormat })
  }

  return (
    <div className="rounded-2xl border border-sky-100 bg-white p-5">
      <Input
        label="Формат номера заказа"
        value={orderNumberFormat}
        onChange={setOrderNumberFormat}
        tone="party"
        noMargin
        fullWidth
      />
      <p className="mt-2 text-xs text-slate-500">
        Доступные переменные: {'{YYYY}'}, {'{YY}'}, {'{MM}'}, {'{DD}'},{' '}
        {'{SEQ}'}.
      </p>
      <button
        type="button"
        onClick={saveOrderNumberFormat}
        disabled={!orderNumberFormatChanged || saving}
        className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        Сохранить формат
      </button>
    </div>
  )
}

export default function CompanySettingsGeneralContent({ activeCompanyId }) {
  const { company, settings, loading, saving, error, savePatch } =
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

      <CompanyProfileForm
        key={[
          company?.title,
          company?.legalTitle,
          company?.phone,
          company?.email,
        ].join('|')}
        company={company}
        saving={saving}
        savePatch={savePatch}
      />

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
        <label className="grid gap-2">
          <span className="text-sm font-semibold">Город по умолчанию</span>
          <select
            value={settings?.defaultTown ?? ''}
            onChange={(event) => savePatch({ defaultTown: event.target.value })}
            className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
          >
            <option value="">Не выбран</option>
            {(settings?.towns ?? []).map((town) => (
              <option key={town} value={town}>
                {town}
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

      <OrderNumberFormatField
        key={settings?.orderNumberFormat ?? DEFAULT_ORDER_NUMBER_FORMAT}
        value={settings?.orderNumberFormat}
        saving={saving}
        savePatch={savePatch}
      />
    </div>
  )
}
