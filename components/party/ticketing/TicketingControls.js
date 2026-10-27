'use client'

import { ticketButton, ticketControl } from './ticketingUi'

export function TicketField({ label, children }) {
  return (
    <label className="block min-w-0 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  )
}
export function TicketError({ children }) {
  return children ? (
    <p
      role="alert"
      className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
    >
      {children}
    </p>
  ) : null
}
export function TicketPager({ list }) {
  return (
    <div className="space-y-2">
      <TicketError>{list.error}</TicketError>
      {list.busy ? (
        <p role="status" className="text-sm text-slate-500">
          Загружаем…
        </p>
      ) : null}
      {list.nextCursor ? (
        <button
          type="button"
          className={ticketButton + ' w-full'}
          disabled={list.busy}
          onClick={list.more}
        >
          {list.error ? 'Повторить загрузку' : 'Показать ещё'}
        </button>
      ) : list.error ? (
        <button type="button" className={ticketButton} onClick={list.reload}>
          Повторить загрузку
        </button>
      ) : null}
    </div>
  )
}
export function TicketLocationSelect({
  locations,
  value,
  onChange,
  disabled,
  emptyLabel = 'Без площадки',
}) {
  return (
    <TicketField label="Площадка">
      <select
        className={ticketControl + ' cursor-pointer'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="">{emptyLabel}</option>
        {value &&
        !locations.some(
          (location) => String(location._id) === String(value)
        ) ? (
          <option value={value}>Сохранённая площадка</option>
        ) : null}
        {locations.map((location) => (
          <option key={location._id} value={String(location._id)}>
            {location.title}
          </option>
        ))}
      </select>
    </TicketField>
  )
}
