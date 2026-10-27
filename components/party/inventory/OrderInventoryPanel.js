'use client'

import { useEffect, useState } from 'react'
import Button from '@mui/material/Button'
import TextField from '@mui/material/TextField'
import { apiJson } from '@helpers/apiClient'
import InventoryWarnings from './InventoryWarnings'
import InventoryMovementsPanel from './InventoryMovementsPanel'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'

const EMPTY = []
const localDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (!Number.isFinite(+date)) return ''
  return new Date(+date - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16)
}
const toIso = (value) => (value ? new Date(value).toISOString() : '')

// All resources on a manually edited line are totals, not per-service norms.
export default function OrderInventoryPanel({
  activeCompanyId,
  orderId = '',
  serviceItems = EMPTY,
  services = EMPTY,
  eventDate = '',
  dateEnd = '',
  onSaved,
  canViewReservations,
  canEditReservations,
  canViewMovements,
  canEditMovements,
  onDirtyChange,
}) {
  const [catalog, setCatalog] = useState({ items: [], requirements: [] })
  const [lines, setLines] = useState([])
  const [baseKey, setBaseKey] = useState('')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dirty, setDirty] = useState(false)
  const mayViewReservations =
    canViewReservations ?? catalog.permissions?.reservations ?? false
  const mayEditReservations =
    mayViewReservations &&
    (canEditReservations ?? catalog.permissions?.editReservations ?? false)
  const mayViewMovements =
    canViewMovements ?? catalog.permissions?.movements ?? false
  const mayEditMovements =
    mayViewMovements &&
    (canEditMovements ?? catalog.permissions?.editMovements ?? false)
  const sourceKey = JSON.stringify({ serviceItems, eventDate, dateEnd })
  const request = (path, options = {}) =>
    apiJson(`/api/party/inventory${path}`, {
      ...options,
      headers: { 'x-partycrm-company-id': activeCompanyId },
      cache: 'no-store',
    })
  useEffect(() => {
    let alive = true
    setLoading(true)
    setError('')
    const headers = { 'x-partycrm-company-id': activeCompanyId }
    apiJson('/api/party/inventory', { headers, cache: 'no-store' })
      .then(async (response) => {
        const canRead =
          canViewReservations ??
          response.data.permissions?.reservations ??
          false
        const saved =
          orderId && canRead
            ? await apiJson(`/api/party/inventory/reservations/${orderId}`, {
                headers,
                cache: 'no-store',
              })
            : null
        return [response, saved]
      })
      .then(([response, saved]) => {
        if (!alive) return
        setCatalog(response.data)
        setDirty(false)
        const source = JSON.parse(sourceKey)
        const defaults = source.serviceItems.map((item, index) => ({
          ...item,
          serviceLineId: item.serviceLineId || `${item.serviceId}:${index}`,
          quantity: item.quantity || 1,
          startAt: item.startAt || source.eventDate,
          endAt: item.endAt || source.dateEnd,
        }))
        setLines(
          saved?.data?.status === 'active' ? saved.data.serviceItems : defaults
        )
        setBaseKey(sourceKey)
        setResult(
          saved?.data?.status === 'active' && saved.data.warnings?.length
            ? { hasShortage: true, warnings: saved.data.warnings }
            : null
        )
        setNotice(
          saved?.data?.status === 'active'
            ? 'Загружен сохранённый резерв. Проверьте его, если изменились время или услуги заказа.'
            : ''
        )
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
    // Source changes are applied explicitly to preserve manual selections.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCompanyId, orderId, canViewReservations])
  useEffect(() => {
    onDirtyChange?.(dirty)
    return () => onDirtyChange?.(false)
  }, [dirty, onDirtyChange])
  usePartyUnsavedChanges(dirty, {
    label: 'резерв реквизита',
    scope: activeCompanyId,
    pending: busy,
  })

  const changeLine = (index, patch) => {
    if (!mayEditReservations) return
    setDirty(true)
    if (Object.hasOwn(patch, 'resources'))
      patch = { ...patch, resourceNorms: undefined }
    if (Object.hasOwn(patch, 'quantity'))
      patch = { ...patch, quantityMode: 'manual' }
    setLines((current) =>
      current.map((line, i) => (i === index ? { ...line, ...patch } : line))
    )
    setResult(null)
    setNotice('Комплект изменён. Проверьте и сохраните резерв.')
  }
  const getResources = (line) =>
    line.resourceNorms?.map((item) => ({
      resourceId: String(item.resourceId),
      quantity: item.quantity * (line.quantity || 1),
    })) ??
    line.resources ??
    (
      catalog.requirements.find(
        (item) => String(item.serviceId) === String(line.serviceId)
      )?.items ?? []
    ).map((item) => ({
      resourceId: String(item.resourceId),
      quantity: item.quantity * (line.quantity || 1),
    }))
  const restore = () => {
    if (!mayEditReservations) return
    setDirty(true)
    setLines(
      serviceItems.map((item, index) => ({
        ...item,
        resources: undefined,
        resourceNorms: undefined,
        quantityMode: 'automatic',
        quantity: item.quantity || 1,
        serviceLineId: item.serviceLineId || `${item.serviceId}:${index}`,
        startAt: item.startAt || eventDate,
        endAt: item.endAt || dateEnd,
      }))
    )
    setBaseKey(sourceKey)
    setResult(null)
    setNotice(
      'Подставлены нормы услуг. Проверьте интервалы; по умолчанию используется время мероприятия.'
    )
  }
  const run = async (save = false, confirmShortage = false) => {
    if (save ? !mayEditReservations : !mayViewReservations) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await request(
        save ? `/reservations/${orderId}` : '/availability',
        {
          method: save ? 'PUT' : 'POST',
          body: JSON.stringify({
            orderId,
            serviceItems: lines,
            eventDate,
            dateEnd,
            confirmShortage,
          }),
        }
      )
      setResult(response.data)
      if (save) {
        setDirty(false)
        setLines(response.data.serviceItems || lines)
        setNotice('Резерв сохранён.')
        onSaved?.(response.data)
      }
    } catch (failure) {
      if (failure.status === 409 && failure.payload?.data?.hasShortage)
        setResult(failure.payload.data)
      else setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  const release = async () => {
    if (!mayEditReservations) return
    setBusy(true)
    setError('')
    try {
      await request(`/reservations/${orderId}`, { method: 'DELETE' })
      setResult(null)
      setDirty(false)
      setNotice('Резерв снят менеджером.')
      onSaved?.(null)
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  if (loading)
    return (
      <p className="p-3 text-sm" role="status">
        Загрузка реквизита…
      </p>
    )
  if (!mayViewReservations)
    return (
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-3">
        <h3 className="font-semibold">Справочник реквизита</h3>
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <ul className="space-y-2">
          {catalog.items.map((item) => (
            <li
              key={item._id}
              className="rounded-lg border border-slate-100 p-2 text-sm"
            >
              {item.title} · {item.unit}
              {item.quantity !== undefined
                ? ` · всего ${item.quantity}, доступно ${item.freeQuantity ?? item.quantity}`
                : ''}
            </li>
          ))}
        </ul>
        {orderId && mayViewMovements ? (
          <InventoryMovementsPanel
            activeCompanyId={activeCompanyId}
            orderId={orderId}
            canEdit={mayEditMovements}
          />
        ) : null}
      </section>
    )
  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <div>
        <h3 className="text-lg font-semibold">Реквизит по услугам</h3>
        <p className="text-sm text-gray-600">
          Каждая услуга имеет свой интервал. Количество в комплекте — на всю
          позицию услуги. Часы и дробные коммерческие количества подбирают один
          комплект на позицию; нужное количество комплектов можно уточнить
          здесь.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-gray-600">
          {notice}
        </p>
      )}
      {baseKey !== sourceKey && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm">
          Время или услуги заказа изменились. Обновите подбор, чтобы применить
          изменения; ручной комплект пока сохранён.
        </p>
      )}
      <fieldset disabled={busy || !mayEditReservations} className="space-y-4">
        <Button
          type="button"
          size="small"
          onClick={restore}
          disabled={busy || !mayEditReservations}
        >
          Подставить текущие услуги и нормы заново
        </Button>
        {lines.length === 0 && (
          <p className="text-sm text-gray-500">
            Добавьте услуги в заказ для подбора реквизита.
          </p>
        )}
        {lines.map((line, index) => (
          <div
            key={line.serviceLineId}
            className="space-y-3 rounded-lg border p-3"
          >
            <strong>
              {services.find(
                (service) => String(service._id) === String(line.serviceId)
              )?.title || `Услуга ${index + 1}`}
            </strong>
            <div className="grid gap-3 sm:grid-cols-3">
              <TextField
                label="Количество комплектов"
                type="number"
                size="small"
                value={line.quantity}
                inputProps={{ min: 1 }}
                onChange={(event) =>
                  changeLine(index, { quantity: Number(event.target.value) })
                }
              />
              <TextField
                label="Начало услуги"
                type="datetime-local"
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                value={localDate(line.startAt)}
                onChange={(event) =>
                  changeLine(index, { startAt: toIso(event.target.value) })
                }
              />
              <TextField
                label="Окончание услуги"
                type="datetime-local"
                size="small"
                slotProps={{ inputLabel: { shrink: true } }}
                value={localDate(line.endAt)}
                onChange={(event) =>
                  changeLine(index, { endAt: toIso(event.target.value) })
                }
              />
            </div>
            {line.resources !== undefined &&
              line.resourceNorms === undefined && (
                <p className="text-xs text-amber-800">
                  Сохранённый комплект: изменение количества услуг не меняет его
                  автоматически.
                </p>
              )}
            {getResources(line).map((resource, resourceIndex) => (
              <div
                className="flex flex-wrap items-center gap-2"
                key={resource.resourceId}
              >
                <span className="min-w-32 flex-1 text-sm">
                  {catalog.items.find(
                    (item) => String(item._id) === String(resource.resourceId)
                  )?.title || 'Архивный реквизит'}
                </span>
                <TextField
                  label="Количество"
                  type="number"
                  size="small"
                  sx={{ width: 110 }}
                  value={resource.quantity}
                  inputProps={{ min: 1 }}
                  onChange={(event) =>
                    changeLine(index, {
                      resources: getResources(line).map((item, i) =>
                        i === resourceIndex
                          ? { ...item, quantity: Number(event.target.value) }
                          : item
                      ),
                    })
                  }
                />
                <Button
                  type="button"
                  size="small"
                  onClick={() =>
                    changeLine(index, {
                      resources: getResources(line).filter(
                        (_, i) => i !== resourceIndex
                      ),
                    })
                  }
                >
                  Убрать
                </Button>
              </div>
            ))}
            <label className="block text-sm">
              Добавить реквизит
              <select
                className="mt-1 w-full cursor-pointer rounded border bg-white p-2"
                value=""
                onChange={(event) => {
                  if (event.target.value)
                    changeLine(index, {
                      resources: [
                        ...getResources(line),
                        { resourceId: event.target.value, quantity: 1 },
                      ],
                    })
                }}
              >
                <option value="">Выберите позицию</option>
                {catalog.items
                  .filter(
                    (item) =>
                      item.status === 'active' &&
                      !getResources(line).some(
                        (resource) =>
                          String(resource.resourceId) === String(item._id)
                      )
                  )
                  .map((item) => (
                    <option value={item._id} key={item._id}>
                      {item.title}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        ))}
      </fieldset>
      <InventoryWarnings result={result} services={services} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outlined"
          disabled={busy || !lines.length || !mayViewReservations}
          onClick={() => run()}
        >
          Проверить наличие
        </Button>
        {orderId && mayEditReservations ? (
          <>
            <Button
              type="button"
              variant="contained"
              disabled={busy}
              onClick={() => run(true)}
            >
              Сохранить резерв
            </Button>
            {result?.hasShortage && (
              <Button
                type="button"
                color="warning"
                variant="contained"
                disabled={busy}
                onClick={() => run(true, true)}
              >
                Подтверждаю: сохранить с дефицитом
              </Button>
            )}
            <Button
              type="button"
              color="warning"
              disabled={busy}
              onClick={release}
            >
              Снять резерв
            </Button>
          </>
        ) : !orderId ? (
          <p className="self-center text-xs text-gray-500">
            Проверка не создаёт бронь. Резервирование доступно после сохранения
            заказа.
          </p>
        ) : null}
      </div>
      {orderId && mayViewMovements && (
        <InventoryMovementsPanel
          activeCompanyId={activeCompanyId}
          orderId={orderId}
          canEdit={mayEditMovements}
          onChanged={async () => {
            if (!mayViewReservations) return
            try {
              const saved = await request(`/reservations/${orderId}`)
              const next = {
                hasShortage: Boolean(
                  saved.data?.status === 'active' && saved.data.warnings?.length
                ),
                warnings: saved.data?.warnings || [],
              }
              setResult(next)
              onSaved?.(next)
            } catch (failure) {
              setError(failure.message)
            }
          }}
        />
      )}
    </section>
  )
}
