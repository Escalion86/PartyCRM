'use client'

import { useCallback, useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { specializationOptions } from '@helpers/partyHelpers'

const primaryButtonClass =
  'px-4 py-2 text-sm font-semibold text-white transition-colors rounded-md cursor-pointer bg-sky-600 hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60'

const inputClass =
  'h-10 rounded-md border border-sky-100 bg-white px-3 text-sm outline-none focus:border-sky-500'

const textareaClass =
  'min-h-24 resize-y rounded-md border border-sky-100 bg-white px-3 py-2 text-sm outline-none focus:border-sky-500'

const emptyProfile = {
  user: {
    firstName: '',
    secondName: '',
    phone: '',
    email: '',
  },
  staff: [],
}

export default function PerformerSettingsClient() {
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
      setProfile(response.data || emptyProfile)
    } catch (loadError) {
      setError(loadError.message || 'Не удалось загрузить настройки кабинета')
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

  const updateStaff = (staffId, field, value) => {
    setProfile((prev) => ({
      ...prev,
      staff: prev.staff.map((item) =>
        item._id === staffId
          ? {
              ...item,
              [field]: value,
            }
          : item
      ),
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
        body: JSON.stringify(profile),
      })
      setProfile(response.data || emptyProfile)
      setMessage('Настройки кабинета сохранены')
      window.dispatchEvent(new Event('partycrm:profile-updated'))
    } catch (saveError) {
      setError(saveError.message || 'Не удалось сохранить настройки кабинета')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <section className="mx-auto max-w-5xl px-5 py-10">
        <p className="text-sm text-black/60">Загружаем настройки...</p>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-5xl px-5 py-10">
      <p className="text-sm font-semibold uppercase text-sky-700">
        Кабинет исполнителя
      </p>
      <h1 className="mt-3 text-3xl font-semibold font-futuraPT sm:text-4xl">
        Настройки кабинета
      </h1>

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

      <form onSubmit={saveProfile} className="mt-8 grid gap-5">
        <div className="rounded-lg border border-sky-100 bg-white p-5 shadow-sm shadow-sky-950/5">
          <h2 className="text-xl font-semibold">Основной профиль</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
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

        {profile.staff.length > 0 ? (
          profile.staff.map((staff) => (
            <div
              key={staff._id}
              className="rounded-lg border border-sky-100 bg-white p-5 shadow-sm shadow-sky-950/5"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-xl font-semibold">
                  {staff.companyTitle || 'Компания'}
                </h2>
                <span className="text-sm text-black/55">
                  Данные, видимые этой компании
                </span>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-black/65">Имя</span>
                  <input
                    value={staff.firstName}
                    onChange={(event) =>
                      updateStaff(staff._id, 'firstName', event.target.value)
                    }
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-black/65">Фамилия</span>
                  <input
                    value={staff.secondName}
                    onChange={(event) =>
                      updateStaff(staff._id, 'secondName', event.target.value)
                    }
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-black/65">Телефон</span>
                  <input
                    value={staff.phone}
                    onChange={(event) =>
                      updateStaff(staff._id, 'phone', event.target.value)
                    }
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-black/65">Email</span>
                  <input
                    type="email"
                    value={staff.email}
                    onChange={(event) =>
                      updateStaff(staff._id, 'email', event.target.value)
                    }
                    className={inputClass}
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="font-medium text-black/65">Специализация</span>
                  <select
                    value={staff.specialization}
                    onChange={(event) =>
                      updateStaff(staff._id, 'specialization', event.target.value)
                    }
                    className={`${inputClass} cursor-pointer`}
                  >
                    {specializationOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1 text-sm sm:col-span-2">
                  <span className="font-medium text-black/65">Описание</span>
                  <textarea
                    value={staff.description}
                    onChange={(event) =>
                      updateStaff(staff._id, 'description', event.target.value)
                    }
                    className={textareaClass}
                    placeholder="Кратко опишите опыт, формат работы или важные условия."
                  />
                </label>
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-lg border border-sky-100 bg-white p-5 shadow-sm shadow-sky-950/5">
            <p className="text-sm text-black/60">
              У аккаунта пока нет привязанных карточек исполнителя.
            </p>
          </div>
        )}

        <div className="flex justify-end">
          <button type="submit" disabled={saving} className={primaryButtonClass}>
            {saving ? 'Сохраняем...' : 'Сохранить настройки'}
          </button>
        </div>
      </form>
    </section>
  )
}
