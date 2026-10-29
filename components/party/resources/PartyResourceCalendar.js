'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import usePartyResourceCalendar from './usePartyResourceCalendar'
import {
  layoutResourceItems,
  normalizeResourcePreference,
  resourceDateKey,
  resourceDateLabel,
  resourceItemHref,
  resourcePeriod,
  resourcePreferenceKey,
  resourceTimeLabel,
  resourceTimeZone,
  shiftResourceDate,
  validResourceDateKey,
} from './resourceCalendarPresentation'

const control =
  'min-h-11 cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:cursor-not-allowed disabled:opacity-50'
const kindNames = {
  order: 'Заказ',
  ticket_session: 'Билетный сеанс',
  inventory: 'Реквизит',
}
const eventTitle = (item) => item.title || kindNames[item.kind] || 'Занято'
const itemDescription = (item, timeZone) =>
  `${eventTitle(item)}, ${resourceDateLabel(item.start, timeZone)} — ${resourceDateLabel(item.end, timeZone)}${item.quantity ? `, количество ${item.quantity}` : ''}${item.conflict ? ', есть пересечение' : ''}${item.confirmationStatus === 'declined' ? ', сотрудник отказался, назначение не снято' : ''}`

export function PartyResourceTimeline({
  resources,
  items,
  period,
  timeZone,
  companyId,
  company,
}) {
  const from = +new Date(period.dateFrom),
    to = +new Date(period.dateTo)
  const width = period.days.length > 1 ? 1680 : 1080
  const percent = (value) => ((+new Date(value) - from) / (to - from)) * 100
  return (
    <div className="hidden md:block">
      <div
        className="max-h-[40rem] overflow-auto rounded-xl border border-slate-200 bg-white"
        tabIndex={0}
        aria-label="Временная шкала ресурсов"
      >
        <div style={{ minWidth: width + 176 }}>
          <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-slate-50">
            <div className="sticky left-0 z-30 w-44 shrink-0 bg-slate-50 p-3 text-sm font-semibold text-slate-600">
              Ресурс
            </div>
            <div className="relative h-14 flex-1">
              {period.days.map((day) => (
                <div
                  key={day.key}
                  className="absolute top-0 h-full border-l border-slate-200 px-2 py-2 text-xs text-slate-600"
                  style={{
                    left: `${percent(day.start)}%`,
                    width: `${percent(day.end) - percent(day.start)}%`,
                  }}
                >
                  {resourceDateLabel(day.start, timeZone, false)}
                </div>
              ))}
              {period.days.length === 1
                ? Array.from({ length: 12 }, (_, index) => {
                    const instant = new Date(from + ((to - from) * index) / 12)
                    return (
                      <span
                        key={index}
                        className="absolute bottom-1 text-[10px] text-slate-500"
                        style={{ left: `${(index * 100) / 12}%` }}
                      >
                        {resourceTimeLabel(instant, timeZone)}
                      </span>
                    )
                  })
                : null}
            </div>
          </div>
          {resources.map((resource) => {
            const layout = layoutResourceItems(
              items.filter((item) => item.resourceId === resource.id),
              period.dateFrom,
              period.dateTo
            )
            return (
              <div
                key={resource.id}
                className="flex border-b border-slate-100 last:border-b-0"
                style={{ minHeight: layout.laneCount * 54 + 12 }}
              >
                <div className="sticky left-0 z-10 w-44 shrink-0 border-r border-slate-200 bg-white p-3">
                  <p className="text-sm font-semibold break-words text-slate-800">
                    {resource.title}
                  </p>
                  {resource.capacity != null ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {resource.type === 'inventory'
                        ? 'Доступно по справочнику'
                        : 'Вместимость'}
                      : {resource.capacity}
                      {resource.unit ? ` ${resource.unit}` : ''}
                    </p>
                  ) : null}
                  {resource.usageMode ? (
                    <p className="mt-1 text-xs text-slate-500">
                      {resource.usageMode === 'shared'
                        ? 'Совместное использование'
                        : 'Отдельное бронирование'}
                    </p>
                  ) : null}
                  {resource.status && resource.status !== 'active' ? (
                    <p className="mt-1 text-xs text-amber-700">
                      {resource.status === 'paused'
                        ? 'Приостановлен'
                        : resource.status === 'invited'
                          ? 'Приглашён'
                          : 'Неактивен'}
                    </p>
                  ) : null}
                </div>
                <div className="relative flex-1">
                  {period.days.map((day) => (
                    <div
                      key={day.key}
                      className="pointer-events-none absolute top-0 bottom-0 border-l border-slate-100"
                      style={{ left: `${percent(day.start)}%` }}
                    />
                  ))}
                  {layout.intervals.map((item) => {
                    const occupiedStart = +new Date(
                        item.occupiedFrom || item.start
                      ),
                      occupiedEnd = +new Date(item.occupiedUntil || item.end)
                    const bodyStart = Math.max(
                        occupiedStart,
                        +new Date(item.start)
                      ),
                      bodyEnd = Math.min(occupiedEnd, +new Date(item.end))
                    const buffered =
                      occupiedStart < bodyStart || occupiedEnd > bodyEnd
                    const href = resourceItemHref(item, companyId, company)
                    const className = `absolute top-0 h-11 overflow-hidden rounded-md border text-left text-xs ${item.conflict ? 'border-red-300 bg-red-50 text-red-900' : 'border-sky-300 bg-sky-50 text-sky-950'}`
                    const content = (
                      <>
                        {buffered ? (
                          <span
                            className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent,transparent_4px,#cbd5e1_4px,#cbd5e1_5px)]"
                            aria-hidden="true"
                          />
                        ) : null}
                        <span
                          className="pointer-events-none absolute top-0 bottom-0 bg-sky-100/90"
                          aria-hidden="true"
                          style={{
                            left: `${item.bodyLeft}%`,
                            width: `${item.bodyWidth}%`,
                          }}
                        />
                        <span className="relative block truncate px-1 py-1 font-semibold">
                          {eventTitle(item)}
                        </span>
                        <span className="relative block truncate px-1 text-[10px]">
                          {resourceTimeLabel(item.start, timeZone)} —{' '}
                          {resourceTimeLabel(item.end, timeZone)}
                          {item.quantity ? ` · ${item.quantity}` : ''}
                          {item.conflict ? ' · Пересечение' : ''}
                          {item.confirmationStatus === 'declined'
                            ? ' · Отказ'
                            : ''}
                        </span>
                      </>
                    )
                    const props = {
                      className: `${className} ${href ? 'cursor-pointer hover:border-sky-600 focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-sky-700' : ''}`,
                      style: {
                        left: `${item.left}%`,
                        width: `${item.width}%`,
                        minWidth: 2,
                        top: item.lane * 54 + 6,
                      },
                      title: itemDescription(item, timeZone),
                      'aria-label': itemDescription(item, timeZone),
                    }
                    return href ? (
                      <Link key={item.id} href={href} {...props}>
                        {content}
                      </Link>
                    ) : (
                      <div key={item.id} {...props}>
                        {content}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Полоса показывает занятость; штриховка — подготовку и уборку.
        Пересекающиеся интервалы расположены рядом. Короткие записи удобнее
        открыть в повестке.
      </p>
    </div>
  )
}

export function PartyResourceAgenda({
  resources,
  items,
  period,
  timeZone,
  companyId,
  company,
}) {
  const resourceNames = new Map(
    resources.map((resource) => [resource.id, resource.title])
  )
  return (
    <div className="space-y-4" aria-label="Повестка ресурсов">
      {period.days.map((day) => {
        const dayItems = items
          .filter(
            (item) =>
              +new Date(item.occupiedFrom || item.start) < +new Date(day.end) &&
              +new Date(item.occupiedUntil || item.end) > +new Date(day.start)
          )
          .sort(
            (a, b) =>
              +new Date(a.start) - +new Date(b.start) ||
              String(a.id).localeCompare(String(b.id))
          )
        if (!dayItems.length) return null
        return (
          <section key={day.key} className="space-y-2">
            <h3 className="text-sm font-semibold text-slate-700">
              {resourceDateLabel(day.start, timeZone, false)}
            </h3>
            <div className="grid gap-2 lg:grid-cols-2">
              {dayItems.map((item) => {
                const href = resourceItemHref(item, companyId, company)
                const contents = (
                  <>
                    <p className="text-xs font-semibold text-slate-500">
                      {resourceNames.get(item.resourceId) || 'Ресурс'}
                    </p>
                    <p className="font-semibold break-words text-slate-900">
                      {eventTitle(item)}
                    </p>
                    <p className="text-sm text-slate-600">
                      {resourceDateLabel(item.start, timeZone)} —{' '}
                      {resourceDateLabel(item.end, timeZone)}
                    </p>
                    {item.quantity ? (
                      <p className="text-sm text-slate-600">
                        Количество: {item.quantity}
                      </p>
                    ) : null}
                    {item.bufferBeforeMinutes || item.bufferAfterMinutes ? (
                      <p className="text-xs text-slate-500">
                        Подготовка: {item.bufferBeforeMinutes || 0} мин ·
                        Уборка: {item.bufferAfterMinutes || 0} мин
                      </p>
                    ) : null}
                    {item.conflict ? (
                      <p className="text-sm font-semibold text-red-700">
                        Есть пересечение занятости
                      </p>
                    ) : null}
                    {item.confirmationStatus === 'declined' ? (
                      <p className="text-sm font-semibold text-amber-800">
                        Сотрудник отказался. Назначение пока не снято и
                        учитывается при проверке занятости.
                      </p>
                    ) : null}
                    {href ? (
                      <p className="text-xs font-semibold text-sky-700">
                        {item.kind === 'ticket_session'
                          ? 'Открыть сеанс →'
                          : 'Открыть заказ →'}
                      </p>
                    ) : null}
                  </>
                )
                const className = `block min-w-0 space-y-1 rounded-xl border p-3 ${item.conflict ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`
                return href ? (
                  <Link
                    key={item.id}
                    href={href}
                    className={`${className} min-h-11 cursor-pointer hover:border-sky-400`}
                  >
                    {contents}
                  </Link>
                ) : (
                  <div key={item.id} className={className}>
                    {contents}
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

export function PartyResourceCalendarContent({
  data,
  period,
  timeZone,
  resourceId = '',
  presentation = 'timeline',
  companyId,
  company,
}) {
  const resources = data.resources.filter(
    (resource) => !resourceId || resource.id === resourceId
  )
  const ids = new Set(resources.map((resource) => resource.id))
  const items = data.items.filter((item) => ids.has(item.resourceId))
  const limited = data.partial || data.hasMore
  return (
    <div className="space-y-3">
      <p className="rounded-lg bg-sky-50 p-3 text-sm text-sky-900">
        {data.notice ||
          'Показаны доступные вам данные. Окончательная доступность проверяется при сохранении заказа.'}
      </p>
      {data.intervalNotice ? (
        <p className="text-sm text-slate-600">{data.intervalNotice}</p>
      ) : null}
      {limited ? (
        <p
          role="status"
          className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Показана часть данных. Сократите период или найдите ресурс по
          названию. По этому календарю нельзя подтвердить свободное время.
        </p>
      ) : null}
      <p className="text-xs text-slate-500">
        Показано ресурсов: {resources.length}
        {limited ? '+' : ''} · Интервалов: {items.length}
        {limited ? '+' : ''}
      </p>
      {!resources.length ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          Нет доступных ресурсов по выбранным условиям.
        </p>
      ) : !items.length ? (
        <p className="rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-600">
          В доступных данных периода интервалов нет. Это не подтверждает
          свободное время.
        </p>
      ) : null}
      {resources.length && presentation === 'timeline' ? (
        <PartyResourceTimeline
          resources={resources}
          items={items}
          period={period}
          timeZone={timeZone}
          companyId={companyId}
          company={company}
        />
      ) : null}
      <div className={presentation === 'timeline' ? 'md:hidden' : ''}>
        <PartyResourceAgenda
          resources={resources}
          items={items}
          period={period}
          timeZone={timeZone}
          companyId={companyId}
          company={company}
        />
      </div>
    </div>
  )
}

export default function PartyResourceCalendar({
  company,
  companyRoute = false,
}) {
  const [controls, setControls] = useState({
    ready: false,
    type: '',
    dateKey: '',
    view: 'day',
    presentation: 'timeline',
    timeZone: resourceTimeZone(company.timeZone),
  })
  const [resourceId, setResourceId] = useState('')
  const [resourceSearchInput, setResourceSearchInput] = useState('')
  const [resourceSearch, setResourceSearch] = useState('')
  const initialized = useRef(false)
  const storageKey = resourcePreferenceKey(company.id, company.preferenceId)
  useEffect(() => {
    if (initialized.current) return
    const frame = requestAnimationFrame(() => {
      initialized.current = true
      let stored = null
      try {
        stored = JSON.parse(window.localStorage.getItem(storageKey))
      } catch {}
      const timeZone = resourceTimeZone(company.timeZone)
      setControls({
        ...normalizeResourcePreference(stored, company.resourceTypes),
        ready: true,
        timeZone,
        dateKey: resourceDateKey(new Date(), timeZone),
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [company, storageKey])
  const typeAllowed = (company.resourceTypes || []).some(
    (type) => type.id === controls.type
  )
  useEffect(() => {
    if (!controls.ready || typeAllowed) return
    const frame = requestAnimationFrame(() => {
      setControls((previous) => ({
        ...previous,
        type: company.resourceTypes?.[0]?.id || '',
      }))
      setResourceId('')
      setResourceSearchInput('')
      setResourceSearch('')
    })
    return () => cancelAnimationFrame(frame)
  }, [company.resourceTypes, controls.ready, typeAllowed])
  useEffect(() => {
    const timer = setTimeout(
      () => setResourceSearch(resourceSearchInput.trim()),
      200
    )
    return () => clearTimeout(timer)
  }, [resourceSearchInput])
  const waitingForSearch = resourceSearchInput.trim() !== resourceSearch
  const period = useMemo(
    () => resourcePeriod(controls.dateKey, controls.view, controls.timeZone),
    [controls.dateKey, controls.view, controls.timeZone]
  )
  const result = usePartyResourceCalendar({
    companyId: company.id,
    type: typeAllowed ? controls.type : '',
    dateFrom: period?.dateFrom,
    dateTo: period?.dateTo,
    resourceSearch,
    accessVersion: company.accessVersion || '',
    enabled: controls.ready && typeAllowed && !waitingForSearch,
  })
  useEffect(() => {
    if (
      !result.data?.timeZone ||
      resourceTimeZone(result.data.timeZone) === controls.timeZone
    )
      return
    const frame = requestAnimationFrame(() =>
      setControls((previous) => ({
        ...previous,
        timeZone: resourceTimeZone(result.data.timeZone),
      }))
    )
    return () => cancelAnimationFrame(frame)
  }, [result.data, controls.timeZone])
  const change = (patch) => {
    const next = { ...controls, ...patch }
    setControls(next)
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({
          type: next.type,
          view: next.view,
          presentation: next.presentation,
        })
      )
    } catch {}
    if (patch.type) {
      setResourceId('')
      setResourceSearchInput('')
      setResourceSearch('')
    }
  }
  const types = result.data?.resourceTypes
    ? result.data.resourceTypes.filter((type) =>
        company.resourceTypes?.some((allowed) => allowed.id === type.id)
      )
    : company.resourceTypes || []
  const loading =
    !controls.ready || !typeAllowed || waitingForSearch || result.busy
  const selectedResource = result.data?.resources.some(
    (resource) => resource.id === resourceId
  )
    ? resourceId
    : ''
  return (
    <section
      className="min-w-0 space-y-4"
      aria-label="Календарь ресурсов"
      aria-busy={loading}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-sky-950">Календарь ресурсов</h1>
          <p className="mt-1 text-sm text-slate-500">
            Занятость доступных вам ресурсов.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Часовой пояс компании: {controls.timeZone}
          </p>
        </div>
        <button
          type="button"
          className={control}
          disabled={loading}
          onClick={result.reload}
        >
          Обновить
        </button>
      </header>
      {controls.ready ? (
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-40 flex-1 text-xs font-semibold text-slate-600">
            Ресурсы
            <select
              aria-label="Вид ресурсов"
              className={`${control} mt-1 block w-full`}
              value={controls.type}
              onChange={(event) => change({ type: event.target.value })}
            >
              {types.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.title}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-40 flex-1 text-xs font-semibold text-slate-600">
            Найти ресурс
            <input
              type="search"
              aria-label="Найти ресурс"
              placeholder="По названию или имени"
              maxLength={120}
              className={`${control} mt-1 block w-full`}
              value={resourceSearchInput}
              onChange={(event) => {
                setResourceSearchInput(event.target.value.slice(0, 120))
                setResourceId('')
              }}
            />
          </label>
          <label className="min-w-40 flex-1 text-xs font-semibold text-slate-600">
            Показать
            <select
              aria-label="Конкретный ресурс"
              className={`${control} mt-1 block w-full`}
              value={selectedResource}
              disabled={!result.data}
              onChange={(event) => setResourceId(event.target.value)}
            >
              <option value="">Все ресурсы</option>
              {(result.data?.resources || []).map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-slate-600">
            Дата
            <input
              aria-label="Дата календаря ресурсов"
              type="date"
              className={`${control} mt-1 block`}
              value={controls.dateKey}
              onChange={(event) => {
                if (validResourceDateKey(event.target.value))
                  change({ dateKey: event.target.value })
              }}
            />
          </label>
          <div
            className="flex gap-1"
            role="group"
            aria-label="Период календаря ресурсов"
          >
            {['day', 'week'].map((view) => (
              <button
                key={view}
                type="button"
                className={`${control} ${controls.view === view ? 'border-sky-500 bg-sky-50 font-semibold text-sky-900' : ''}`}
                aria-pressed={controls.view === view}
                onClick={() => change({ view })}
              >
                {view === 'day' ? 'День' : 'Неделя'}
              </button>
            ))}
          </div>
          <div
            className="hidden gap-1 md:flex"
            role="group"
            aria-label="Представление календаря ресурсов"
          >
            {['timeline', 'agenda'].map((presentation) => (
              <button
                key={presentation}
                type="button"
                className={`${control} ${controls.presentation === presentation ? 'border-sky-500 bg-sky-50 font-semibold text-sky-900' : ''}`}
                aria-pressed={controls.presentation === presentation}
                onClick={() => change({ presentation })}
              >
                {presentation === 'timeline' ? 'Шкала' : 'Повестка'}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {period ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Предыдущий период"
            className={control}
            onClick={() =>
              change({
                dateKey: shiftResourceDate(
                  controls.dateKey,
                  controls.view === 'week' ? -7 : -1
                ),
              })
            }
          >
            ←
          </button>
          <button
            type="button"
            className={control}
            onClick={() =>
              change({
                dateKey: resourceDateKey(new Date(), controls.timeZone),
              })
            }
          >
            Сегодня
          </button>
          <button
            type="button"
            aria-label="Следующий период"
            className={control}
            onClick={() =>
              change({
                dateKey: shiftResourceDate(
                  controls.dateKey,
                  controls.view === 'week' ? 7 : 1
                ),
              })
            }
          >
            →
          </button>
          <p className="text-sm font-semibold text-slate-700">
            {resourceDateLabel(period.dateFrom, controls.timeZone, false)}
            {controls.view === 'week'
              ? ` — ${resourceDateLabel(period.days.at(-1).start, controls.timeZone, false)}`
              : ''}
          </p>
        </div>
      ) : null}
      {loading ? (
        <p
          role="status"
          className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500"
        >
          Загружаем доступную занятость…
        </p>
      ) : result.error ? (
        <div
          role="alert"
          className="space-y-3 rounded-lg bg-red-50 p-4 text-sm text-red-800"
        >
          <p>{result.error}</p>
          <button type="button" className={control} onClick={result.reload}>
            Повторить загрузку
          </button>
        </div>
      ) : result.data && period ? (
        <PartyResourceCalendarContent
          data={result.data}
          period={period}
          timeZone={controls.timeZone}
          resourceId={selectedResource}
          presentation={controls.presentation}
          companyId={company.id}
          company={companyRoute}
        />
      ) : null}
    </section>
  )
}
