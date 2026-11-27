'use client'

import { useState } from 'react'
import { calculatePartyServiceConfiguration } from '@helpers/partyServiceConfiguration'
import { isPartyServiceAvailable } from '@helpers/partyOrderBooking'
import { emptyPartyOrderServiceParameters } from '@helpers/partyOrderServicePreview'
import { partyDateAtTime, partyZonedParts } from '@helpers/partyWorkingSchedule'
import { partyOrderPlaceAt } from '@helpers/partyMultiPlaceOrderDraft'
import PartyOrderAvailabilityPicker from './PartyOrderAvailabilityPicker'
import PartyOrderServiceParameters from './PartyOrderServiceParameters'

const input = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 aria-invalid:border-red-700 sm:text-sm'
const button = 'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50'
const placeGroup = 'min-w-0 space-y-3 border-b border-slate-200 pb-4 last:border-0'
const money = (kopecks) => `${Number((kopecks ?? 0) / 100).toLocaleString('ru-RU')} ₽`
const rentalGroups = { hourlyRate: 'Почасовая ставка', extras: 'Разовые доплаты' }

const localValue = (value, timeZone) => {
  const parts = value && partyZonedParts(value, timeZone)
  return parts ? `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}` : ''
}

const dateText = (value, timeZone) => value ? new Date(value).toLocaleString('ru-RU', {
  timeZone, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
}) : 'Время не выбрано'

function LocationParameters({ preview, update, canEdit, canPrice, showErrors }) {
  const { definition, location, place } = preview
  if (!definition) return null
  return Object.entries(rentalGroups).map(([key, title]) => {
    const configuration = definition[key]
    if (!configuration) return null
    const parameters = place.parameters[key] || { values: {} }
    let error
    try {
      calculatePartyServiceConfiguration({ configuration, price: key === 'hourlyRate' ? Number(preview.locationConfiguration?.baseHourlyRate ?? location?.hourlyRentalRate ?? 0) : 0, duration: 0 }, parameters)
    } catch (cause) {
      error = cause
    }
    return (
      <div key={key} className="min-w-0 space-y-1">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <PartyOrderServiceParameters
          title={`${title} — ${preview.title}`}
          subject="аренды"
          configuration={configuration}
          parameters={parameters}
          error={error}
          showError={showErrors}
          canEdit={canEdit}
          canPrice={canPrice}
          onChange={(values) => update(place.id, { parameters: { ...place.parameters, [key]: values } })}
        />
      </div>
    )
  })
}

export function PartyMultiPlaceSelection({ previews, locations, onAdd, onRemove, onUpdate, canEdit, canPrice, showErrors }) {
  const selectedLocations = new Set(previews.map(({ place }) => place.locationId).filter(Boolean))
  const canAdd = previews.length < 10 && selectedLocations.size === previews.length && locations.some((location) =>
    location.status !== 'archived' && location.bookingEnabled !== false && !selectedLocations.has(String(location._id)))
  return (
    <>
      {previews.map((preview, index) => {
        const { place, title, location, guestError } = preview
        const roomNames = locations.filter((item) => String(item._id) === place.locationId ||
          (item.status !== 'archived' && item.bookingEnabled !== false && !selectedLocations.has(String(item._id))))
        return (
          <fieldset className={placeGroup} key={place.id}>
            <legend className="font-semibold text-slate-900 [overflow-wrap:anywhere]">{place.locationId ? title : `Место ${index + 1}`}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block min-w-0 text-sm">
                {`Помещение ${index + 1}`}
                <select className={`${input} cursor-pointer`} value={place.locationId} disabled={!canEdit}
                  aria-invalid={showErrors && !place.locationId || undefined}
                  onChange={(event) => onUpdate(place.id, { locationId: event.target.value, eventDate: '', rental: null, parameters: {} })}>
                  <option value="">Выберите помещение</option>
                  {place.locationId && !location && <option value={place.locationId}>{title}</option>}
                  {roomNames.map((item) => <option key={String(item._id)} value={String(item._id)}>{item.title}</option>)}
                </select>
              </label>
              <label className="block min-w-0 text-sm">
                {`Число гостей — ${place.locationId ? title : `место ${index + 1}`}`}
                <input className={input} type="number" min={1} max={Math.min(location?.capacity || 100000, 100000)} step={1}
                  disabled={!canEdit} value={place.guestCount} aria-invalid={Boolean(showErrors && guestError) || undefined}
                  onChange={(event) => onUpdate(place.id, { guestCount: event.target.value })} />
                {Number(location?.capacity) > 0 && <span className="text-xs text-slate-600">До {location.capacity} чел.</span>}
              </label>
            </div>
            <LocationParameters preview={preview} update={onUpdate} canEdit={canEdit} canPrice={canPrice} showErrors={showErrors} />
            {canEdit && previews.length > 1 && <button className={button} type="button" aria-label={`Убрать место ${title}`} onClick={() => onRemove(place.id)}>Убрать место</button>}
          </fieldset>
        )
      })}
      {canEdit && <button className={button} type="button" disabled={!canAdd} onClick={onAdd}>Добавить место</button>}
    </>
  )
}

