'use client'

import { useEffect, useState } from 'react'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import { apiJson } from '@helpers/apiClient'
import OrderInventoryPanel from './OrderInventoryPanel'
import InventoryMovementsPanel from './InventoryMovementsPanel'

const emptyItem = {
  title: '',
  category: '',
  unit: 'шт.',
  quantity: 1,
  unavailableQuantity: 0,
  unavailableReason: '',
  storageLocation: '',
  status: 'active',
}

export default function InventoryWorkspace({ companies }) {
  const [companyId, setCompanyId] = useState(companies[0]?._id || '')
  const [data, setData] = useState({ items: [], requirements: [] })
  const [services, setServices] = useState([])
  const [editing, setEditing] = useState(null)
  const [serviceId, setServiceId] = useState('')
  const [norms, setNorms] = useState([])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [previewIds, setPreviewIds] = useState([])
  const [showArchived, setShowArchived] = useState(false)
  useEffect(() => {
    const stored = localStorage.getItem('partycrm.activeCompanyId')
    if (companies.some((item) => item._id === stored)) setCompanyId(stored)
  }, [companies])
  const request = (url, options = {}) =>
    apiJson(url, {
      ...options,
      cache: 'no-store',
      headers: { 'x-partycrm-company-id': companyId },
    })
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    setEditing(null)
    setServiceId('')
    setNorms([])
    setPreviewIds([])
    const headers = { 'x-partycrm-company-id': companyId }
    Promise.all([
      apiJson('/api/party/inventory', { headers, cache: 'no-store' }),
      apiJson('/api/party/services', { headers, cache: 'no-store' }),
    ])
      .then(([inventory, catalog]) => {
        if (alive) {
          setData(inventory.data)
          setServices(catalog.data)
        }
      })
      .catch((failure) => {
        if (alive) setError(failure.message)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [companyId])
  const reload = async () =>
    setData((await request('/api/party/inventory')).data)
  const saveItem = async (event) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await request(
        `/api/party/inventory${editing._id ? `/${editing._id}` : ''}`,
        {
          method: editing._id ? 'PATCH' : 'POST',
          body: JSON.stringify(editing),
        }
      )
      await reload()
      setEditing(null)
      setNotice('Позиция сохранена.')
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  const selectService = (id) => {
    setServiceId(id)
    setNorms(
      (
        data.requirements.find((item) => String(item.serviceId) === id)
          ?.items ?? []
      ).map((item) => ({
        resourceId: String(item.resourceId),
        quantity: item.quantity,
      }))
    )
  }
  const saveNorms = async () => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      await request(`/api/party/inventory/requirements/${serviceId}`, {
        method: 'PUT',
        body: JSON.stringify({ items: norms }),
      })
      await reload()
      setNotice(
        'Состав услуги сохранён. Существующие резервы сохраняют прежний комплект.'
      )
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <main className="mx-auto max-w-6xl space-y-6 p-3 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Склад и реквизит</h1>
          <p className="mt-1 text-sm text-gray-600">
            Количество, комплекты услуг и проверка занятости.
          </p>
        </div>
        <label className="text-sm">
          Компания{' '}
          <select
            aria-label="Компания склада"
            disabled={busy}
            className="ml-2 cursor-pointer rounded border bg-white p-2"
            value={companyId}
            onChange={(event) => {
              localStorage.setItem(
                'partycrm.activeCompanyId',
                event.target.value
              )
              setCompanyId(event.target.value)
            }}
          >
            {companies.map((company) => (
              <option key={company._id} value={company._id}>
                {company.title}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-green-50 p-3 text-green-800">
          {notice}
        </p>
      )}
      {loading ? (
        <p role="status">Загрузка склада…</p>
      ) : (
        <>
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Каталог</h2>
              <Button
                type="button"
                variant="contained"
                onClick={() => setEditing({ ...emptyItem })}
              >
                Добавить реквизит
              </Button>
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(event) => setShowArchived(event.target.checked)}
              />{' '}
              Показывать архивные позиции
            </label>
            {editing && (
              <form
                onSubmit={saveItem}
                className="space-y-4 rounded-xl border bg-white p-4"
              >
                <h3 className="font-semibold">
                  {editing._id ? 'Редактирование позиции' : 'Новый реквизит'}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['title', 'Название'],
                    ['category', 'Категория'],
                    ['storageLocation', 'Место хранения'],
                    ['unit', 'Единица измерения'],
                    ['quantity', 'Всего'],
                    ['unavailableQuantity', 'Недоступно'],
                    ['unavailableReason', 'Причина недоступности'],
                  ].map(([field, label]) => (
                    <TextField
                      key={field}
                      size="small"
                      label={label}
                      required={field === 'title'}
                      type={
                        field === 'quantity' || field === 'unavailableQuantity'
                          ? 'number'
                          : 'text'
                      }
                      value={editing[field]}
                      onChange={(event) =>
                        setEditing({ ...editing, [field]: event.target.value })
                      }
                      inputProps={
                        field === 'quantity' || field === 'unavailableQuantity'
                          ? { min: 0, step: 1 }
                          : {}
                      }
                    />
                  ))}
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.status === 'archived'}
                    onChange={(event) =>
                      setEditing({
                        ...editing,
                        status: event.target.checked ? 'archived' : 'active',
                      })
                    }
                  />{' '}
                  Архивная позиция (недоступна для новых комплектов)
                </label>
                <p className="text-xs text-gray-500">
                  Недоступное количество исключается из подбора. Изменение
                  остатка не отменяет уже созданные резервы.
                </p>
                <div className="flex gap-2">
                  <Button type="submit" variant="contained" disabled={busy}>
                    Сохранить
                  </Button>
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => setEditing(null)}
                  >
                    Отмена
                  </Button>
                </div>
              </form>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.items
                .filter((item) => showArchived || item.status === 'active')
                .map((item) => (
                  <article
                    key={item._id}
                    className="rounded-xl border bg-white p-4"
                  >
                    <h3 className="font-semibold">
                      {item.title}
                      {item.status === 'archived' ? ' · архив' : ''}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {item.category || 'Без категории'} ·{' '}
                      {item.storageLocation || 'Место не указано'}
                    </p>
                    <p className="mt-2">
                      Всего{' '}
                      <strong>
                        {item.quantity} {item.unit}
                      </strong>
                      , недоступно {item.unavailableQuantity}
                    </p>
                    {item.unavailableReason && (
                      <p className="mt-1 text-sm text-amber-800">
                        {item.unavailableReason}
                      </p>
                    )}
                    <Button
                      type="button"
                      size="small"
                      onClick={() => setEditing({ ...item })}
                    >
                      Изменить
                    </Button>
                  </article>
                ))}
            </div>
            {!data.items.length && (
              <p className="rounded-xl border border-dashed p-6 text-sm text-gray-500">
                Добавьте костюмы, аксессуары и оборудование. Затем укажите, что
                требуется каждой услуге.
              </p>
            )}
          </section>
          <section className="space-y-3 rounded-xl border bg-white p-4">
            <h2 className="text-lg font-semibold">Состав реквизита услуги</h2>
            <p className="text-sm text-gray-600">
              Количество на одну услугу. При подборе норма умножается на
              количество услуг.
            </p>
            <label className="block text-sm">
              Услуга
              <select
                className="mt-1 w-full cursor-pointer rounded border bg-white p-2"
                value={serviceId}
                onChange={(event) => selectService(event.target.value)}
              >
                <option value="">Выберите услугу</option>
                {services.map((service) => (
                  <option key={service._id} value={service._id}>
                    {service.title}
                  </option>
                ))}
              </select>
            </label>
            {serviceId && (
              <>
                {norms.map((norm, index) => (
                  <div
                    key={norm.resourceId}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span className="min-w-32 flex-1 text-sm">
                      {data.items.find(
                        (item) => String(item._id) === norm.resourceId
                      )?.title || 'Архивный реквизит'}
                    </span>
                    <TextField
                      label="Количество"
                      size="small"
                      type="number"
                      sx={{ width: 120 }}
                      inputProps={{ min: 1 }}
                      value={norm.quantity}
                      onChange={(event) =>
                        setNorms(
                          norms.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  quantity: Number(event.target.value),
                                }
                              : item
                          )
                        )
                      }
                    />
                    <Button
                      type="button"
                      onClick={() =>
                        setNorms(norms.filter((_, i) => i !== index))
                      }
                    >
                      Убрать
                    </Button>
                  </div>
                ))}
                <select
                  aria-label="Добавить реквизит в услугу"
                  className="w-full cursor-pointer rounded border bg-white p-2 text-sm"
                  value=""
                  onChange={(event) => {
                    if (event.target.value)
                      setNorms([
                        ...norms,
                        { resourceId: event.target.value, quantity: 1 },
                      ])
                  }}
                >
                  <option value="">Добавить реквизит…</option>
                  {data.items
                    .filter(
                      (item) =>
                        item.status === 'active' &&
                        !norms.some(
                          (norm) => norm.resourceId === String(item._id)
                        )
                    )
                    .map((item) => (
                      <option key={item._id} value={item._id}>
                        {item.title}
                      </option>
                    ))}
                </select>
                <Button
                  type="button"
                  variant="contained"
                  disabled={busy}
                  onClick={saveNorms}
                >
                  Сохранить состав
                </Button>
              </>
            )}
          </section>
          <InventoryMovementsPanel
            activeCompanyId={companyId}
            onChanged={reload}
          />
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Проверить комплект</h2>
            <div className="flex flex-wrap gap-3">
              {services.map((service) => (
                <label
                  key={service._id}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={previewIds.includes(String(service._id))}
                    onChange={(event) =>
                      setPreviewIds(
                        event.target.checked
                          ? [...previewIds, String(service._id)]
                          : previewIds.filter(
                              (id) => id !== String(service._id)
                            )
                      )
                    }
                  />
                  {service.title}
                </label>
              ))}
            </div>
            {!!previewIds.length && (
              <OrderInventoryPanel
                key={`${companyId}:${previewIds.join(',')}:${JSON.stringify(data.requirements)}`}
                activeCompanyId={companyId}
                services={services}
                serviceItems={previewIds.map((id) => ({
                  serviceId: id,
                  quantity: 1,
                }))}
              />
            )}
          </section>
        </>
      )}
    </main>
  )
}
