'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const input =
  'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
export default function PartyServiceBookingSettings({
  companyId,
  value,
  onChange,
  disabled,
}) {
  const [state, setState] = useState({
    types: [],
    locations: [],
    error: '',
    loaded: false,
  })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (!companyId) return
    const controller = new AbortController()
    const config = {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    }
    Promise.all([
      apiJson('/api/party/order-types?all=true', config),
      apiJson('/api/party/locations', config),
    ])
      .then(([types, locations]) => {
        if (!controller.signal.aborted)
          setState({
            types: types.data,
            locations: locations.data,
            error: '',
            loaded: true,
          })
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setState({
            types: [],
            locations: [],
            error: cause.message || 'Не удалось загрузить доступность услуги',
            loaded: false,
          })
      })
    return () => controller.abort()
  }, [companyId, retry])
  const edit = (patch) => onChange({ ...value, ...patch })
  const toggle = (field, id, checked) =>
    edit({
      [field]: checked
        ? [...(value[field] || []), String(id)]
        : (value[field] || []).filter((item) => String(item) !== String(id)),
    })
  return (
    <fieldset
      disabled={disabled}
      className="mt-4 min-w-0 space-y-4 border-t border-slate-200 pt-4"
    >
      <legend className="text-sm font-semibold text-slate-900">
        Доступность, количество и аренда
      </legend>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.availabilityConfigured === true}
          onChange={(event) =>
            edit({ availabilityConfigured: event.target.checked })
          }
        />
        Ограничить типы и места проведения
      </label>
      {value.availabilityConfigured ? (
        <>
          {state.error ? (
            <div role="alert" className="text-sm text-red-800">
              {state.error}
              <button
                type="button"
                className="ml-2 min-h-11 cursor-pointer underline"
                onClick={() => setRetry((number) => number + 1)}
              >
                Повторить
              </button>
            </div>
          ) : !state.loaded ? (
            <p role="status">Загрузка справочников…</p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              ['orderTypeIds', 'Типы заказов', state.types],
              ['locationIds', 'Помещения', state.locations],
            ].map(([field, title, options]) => (
              <fieldset className="min-w-0 space-y-1" key={field}>
                <legend className="mb-2 text-sm font-semibold">{title}</legend>
                {options.length ? (
                  options.map((option) => (
                    <label
                      className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"
                      key={String(option._id)}
                    >
                      <input
                        type="checkbox"
                        checked={(value[field] || [])
                          .map(String)
                          .includes(String(option._id))}
                        onChange={(event) =>
                          toggle(field, option._id, event.target.checked)
                        }
                      />
                      {option.title}
                      {option.active === false ? ' · архив' : ''}
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">
                    Сначала добавьте записи в справочник.
                  </p>
                )}
              </fieldset>
            ))}
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.offsiteAllowed === true}
              onChange={(event) =>
                edit({ offsiteAllowed: event.target.checked })
              }
            />
            Можно заказать на выезд
          </label>
          <p className="text-xs text-slate-600">
            Доступен только выбранный тип и выбранное помещение либо разрешённый
            выезд. Без выбранных типов услуга не предлагается.
          </p>
        </>
      ) : (
        <p className="text-xs text-slate-600">
          Услуга доступна для всех типов и мест проведения. Существующая
          доступность сохранена.
        </p>
      )}
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.repeatable === true}
          onChange={(event) => edit({ repeatable: event.target.checked })}
        />
        Можно добавить несколько раз
      </label>
      {value.repeatable ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={value.maxQuantity == null}
              onChange={(event) =>
                edit({ maxQuantity: event.target.checked ? null : 2 })
              }
            />
            Без ограничения
          </label>
          {value.maxQuantity != null ? (
            <label className="text-sm">
              Максимальное количество
              <input
                type="number"
                min={1}
                max={100000}
                step={1}
                className={input}
                value={value.maxQuantity}
                onChange={(event) => edit({ maxQuantity: event.target.value })}
              />
            </label>
          ) : null}
        </div>
      ) : null}
      <label className="block text-sm">
        Минут аренды включено в одно выполнение
        <input
          type="number"
          min={0}
          max={10080}
          step={1}
          className={input}
          value={value.includedRentalMinutes ?? 0}
          onChange={(event) =>
            edit({ includedRentalMinutes: event.target.value })
          }
        />
      </label>
      <p className="text-xs text-slate-600">
        Ноль — аренда оплачивается отдельно. При повторе включённое время
        умножается на количество.
      </p>
    </fieldset>
  )
}