export function PartyMultiPlaceServices({ previews, services, orderTypeId, update, canEdit, canPrice, canManageCatalog, onOpenService, showErrors }) {
  return previews.map(({ place, title, lines, duration }) => {
    const changeLine = (lineId, patch) => update(place.id, {
      serviceSelections: place.serviceSelections.map((item) => item.lineId === lineId ? { ...item, ...patch } : item),
    })
    const addService = (id) => {
      if (!id) return
      const service = services.get(id)
      update(place.id, { serviceSelections: [...place.serviceSelections, {
        lineId: crypto.randomUUID(), serviceId: id, quantity: 1,
        ...(service.configuration && { parameters: emptyPartyOrderServiceParameters(service.configuration) }),
      }] })
    }
    const selected = new Set(place.serviceSelections.map((item) => item.serviceId))
    const available = [...services.values()].filter((service) => !selected.has(String(service._id)) &&
      isPartyServiceAvailable(service, { orderTypeId, locationId: place.locationId, placeType: 'company_location' }))
    return (
      <fieldset key={place.id} className={placeGroup}>
        <legend className="font-semibold text-slate-900 [overflow-wrap:anywhere]">{title}</legend>
        {lines.length > 0 && <ul className="divide-y divide-slate-200" aria-label={`Услуги — ${title}`}>
          {lines.map(({ item, selection, service, configuration, parameters, error, unavailable, quantityInvalid }) => (
            <li key={selection.lineId} className="min-w-0 space-y-2 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold [overflow-wrap:anywhere]">{item.title}</p>
                  <p className="text-slate-600">{error ? 'Укажите параметры для расчёта' : `${Number(item.durationMinutes) || 0} мин за выполнение${canPrice ? ` · ${money(Number(item.unitPrice || 0) * 100)}` : ''}`}</p>
                </div>
                {canEdit && <div className="flex flex-wrap gap-2">
                  {canManageCatalog && service && <button type="button" className={button} aria-label={`Редактировать услугу ${item.title}`} onClick={(event) => onOpenService(place.id, selection.serviceId, event.currentTarget)}>Редактировать</button>}
                  <button type="button" className={button} aria-label={`Убрать услугу ${item.title}`} onClick={() => update(place.id, { serviceSelections: place.serviceSelections.filter(({ lineId }) => lineId !== selection.lineId) })}>Убрать</button>
                </div>}
              </div>
              {service?.repeatable || Number(selection.quantity) !== 1 ? <label className="block max-w-44 text-sm">
                Количество выполнений
                <input type="number" className={input} min={1} max={service?.maxQuantity || undefined} step={1} value={selection.quantity} disabled={!canEdit}
                  aria-invalid={showErrors && quantityInvalid || undefined} onChange={(event) => changeLine(selection.lineId, { quantity: event.target.value })} />
              </label> : null}
              {unavailable && <p className="text-sm text-red-800">Услуга недоступна для выбранного места.</p>}
              {quantityInvalid && <p className="text-sm text-red-800">Проверьте число выполнений.</p>}
              {configuration && <PartyOrderServiceParameters title={item.title} configuration={configuration} parameters={parameters} error={error} showError={showErrors} canEdit={canEdit} canPrice={canPrice}
                onChange={(value) => changeLine(selection.lineId, { parameters: value })} />}
            </li>
          ))}
        </ul>}
        {canEdit && (
          <div className="flex flex-wrap items-end gap-2">
            {available.length > 0 && <label className="min-w-0 flex-1 text-sm">
              {`Добавить услугу — ${title}`}
              <select className={`${input} cursor-pointer`} value="" onChange={(event) => addService(event.target.value)}>
                <option value="">Выберите услугу</option>
                {available.map((item) => <option key={String(item._id)} value={String(item._id)}>{item.title}</option>)}
              </select>
            </label>}
            {canManageCatalog && place.locationId && <button className={button} type="button" aria-label={`Создать услугу — ${title}`} onClick={(event) => onOpenService(place.id, null, event.currentTarget)}>Создать услугу</button>}
          </div>
        )}
        {lines.length === 0 && available.length === 0 && <p className="text-sm text-slate-600">Подходящих услуг для этого места нет.</p>}
        {duration > 0 && <p className="text-sm font-medium text-slate-800">Программа · {duration} мин</p>}
      </fieldset>
    )
  })
}

