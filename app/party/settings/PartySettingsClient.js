'use client'

import { apiJson } from '@helpers/apiClient'
import { useCallback, useEffect, useMemo, useState } from 'react'

const options = [
  {
    value: 'company',
    label: 'Сотрудник компании',
    description: 'Показывать кабинет компании и управление организацией.',
    roles: ['company'],
  },
  {
    value: 'performer',
    label: 'Исполнитель',
    description: 'Показывать кабинет исполнителя с назначенными заказами.',
    roles: ['performer'],
  },
  {
    value: 'both',
    label: 'Сотрудник и исполнитель',
    description: 'Показывать оба кабинета и переключение между ними.',
    roles: ['company', 'performer'],
  },
]

const getModeFromRoles = (roles = []) => {
  const hasCompany = roles.includes('company')
  const hasPerformer = roles.includes('performer')
  if (hasCompany && hasPerformer) return 'both'
  if (hasPerformer) return 'performer'
  return 'company'
}

export default function PartySettingsClient() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mode, setMode] = useState('both')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const selectedRoles = useMemo(
    () =>
      options.find((option) => option.value === mode)?.roles || [
        'company',
        'performer',
      ],
    [mode]
  )

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiJson('/api/party/auth/me', {
        cache: 'no-store',
      })
      setMode(getModeFromRoles(response.data?.user?.interfaceRoles))
    } catch (loadError) {
      setError(loadError.message || 'Не удалось загрузить настройки')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const save = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await apiJson('/api/party/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ interfaceRoles: selectedRoles }),
      })
      window.dispatchEvent(new Event('partycrm:profile-updated'))
      setMessage('Настройки сохранены')
    } catch (saveError) {
      setError(saveError.message || 'Не удалось сохранить настройки')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <section className="min-h-full bg-white px-5 py-8">
        <div className="mx-auto max-w-3xl text-sm text-black/60">
          Загружаем настройки...
        </div>
      </section>
    )
  }

  return (
    <section
      className="bg-white px-5 py-8"
      style={{ minHeight: 'calc(100dvh - 4rem)' }}
    >
      <div className="mx-auto max-w-3xl">
        <div className="flex flex-col gap-1">
          <p className="text-sm font-semibold uppercase text-sky-700">
            Настройки
          </p>
          <h2 className="text-xl font-semibold">Профиль PartyCRM</h2>
        </div>

        {error && (
          <div className="mt-5 rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
            {error}
          </div>
        )}
        {message && (
          <div className="mt-5 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {message}
          </div>
        )}

        <div className="mt-6 grid gap-3">
          {options.map((option) => (
            <label
              key={option.value}
              className={`grid cursor-pointer gap-1 rounded-lg border p-4 transition-colors ${
                mode === option.value
                  ? 'border-sky-600 bg-sky-50'
                  : 'border-sky-100 bg-white hover:bg-sky-50'
              }`}
            >
              <span className="flex items-center gap-2 font-semibold">
                <input
                  type="radio"
                  name="party-settings-interface-role"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={() => {
                    setMode(option.value)
                    setMessage('')
                  }}
                />
                {option.label}
              </span>
              <span className="pl-6 text-sm leading-6 text-slate-500">
                {option.description}
              </span>
            </label>
          ))}
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mt-6 cursor-pointer rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? 'Сохраняем...' : 'Сохранить'}
        </button>
      </div>
    </section>
  )
}
