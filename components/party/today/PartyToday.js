'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  partyTodayDate,
  partyTodayHref,
  partyTodayPhoneHref,
} from '@helpers/partyTodayPresentation'
import usePartyToday from './usePartyToday'

const button =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'

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
  const { data, busy, error, reload } = usePartyToday(companyId)
  const [filter, setFilter] = useState('all')
  const [showEmpty, setShowEmpty] = useState(false)
  const actualFilter =
    filter === 'all' || data?.sections.some((section) => section.id === filter)
      ? filter
      : 'all'
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
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={reload}
        >
          Обновить
        </button>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div
              role="group"
              aria-label="Блоки рабочего экрана"
              className="flex flex-wrap gap-2"
            >
              {[{ id: 'all', title: 'Все' }, ...data.sections].map(
                (section) => (
                  <button
                    key={section.id}
                    type="button"
                    aria-pressed={actualFilter === section.id}
                    className={`min-h-11 cursor-pointer rounded-full border px-3 py-2 text-sm ${actualFilter === section.id ? 'border-sky-700 bg-sky-700 font-semibold text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                    onClick={() => setFilter(section.id)}
                  >
                    {section.title}
                  </button>
                )
              )}
            </div>
            <label className="flex min-h-11 cursor-pointer items-center gap-2 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={showEmpty}
                onChange={(event) => setShowEmpty(event.target.checked)}
              />
              Показывать пустые блоки
            </label>
          </div>
          <PartyTodaySections
            data={data}
            companyId={companyId}
            company={company}
            filter={actualFilter}
            showEmpty={showEmpty}
          />
        </>
      ) : null}
    </section>
  )
}
