'use client'

import { useId, useRef, useState } from 'react'
import Link from 'next/link'
import {
  partyTodayDate,
  partyTodayHref,
  partyTodayPhoneHref,
} from '@helpers/partyTodayPresentation'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import usePartyToday from './usePartyToday'

const button =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50'

const primaryButton =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-sky-700 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 disabled:cursor-not-allowed disabled:opacity-50'

const getDashboardSections = (sections, widgetIds) =>
  widgetIds === null
    ? sections
    : widgetIds.flatMap(
        (id) => sections.find((section) => section.id === id) || []
      )

function TodayIndicators({ sections, activeId, controls, onSelect }) {
  return (
    <div
      role="group"
      aria-label="Показатели"
      className="grid min-w-0 grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4"
    >
      {sections.map((section) => {
        const count = section.items?.length ?? 0
        const limited = section.partial || section.hasMore
        const unavailable = section.error || (limited && count === 0)
        return (
          <button
            key={section.id}
            type="button"
            aria-controls={controls}
            aria-pressed={activeId === section.id}
            className={`flex min-h-24 min-w-0 cursor-pointer flex-col items-start justify-between gap-2 rounded-xl border p-3 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${activeId === section.id ? 'border-sky-400 bg-sky-50' : 'border-slate-200 bg-white hover:bg-sky-50'}`}
            onClick={() => onSelect(section.id)}
          >
            <span className="text-sm leading-snug font-semibold break-words text-sky-950">
              {section.title}
            </span>
            <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-xl leading-none font-semibold text-slate-950 tabular-nums">
                {unavailable ? '—' : count}
              </span>
              {section.error || limited ? (
                <span
                  className={`text-xs ${section.error ? 'text-red-700' : 'text-amber-900'}`}
                >
                  {section.error ? 'Ошибка загрузки' : 'Список неполный'}
                </span>
              ) : null}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function TodayWidgetSettings({
  id,
  editorRef,
  sections,
  draft,
  changed,
  busy,
  error,
  onChange,
  onSave,
  onClose,
}) {
  const chosen = new Set(draft ?? sections.map((section) => section.id))
  return (
    <form
      id={id}
      className="rounded-xl border border-slate-200 bg-white p-4"
      onSubmit={onSave}
    >
      <fieldset aria-label="Показатели дашборда" disabled={busy}>
        <legend className="font-semibold text-sky-950">
          Что показывать на дашборде
        </legend>
        <p className="mt-1 text-sm text-slate-600">
          Выбор сохранится для вас в этой компании.
        </p>
        <div
          ref={editorRef}
          className="mt-3 grid min-w-0 gap-x-5 sm:grid-cols-2"
        >
          {sections.map((section) => (
            <label
              key={section.id}
              className="flex min-h-11 cursor-pointer items-center gap-2 py-1 text-sm break-words text-slate-800"
            >
              <input
                type="checkbox"
                checked={chosen.has(section.id)}
                className="h-4 w-4 shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                onChange={(event) => {
                  const next = new Set(chosen)
                  if (event.target.checked) next.add(section.id)
                  else next.delete(section.id)
                  onChange([...next])
                }}
              />
              {section.title}
            </label>
          ))}
        </div>
      </fieldset>
      {error ? (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="submit"
          className={primaryButton}
          disabled={busy || !changed}
        >
          {busy ? 'Сохраняем…' : 'Сохранить'}
        </button>
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={onClose}
        >
          Отмена
        </button>
        <button
          type="button"
          className={button}
          disabled={busy || draft === null}
          onClick={() => onChange(null)}
        >
          Стандартный набор
        </button>
      </div>
    </form>
  )
}

export function PartyTodaySections({
  data,
  companyId,
  company = false,
  filter = 'all',
  showEmpty = false,
}) {
  const sections = data.sections.filter(
    (section) => filter === 'all' || section.id === filter
  )
  const visible = sections.filter(
    (section) =>
      showEmpty || section.items?.length || section.error || section.partial
  )
  return (
    <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
      {!visible.length ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900 xl:col-span-2"
        >
          По проверенным условиям действий нет. Другие заказы и задачи доступны
          в соответствующих разделах.
        </p>
      ) : null}
      {visible.map((section) => {
        const sectionHref = partyTodayHref(section.href, companyId, company)
        return (
          <section
            key={section.id}
            aria-labelledby={`today-${section.id}`}
            className="min-w-0 rounded-xl border border-slate-200 bg-white"
          >
            <header className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 p-4">
              <div className="min-w-0 flex-1">
                <h2
                  id={`today-${section.id}`}
                  className="font-semibold text-sky-950"
                >
                  {section.title}
                </h2>
                {section.description ? (
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">
                    {section.description}
                  </p>
                ) : null}
              </div>
              {!section.error ? (
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-600">
                  Показано {section.items?.length || 0}
                  {section.hasMore || section.partial ? '+' : ''}
                </span>
              ) : null}
            </header>
            {section.error ? (
              <p
                role="alert"
                className="m-3 rounded-lg bg-red-50 p-3 text-sm text-red-800"
              >
                {section.error}
              </p>
            ) : null}
            {section.partial ? (
              <p className="m-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">
                Проверена часть записей. Продолжить работу можно в
                соответствующем разделе.
              </p>
            ) : null}
            {!section.error && !section.items?.length && !section.partial ? (
              <p className="p-4 text-sm text-slate-500">
                {section.emptyText || 'По этим условиям действий нет.'}
              </p>
            ) : null}
            <div className="divide-y divide-slate-100 px-4">
              {(section.items || []).map((item) => {
                const href = partyTodayHref(item.href, companyId, company)
                const phoneHref = partyTodayPhoneHref(item.phone)
                return (
                  <article
                    key={`${item.kind}:${item.id}`}
                    className="min-w-0 py-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <h3 className="min-w-0 flex-1 font-semibold break-words text-slate-900">
                        {item.title}
                      </h3>
                      {item.overdue ? (
                        <span className="rounded-full bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
                          Просрочено
                        </span>
                      ) : null}
                    </div>
                    {item.clientName ? (
                      <p className="mt-1 text-xs break-words text-slate-500">
                        {item.clientName}
                      </p>
                    ) : null}
                    <p className="mt-1 text-sm break-words text-slate-600">
                      {item.reason}
                    </p>
                    {item.dueAt || item.eventDate ? (
                      <p
                        className={`mt-1 text-xs ${item.overdue ? 'text-red-700' : 'text-slate-500'}`}
                      >
                        {item.dueAt ? 'Срок: ' : 'Мероприятие: '}
                        {partyTodayDate(
                          item.dueAt || item.eventDate,
                          data.timeZone
                        )}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {href ? (
                        <Link href={href} className={button}>
                          {item.kind === 'task'
                            ? 'Открыть задачу'
                            : item.kind === 'inbox'
                              ? 'Открыть обращения'
                              : 'Открыть заказ'}
                        </Link>
                      ) : null}
                      {phoneHref ? (
                        <a
                          href={phoneHref}
                          aria-label={`Позвонить: ${item.title}`}
                          className={`${button} border-slate-200 text-slate-700`}
                        >
                          Позвонить
                        </a>
                      ) : null}
                    </div>
                  </article>
                )
              })}
            </div>
            {sectionHref ? (
              <div className="border-t border-slate-100 px-4 py-2">
                <Link
                  href={sectionHref}
                  className="inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-sky-800 underline underline-offset-4"
                >
                  Перейти в раздел →
                </Link>
              </div>
            ) : null}
          </section>
        )
      })}
    </div>
  )
}

export default function PartyToday({ companyId, company = false }) {
  const { data, busy, error, reload, saveWidgets } = usePartyToday(companyId)
  const [filter, setFilter] = useState('all')
  const [showEmpty, setShowEmpty] = useState(false)
  const [draft, setDraft] = useState(undefined)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saved, setSaved] = useState(false)
  const trigger = useRef(null)
  const editor = useRef(null)
  const details = useRef(null)
  const settingsId = useId()
  const detailsId = useId()
  const widgetIds = data?.widgetIds ?? null
  const sections = getDashboardSections(data?.sections ?? [], widgetIds)
  const editing = draft !== undefined && data?.canCustomizeWidgets === true
  const changed = editing && JSON.stringify(draft) !== JSON.stringify(widgetIds)
  usePartyUnsavedChanges(changed, {
    label: 'настройка дашборда',
    scope: companyId,
    pending: saving,
  })
  const actualFilter =
    filter === 'all' || sections.some((section) => section.id === filter)
      ? filter
      : 'all'
  const closeSettings = () => {
    setDraft(undefined)
    setSaveError('')
    trigger.current?.focus()
  }
  const openSettings = () => {
    setDraft(widgetIds)
    setSaved(false)
    requestAnimationFrame(() => editor.current?.querySelector('input')?.focus())
  }
  const submitSettings = async (event) => {
    event.preventDefault()
    if (!changed || saving) return
    setSaving(true)
    setSaveError('')
    try {
      await saveWidgets(draft)
      closeSettings()
      setSaved(true)
    } catch (cause) {
      setSaveError(cause.message || 'Не удалось сохранить настройки дашборда.')
    } finally {
      setSaving(false)
      requestAnimationFrame(() => {
        if (!editor.current) trigger.current?.focus()
      })
    }
  }
  return (
    <section
      className="min-w-0 space-y-4"
      aria-label="Сегодня"
      aria-busy={busy}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-sky-950">Сегодня</h1>
          <p className="mt-1 text-sm text-slate-500">
            Важные действия для вашей должности
            {data?.context?.positionTitle
              ? ` «${data.context.positionTitle}»`
              : ''}
            .
          </p>
          {data ? (
            <p className="mt-1 text-xs text-slate-500">
              Обновлено:{' '}
              {partyTodayDate(data.generatedAt, data.timeZone, {
                timeOnly: true,
              })}{' '}
              · Часовой пояс: {data.timeZone}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {data?.canCustomizeWidgets && !error ? (
            <button
              ref={trigger}
              type="button"
              className={button}
              aria-controls={settingsId}
              aria-expanded={editing}
              disabled={busy || saving}
              onClick={editing ? closeSettings : openSettings}
            >
              Настроить дашборд
            </button>
          ) : null}
          <button
            type="button"
            className={button}
            disabled={busy || saving || editing}
            onClick={reload}
          >
            Обновить
          </button>
        </div>
      </header>
      {busy ? (
        <p
          role="status"
          className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600"
        >
          Проверяем доступные вам задачи и заказы…
        </p>
      ) : null}
      {error ? (
        <div
          role="alert"
          className="rounded-lg bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
          <button
            type="button"
            className={`${button} mt-3 ml-3`}
            onClick={reload}
          >
            Повторить
          </button>
        </div>
      ) : null}
      {data && !busy && !error ? (
        <>
          {editing ? (
            <TodayWidgetSettings
              id={settingsId}
              editorRef={editor}
              sections={data.sections}
              draft={draft}
              changed={changed}
              busy={saving}
              error={saveError}
              onChange={(next) => {
                setDraft(next)
                setSaveError('')
              }}
              onSave={submitSettings}
              onClose={closeSettings}
            />
          ) : null}
          {saved ? (
            <p role="status" className="text-sm text-emerald-800">
              Настройки дашборда сохранены.
            </p>
          ) : null}
          {sections.length ? (
            <>
              <TodayIndicators
                sections={sections}
                activeId={actualFilter}
                controls={detailsId}
                onSelect={(id) => {
                  setFilter(id)
                  requestAnimationFrame(() => details.current?.focus())
                }}
              />
              <div id={detailsId} className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2
                    ref={details}
                    tabIndex={-1}
                    className="font-semibold text-sky-950"
                  >
                    Рабочие списки
                  </h2>
                  {actualFilter !== 'all' ? (
                    <button
                      type="button"
                      className={button}
                      onClick={() => setFilter('all')}
                    >
                      Все списки
                    </button>
                  ) : (
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={showEmpty}
                        onChange={(event) => setShowEmpty(event.target.checked)}
                      />
                      Показывать пустые списки
                    </label>
                  )}
                </div>
                <PartyTodaySections
                  data={{ ...data, sections }}
                  companyId={companyId}
                  company={company}
                  filter={actualFilter}
                  showEmpty={showEmpty || actualFilter !== 'all'}
                />
              </div>
            </>
          ) : (
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
              На дашборде пока нет показателей. Выберите нужные в настройке.
            </p>
          )}
        </>
      ) : null}
    </section>
  )
}
