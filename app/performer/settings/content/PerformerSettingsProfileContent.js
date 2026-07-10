'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const primaryButtonClass =
  'px-4 py-2 text-sm font-semibold text-white transition-colors rounded-md cursor-pointer bg-sky-600 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60'

const inputClass =
  'h-10 rounded-md border border-sky-100 bg-white px-3 text-sm outline-none focus:border-sky-500'

const emptyProfile = {
  user: {
    firstName: '',
    secondName: '',
    phone: '',
    email: '',
  },
}

export default function PerformerSettingsProfileContent() {
  const [profile, setProfile] = useState(emptyProfile)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadProfile = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await apiJson('/api/party/performer/profile', {
        cache: 'no-store',
      })
      setProfile({ user: response.data?.user || emptyProfile.user })
    } catch (loadError) {
      setError(loadError.message || 'Не удалось загрузить профиль')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const updateUser = (field, value) => {
    setProfile((prev) => ({
      ...prev,
      user: {
        ...prev.user,
        [field]: value,
      },
    }))
  }

  const saveProfile = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await apiJson('/api/party/performer/profile', {
        method: 'PATCH',
        body: JSON.stringify({ user: profile.user }),
      })
      setProfile({ user: response.data?.user || emptyProfile.user })
      setMessage('Профиль сохранён')
      window.dispatchEvent(new Event('partycrm:profile-updated'))
    } catch (saveError) {
      setError(saveError.message || 'Не удалось сохранить профиль')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-6 text-sm text-slate-500">
        Загружаем профиль...
      </div>
    )
  }

  return (
    <form onSubmit={saveProfile} className="grid gap-5">
      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <div className="rounded-lg border border-sky-100 bg-white p-5 shadow-sm shadow-sky-950/5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-black/65">Имя</span>
            <input
              value={profile.user.firstName}
              onChange={(event) => updateUser('firstName', event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-black/65">Фамилия</span>
            <input
              value={profile.user.secondName}
              onChange={(event) => updateUser('secondName', event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-black/65">Телефон аккаунта</span>
            <input
              value={profile.user.phone}
              className={`${inputClass} text-black/55`}
              disabled
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-medium text-black/65">Email</span>
            <input
              type="email"
              value={profile.user.email}
              onChange={(event) => updateUser('email', event.target.value)}
              className={inputClass}
            />
          </label>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={saving} className={primaryButtonClass}>
          {saving ? 'Сохраняем...' : 'Сохранить профиль'}
        </button>
      </div>
    </form>
  )
}