export function PartyMultiPlaceTime({ previews, companyId, orderId, timeZone, refreshKey, onUpdate, canEdit }) {
  const [openPlace, setOpenPlace] = useState(() => previews[0]?.place.id || '')
  const firstStart = previews[0]?.eventDate
  return previews.map((preview, index) => {
    const { place, title, duration, rentalMinutes, dateEnd, timeError, serviceError } = preview
    const chooseStart = (startsAt) => {
      const rental = partyOrderPlaceAt(startsAt, rentalMinutes)
      if (rental) onUpdate(place.id, { rental, eventDate: rental.startsAt, rentalMinutes })
    }
    const open = openPlace === place.id
    return (
      <fieldset className={placeGroup} key={place.id}>
        <legend className="font-semibold text-slate-900 [overflow-wrap:anywhere]">{title}</legend>
        <p className="text-sm text-slate-700">
          {place.rental ? `Аренда · ${dateText(place.rental.startsAt, timeZone)} — ${dateText(place.rental.endsAt, timeZone)}` : 'Время не выбрано'}
        </p>
        {duration > 0 && place.eventDate && <p className="text-sm text-slate-700">Программа · {dateText(place.eventDate, timeZone)} — {dateText(dateEnd, timeZone)}</p>}
        {timeError && <p className="text-sm text-red-800">{timeError}</p>}
        {canEdit && <div className="flex flex-wrap gap-2">
          <button className={button} type="button" aria-expanded={open} onClick={() => setOpenPlace(open ? '' : place.id)}>
            {open ? 'Свернуть календарь' : place.rental ? 'Изменить время' : 'Выбрать время'}
          </button>
          {index > 0 && firstStart && <button className={button} type="button" onClick={() => chooseStart(firstStart)}>То же начало</button>}
        </div>}
        {canEdit && open && <div className="min-w-0 space-y-3">
          <label className="block text-sm">
            Длительность аренды, минут
            <input type="number" min={Math.max(duration, 1)} max={10080} step={1} className={input} value={place.rentalMinutes ?? rentalMinutes}
              onChange={(event) => {
                const minutes = event.target.value
                const rental = partyOrderPlaceAt(place.rental?.startsAt, minutes)
                onUpdate(place.id, { rentalMinutes: minutes, ...(rental ? { rental } : {}) })
              }} />
          </label>
          <PartyOrderAvailabilityPicker
            key={place.locationId}
            companyId={companyId}
            orderId={orderId}
            placeType="company_location"
            locationId={place.locationId}
            durationMinutes={rentalMinutes}
            refreshKey={refreshKey}
            selectedStart={place.rental?.startsAt || place.eventDate}
            timeZone={timeZone}
            disabled={Boolean(serviceError)}
            onSelect={(slot) => onUpdate(place.id, { rental: slot, eventDate: slot.startsAt, rentalMinutes })}
          />
          {place.rental && duration > 0 && <label className="block text-sm">
            Начало программы внутри аренды
            <input type="datetime-local" className={input} value={localValue(place.eventDate, timeZone)} onChange={(event) => {
              const value = event.target.value
              const start = value && partyDateAtTime(value.slice(0, 10), value.slice(11, 16), timeZone)
              if (start && Number.isFinite(+start)) onUpdate(place.id, { eventDate: start.toISOString() })
            }} />
          </label>}
        </div>}
      </fieldset>
    )
  })
}

export function PartyMultiPlaceFinance({ previews, timeZone, canPrice }) {
  return <ul className="divide-y divide-slate-200" aria-label="Расчёт по местам">
    {previews.map(({ place, title, pricingSnapshot }) => (
      <li key={place.id} className="space-y-1.5 py-3 text-sm">
        <p className="font-semibold [overflow-wrap:anywhere]">{title}</p>
        {place.rental && <p className="text-slate-600">{dateText(place.rental.startsAt, timeZone)} — {dateText(place.rental.endsAt, timeZone)}</p>}
        {canPrice && pricingSnapshot && <dl className="space-y-1 tabular-nums">
          <div className="flex justify-between gap-3"><dt>Услуги</dt><dd>{money(pricingSnapshot.servicesKopecks)}</dd></div>
          <div className="flex justify-between gap-3"><dt>Аренда · {pricingSnapshot.billedHours || 0} ч к оплате</dt><dd>{money(pricingSnapshot.rentalKopecks)}</dd></div>
          {Boolean(pricingSnapshot.rentalExtrasKopecks) && <div className="flex justify-between gap-3"><dt>Разовые доплаты</dt><dd>{money(pricingSnapshot.rentalExtrasKopecks)}</dd></div>}
          <div className="flex justify-between gap-3 font-medium"><dt>Подытог</dt><dd>{money(pricingSnapshot.subtotalKopecks)}</dd></div>
        </dl>}
      </li>
    ))}
  </ul>
}
