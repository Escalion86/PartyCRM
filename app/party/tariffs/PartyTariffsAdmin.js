'use client'

import { apiJson } from '@helpers/apiClient'
import Modal from '@components/Modal'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

const emptyForm = {
  title: '',
  subtitle: '',
  price: 0,
  eventsPerMonth: 0,
  staffLimit: 0,
  allowCalendarSync: false,
  allowStatistics: false,
  allowDocuments: false,
  allowTelephony: false,
  allowAi: false,
  description: '',
  features: [],
  hidden: false,
}

function TariffForm({
  form,
  setForm,
  featureInput,
  setFeatureInput,
  addFeature,
  removeFeature,
}) {
  return (
    <div className="grid gap-4 pt-1 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Название
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-sky-400 focus:outline-none"
          placeholder="Например: Базовый"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Подзаголовок
        </label>
        <input
          type="text"
          value={form.subtitle}
          onChange={(e) => setForm((f) => ({ ...f, subtitle: e.target.value }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-sky-400 focus:outline-none"
          placeholder="Для небольших агентств"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Цена (₽/мес)
        </label>
        <input
          type="number"
          step={1000}
          value={form.price}
          onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-sky-400 focus:outline-none"
          placeholder="0 - бесплатный"
          min={0}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Заказов в месяц
        </label>
        <input
          type="number"
          value={form.eventsPerMonth}
          onChange={(e) =>
            setForm((f) => ({ ...f, eventsPerMonth: e.target.value }))
          }
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-sky-400 focus:outline-none"
          placeholder="0 - без ограничений"
          min={0}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Сотрудников
        </label>
        <input
          type="number"
          value={form.staffLimit}
          onChange={(e) =>
            setForm((f) => ({ ...f, staffLimit: e.target.value }))
          }
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-sky-400 focus:outline-none"
          placeholder="0 - без ограничений"
          min={0}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Скрытый
        </label>
        <label className="mt-2 flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={form.hidden}
            onChange={(e) =>
              setForm((f) => ({ ...f, hidden: e.target.checked }))
            }
            className="rounded border-gray-300 text-sky-600 focus:ring-sky-400"
          />
          <span className="text-sm text-gray-600">
            Не показывать на лендинге и пользователям
          </span>
        </label>
      </div>
      <div className="sm:col-span-2">
        <div className="mb-2 text-sm font-medium text-gray-700">
          Доступные опции тарифа
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {[
            ['allowDocuments', 'Документы'],
            ['allowStatistics', 'Статистика'],
            ['allowCalendarSync', 'Google Calendar'],
            ['allowTelephony', 'Телефония'],
            ['allowAi', 'AI'],
          ].map(([field, label]) => (
            <label
              key={field}
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              <input
                type="checkbox"
                checked={form[field]}
                onChange={(e) =>
                  setForm((f) => ({ ...f, [field]: e.target.checked }))
                }
                className="rounded border-gray-300 text-sky-600 focus:ring-sky-400"
              />
              <span className="text-gray-700">{label}</span>
            </label>
          ))}
        </div>
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Описание
        </label>
        <textarea
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-sky-400 focus:outline-none"
          rows={2}
          placeholder="Краткое описание тарифа"
        />
      </div>
      <div className="sm:col-span-2">
        <label className="mb-1 block text-sm font-medium text-gray-700">
          Возможности (features)
        </label>
        <div className="mb-2 flex gap-2">
          <input
            type="text"
            value={featureInput}
            onChange={(e) => setFeatureInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addFeature()
              }
            }}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-sky-400 focus:outline-none"
            placeholder="Введите возможность и нажмите Enter"
          />
          <button
            type="button"
            onClick={addFeature}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-600"
          >
            Добавить
          </button>
        </div>
        {form.features && form.features.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {form.features.map((feat, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm text-sky-800"
              >
                {feat}
                <button
                  type="button"
                  onClick={() => removeFeature(index)}
                  className="ml-1 text-sky-400 transition-colors hover:text-red-500"
                >
                  x
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function PartyTariffsAdmin({ embedded = false }) {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [tariffs, setTariffs] = useState([])
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ ...emptyForm })
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [featureInput, setFeatureInput] = useState('')
  const [tariffModalOpen, setTariffModalOpen] = useState(false)

  // Проверка авторизации и загрузка тарифов
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const meRes = await apiJson('/api/party/auth/me')
      if (!meRes?.success || !meRes?.data?.user) {
        router.push('/party/login?callbackUrl=/party/site-settings/tariffs')
        return
      }
      const role = meRes.data.user.role
      if (role !== 'dev') {
        setError('Доступ только для dev')
        setLoading(false)
        return
      }
      setUser(meRes.data.user)

      const tariffsRes = await apiJson('/api/party/tariffs')
      if (tariffsRes?.success) {
        setTariffs(tariffsRes.data || [])
      } else {
        setError('Ошибка загрузки тарифов')
      }
    } catch (err) {
      setError('Ошибка загрузки данных')
    }
    setLoading(false)
  }, [router])

  useEffect(() => {
    load()
  }, [load])

  // Создание / обновление
  const handleSave = async () => {
    if (!form.title.trim()) {
      setError('Название тарифа обязательно')
      return
    }
    setSaving(true)
    setError('')
    try {
      const body = {
        ...form,
        price: Number(form.price) || 0,
        eventsPerMonth: Number(form.eventsPerMonth) || 0,
        staffLimit: Number(form.staffLimit) || 0,
        features: form.features.filter(Boolean),
      }

      if (editingId) {
        const res = await apiJson(`/api/party/tariffs/${editingId}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        })
        if (!res?.success) throw new Error(res?.error || 'Ошибка обновления')
      } else {
        const res = await apiJson('/api/party/tariffs', {
          method: 'POST',
          body: JSON.stringify(body),
        })
        if (!res?.success) throw new Error(res?.error || 'Ошибка создания')
      }

      setForm({ ...emptyForm })
      setEditingId(null)
      setFeatureInput('')
      setTariffModalOpen(false)
      await load()
    } catch (err) {
      setError(err.message)
    }
    setSaving(false)
  }

  // Редактирование
  const handleEdit = (tariff) => {
    setForm({
      title: tariff.title || '',
      subtitle: tariff.subtitle || '',
      price: tariff.price ?? 0,
      eventsPerMonth: tariff.eventsPerMonth ?? 0,
      staffLimit: tariff.staffLimit ?? 0,
      allowCalendarSync: tariff.allowCalendarSync || false,
      allowStatistics: tariff.allowStatistics || false,
      allowDocuments: tariff.allowDocuments || false,
      allowTelephony: tariff.allowTelephony || false,
      allowAi: tariff.allowAi || false,
      description: tariff.description || '',
      features: tariff.features || [],
      hidden: tariff.hidden || false,
    })
    setEditingId(tariff._id)
    setError('')
    setTariffModalOpen(true)
  }

  // Удаление
  const handleDelete = async (id, title) => {
    if (!window.confirm(`Удалить тариф "${title}"?`)) return
    try {
      const res = await apiJson(`/api/party/tariffs/${id}`, {
        method: 'DELETE',
      })
      if (!res?.success) throw new Error(res?.error || 'Ошибка удаления')
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  // Отмена редактирования
  const handleCancel = () => {
    setForm({ ...emptyForm })
    setEditingId(null)
    setFeatureInput('')
    setError('')
    setTariffModalOpen(false)
  }

  // Добавление фичи
  const addFeature = () => {
    const val = featureInput.trim()
    if (!val) return
    setForm((f) => ({ ...f, features: [...(f.features || []), val] }))
    setFeatureInput('')
  }

  const removeFeature = (index) => {
    setForm((f) => ({
      ...f,
      features: (f.features || []).filter((_, i) => i !== index),
    }))
  }

  const handleCreate = () => {
    setForm({ ...emptyForm })
    setEditingId(null)
    setFeatureInput('')
    setError('')
    setTariffModalOpen(true)
  }

  if (loading) {
    return (
      <div className="flex min-h-40 items-center justify-center bg-[#eaf6ff]">
        <p className="text-sm text-gray-500">Загрузка...</p>
      </div>
    )
  }

  if (error && !user) {
    return (
      <div className="flex min-h-40 items-center justify-center bg-[#eaf6ff]">
        <p className="text-sm text-red-500">{error}</p>
      </div>
    )
  }

  return (
    <div className="bg-[#eaf6ff] text-slate-950">
      {!embedded ? (
        <header className="border-b border-sky-100 bg-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
            <div className="flex items-center gap-4">
              <span className="text-lg font-semibold text-sky-700">
                PartyCRM
              </span>
              <nav className="flex items-center gap-3 text-sm">
                <Link
                  href="/company"
                  className="text-gray-500 transition-colors hover:text-sky-700"
                >
                  Кабинет
                </Link>
                <span className="text-gray-300">/</span>
                <Link
                  href="/party/site-settings/tariffs"
                  className="text-gray-500 transition-colors hover:text-sky-700"
                >
                  Настройка сайта
                </Link>
                <span className="text-gray-300">/</span>
                <span className="font-semibold text-sky-700">Тарифы</span>
              </nav>
            </div>
          </div>
        </header>
      ) : null}

      <div className={embedded ? '' : 'mx-auto max-w-6xl px-5 py-8'}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="font-futuraPT text-2xl font-semibold text-black">
              Управление тарифами
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Создание и редактирование тарифных планов PartyCRM
            </p>
          </div>
          <button
            type="button"
            onClick={handleCreate}
            className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
          >
            Создать тариф
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Список тарифов */}
        <div className="mt-6 space-y-3">
          {tariffs.length === 0 ? (
            <div className="rounded-2xl border border-gray-200/70 bg-white p-8 text-center text-gray-400">
              Тарифы не найдены. Создайте первый тариф.
            </div>
          ) : (
            tariffs.map((tariff) => (
              <div
                key={tariff._id}
                className={`rounded-2xl border bg-white p-5 shadow-sm ${
                  tariff.hidden
                    ? 'border-gray-200/50 opacity-70'
                    : 'border-gray-200/70'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-futuraPT text-lg font-semibold text-black">
                        {tariff.title}
                      </h3>
                      {tariff.hidden && (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-500">
                          скрыт
                        </span>
                      )}
                    </div>
                    {tariff.subtitle && (
                      <p className="text-sm text-gray-500">{tariff.subtitle}</p>
                    )}
                    <p className="mt-2 text-xl font-bold text-sky-700">
                      {tariff.price > 0
                        ? `${Number(tariff.price).toLocaleString('ru-RU')} ₽/мес`
                        : 'Бесплатно'}
                    </p>
                    <div className="mt-2 grid gap-1 text-xs text-gray-500 sm:grid-cols-2">
                      <span>
                        Заказы:{' '}
                        {Number(tariff.eventsPerMonth ?? 0) > 0
                          ? tariff.eventsPerMonth
                          : 'без ограничений'}
                      </span>
                      <span>
                        Сотрудники:{' '}
                        {Number(tariff.staffLimit ?? 0) > 0
                          ? tariff.staffLimit
                          : 'без ограничений'}
                      </span>
                    </div>
                    {tariff.description && (
                      <p className="mt-1 text-sm text-gray-600">
                        {tariff.description}
                      </p>
                    )}
                    {tariff.features && tariff.features.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {tariff.features.map((feat, i) => (
                          <span
                            key={i}
                            className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-gray-600"
                          >
                            {feat}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => handleEdit(tariff)}
                      className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 transition-colors hover:bg-sky-100"
                    >
                      Редактировать
                    </button>
                    <button
                      onClick={() => handleDelete(tariff._id, tariff.title)}
                      className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
                    >
                      Удалить
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <Modal
          open={tariffModalOpen}
          onClose={handleCancel}
          title={editingId ? 'Редактировать тариф' : 'Создать тариф'}
          tone="party"
          size="full"
          footer={
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCancel}
                className="cursor-pointer rounded border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? 'Сохранение...'
                  : editingId
                    ? 'Сохранить изменения'
                    : 'Создать тариф'}
              </button>
            </div>
          }
        >
          <TariffForm
            form={form}
            setForm={setForm}
            featureInput={featureInput}
            setFeatureInput={setFeatureInput}
            addFeature={addFeature}
            removeFeature={removeFeature}
          />
        </Modal>
      </div>
    </div>
  )
}
