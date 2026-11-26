'use client'

import { faChevronDown } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { useId, useState } from 'react'

const INTEGRATION_INDICATOR_VIEW = {
  connected: {
    className: 'bg-emerald-500 ring-4 ring-emerald-100',
    label: 'Интеграция подключена',
  },
  disconnected: {
    className: 'bg-slate-300 ring-4 ring-slate-100',
    label: 'Интеграция не подключена',
  },
  warning: {
    className: 'bg-amber-400 ring-4 ring-amber-100',
    label: 'Интеграция требует внимания',
  },
  loading: {
    className: 'animate-pulse bg-slate-300 ring-4 ring-slate-100',
    label: 'Проверяем состояние интеграции',
  },
}

export default function PartyIntegrationCard({
  title,
  description,
  children,
  note = '',
  locked = false,
  indicatorState = 'disconnected',
  keepMounted = false,
}) {
  const [open, setOpen] = useState(false)
  const contentId = useId()
  const indicator =
    INTEGRATION_INDICATOR_VIEW[indicatorState] ||
    INTEGRATION_INDICATOR_VIEW.disconnected

  return (
    <section
      className={`overflow-hidden rounded-2xl border ${
        locked ? 'border-amber-200 bg-amber-50' : 'border-sky-100 bg-white'
      }`}
    >
      <button
        type="button"
        aria-controls={contentId}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-20 w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left transition hover:bg-sky-50/70"
      >
        <span className="flex min-w-0 items-center gap-4">
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${indicator.className}`}
            aria-hidden="true"
          />
          <span className="min-w-0">
            <span className="block text-base font-semibold text-slate-900">
              {title}
            </span>
            <span className="mt-1 block text-sm leading-5 text-slate-500">
              {description}
            </span>
            <span className="sr-only">{indicator.label}</span>
          </span>
        </span>
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`h-4 w-4 shrink-0 text-sky-600 transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>
      {open || keepMounted ? (
        <div id={contentId} hidden={!open} className="border-t border-sky-100 px-5 py-4">
          {locked ? (
            <div className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs leading-5 text-amber-900">
              Недоступно на текущем тарифе компании.
            </div>
          ) : null}
          {note ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
              {note}
            </div>
          ) : null}
          <div
            className={
              locked
                ? 'pointer-events-none mt-4 grid gap-3 opacity-50'
                : 'grid gap-3'
            }
          >
            {children}
          </div>
        </div>
      ) : null}
    </section>
  )
}
