'use client'

import cn from 'classnames'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  buildMonthDays,
  calculateDateRangePanelPosition,
  formatDateRangeLabel,
  getNextWeekendRange,
  isDateInRange,
  isDateRangeEdge,
  MONTHS_FULL,
  normalizeRangeByDate,
  toDateInputValue,
  WEEKDAY_LABELS,
} from '@helpers/transactionDateRange'

const EMPTY_RANGE = { from: '', to: '' }

const buildInitialCursorDate = (value) => {
  const selectedKey = value?.from || toDateInputValue(new Date())
  const [year, month] = selectedKey.split('-').map(Number)
  if (year && month) {
    return new Date(year, month - 1, 1)
  }
  const today = new Date()
  return new Date(today.getFullYear(), today.getMonth(), 1)
}

const TransactionDateRangeFilter = ({
  value = EMPTY_RANGE,
  onChange,
  activeDateKeys,
}) => {
  const [open, setOpen] = useState(false)
  const [draftRange, setDraftRange] = useState(value)
  const [cursorDate, setCursorDate] = useState(() =>
    buildInitialCursorDate(value)
  )
  const [panelPosition, setPanelPosition] = useState(null)
  const panelRef = useRef(null)
  const buttonRef = useRef(null)

  const updatePanelPosition = useCallback(() => {
    if (typeof window === 'undefined' || !buttonRef.current) return
    setPanelPosition(
      calculateDateRangePanelPosition({
        buttonRect: buttonRef.current.getBoundingClientRect(),
        viewportWidth: window.innerWidth,
      })
    )
  }, [])

  useEffect(() => {
    if (!open) return undefined

    const onClickOutside = (event) => {
      const target = event.target
      const clickedPanel = panelRef.current && panelRef.current.contains(target)
      const clickedButton =
        buttonRef.current && buttonRef.current.contains(target)
      if (!clickedPanel && !clickedButton) setOpen(false)
    }

    document.addEventListener('mousedown', onClickOutside)
    window.addEventListener('resize', updatePanelPosition)
    window.addEventListener('scroll', updatePanelPosition, true)

    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      window.removeEventListener('resize', updatePanelPosition)
      window.removeEventListener('scroll', updatePanelPosition, true)
    }
  }, [open, updatePanelPosition])

  const calendarDays = useMemo(() => buildMonthDays(cursorDate), [cursorDate])
  const monthLabel = `${MONTHS_FULL[cursorDate.getMonth()]} ${cursorDate.getFullYear()}`
  const active = Boolean(value?.from)
  const buttonLabel = formatDateRangeLabel(value)
  const draftLabel = draftRange?.from
    ? formatDateRangeLabel(draftRange)
    : 'Выберите дату или диапазон'

  const toggleOpen = () => {
    setOpen((state) => {
      if (!state) {
        setDraftRange(value)
        setCursorDate(buildInitialCursorDate(value))
        updatePanelPosition()
      }
      return !state
    })
  }

  const applyRange = () => {
    onChange?.(draftRange)
    setOpen(false)
  }

  const resetRange = () => {
    setDraftRange(EMPTY_RANGE)
    onChange?.(EMPTY_RANGE)
    setOpen(false)
  }

  const setToday = () => {
    const today = toDateInputValue(new Date())
    setDraftRange({ from: today, to: today })
  }

  const setTomorrow = () => {
    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    const value = toDateInputValue(tomorrow)
    setDraftRange({ from: value, to: value })
  }

  const calendarPanel = (
    <div
      ref={panelRef}
      style={{
        left: panelPosition?.left ?? 12,
        top: panelPosition?.top ?? 48,
        width: panelPosition?.width ?? 'calc(100vw - 1.5rem)',
      }}
      className="tablet:p-4 fixed z-50 max-h-[calc(100vh-5rem)] origin-top overflow-y-auto rounded-2xl border border-blue-100 bg-white p-3 shadow-[0_18px_36px_rgba(15,23,42,0.16)] transition-all duration-150"
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0 text-base leading-5 font-bold text-slate-900">
          {draftLabel}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 text-lg text-blue-600 hover:bg-blue-50"
            onClick={() =>
              setCursorDate(
                (state) =>
                  new Date(state.getFullYear(), state.getMonth() - 1, 1)
              )
            }
          >
            ←
          </button>
          <div className="min-w-[120px] text-center text-sm font-bold tracking-[0.08em] text-slate-900 uppercase">
            {monthLabel}
          </div>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-blue-200 text-lg text-blue-600 hover:bg-blue-50"
            onClick={() =>
              setCursorDate(
                (state) =>
                  new Date(state.getFullYear(), state.getMonth() + 1, 1)
              )
            }
          >
            →
          </button>
        </div>
      </div>

      <div className="tablet:gap-2 mb-2 grid grid-cols-7 gap-1.5">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="rounded-lg bg-blue-50 py-2 text-center text-xs font-semibold text-blue-700"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="tablet:gap-2 grid grid-cols-7 gap-1.5">
        {calendarDays.map((day, index) => {
          if (day === null) {
            return (
              <div
                key={`empty-${index}`}
                className="h-10 rounded-lg border border-transparent"
              />
            )
          }

          const date = new Date(
            cursorDate.getFullYear(),
            cursorDate.getMonth(),
            day
          )
          const key = toDateInputValue(date)
          const selected = isDateInRange(date, draftRange)
          const edge = isDateRangeEdge(date, draftRange)
          const hasTransactions = activeDateKeys?.has(key)

          return (
            <button
              key={`${cursorDate.getFullYear()}-${cursorDate.getMonth()}-${day}`}
              type="button"
              onClick={() =>
                setDraftRange((state) => normalizeRangeByDate(state, date))
              }
              className={cn(
                'flex h-10 w-full items-center justify-center rounded-lg border text-sm transition-colors',
                selected
                  ? 'border-blue-500 bg-blue-500/75 text-white'
                  : 'border-transparent bg-slate-100 text-slate-700 hover:bg-slate-200',
                edge && 'border-blue-600 bg-blue-600 font-bold text-white',
                !selected &&
                  hasTransactions &&
                  'border-blue-300 bg-blue-50 font-semibold text-blue-700 hover:bg-blue-100'
              )}
            >
              {day}
            </button>
          )
        })}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
          onClick={setToday}
        >
          Сегодня
        </button>
        <button
          type="button"
          className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
          onClick={setTomorrow}
        >
          Завтра
        </button>
        <button
          type="button"
          className="rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
          onClick={() => setDraftRange(getNextWeekendRange())}
        >
          В выходные
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            className="rounded-full bg-slate-100 px-5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-200"
            onClick={resetRange}
          >
            Сбросить
          </button>
          <button
            type="button"
            className="rounded-full bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            onClick={applyRange}
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className={cn(
          'inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm font-semibold whitespace-nowrap transition-colors',
          active
            ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700'
            : 'border-blue-200 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700'
        )}
        onClick={toggleOpen}
      >
        {buttonLabel}
      </button>
      {open && typeof document !== 'undefined'
        ? createPortal(calendarPanel, document.body)
        : null}
    </div>
  )
}

export default TransactionDateRangeFilter
