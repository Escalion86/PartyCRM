'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import {
  PARTY_ACTIVE_COMPANY_EVENT,
  PARTY_ACTIVE_COMPANY_STORAGE_KEY,
  publishPartyActiveCompanyId,
  readPartyActiveCompanyId,
} from '@helpers/partyActiveCompany'
import { requestPartyLeave } from '@components/party/navigation/usePartyUnsavedChanges'
import FieldHelp from '@components/FieldHelp'
import { TicketError } from './TicketingControls'
import TicketSaleForm from './TicketSaleForm'
import TicketingSchedule from './TicketingSchedule'
import TicketingHistory from './TicketingHistory'
import { useTicketingCatalog, useTicketingList } from './useTicketingData'
import { ticketButton, ticketCard, ticketControl } from './ticketingUi'

const PartyFinancialOverview = dynamic(
  () => import('@components/party/finance/PartyFinancialOverview')
)

function CompanyTicketing({ companyId, initialSessionId, timeZone }) {
  const catalog = useTicketingCatalog(companyId)
  const [tab, setTab] = useState(initialSessionId ? 'schedule' : 'sell')
  const [visited, setVisited] = useState(
    initialSessionId ? ['schedule'] : ['sell']
  )
  const programList = useTicketingList({
    companyId,
    section: 'programs',
    enabled: catalog.data?.programsHasMore === true,
    filters: new URLSearchParams(
      catalog.data?.programsHasMore && catalog.data.programs?.length
        ? { cursor: String(catalog.data.programs.at(-1)._id) }
        : {}
    ).toString(),
    revision: catalog.revision,
  })
  const data = catalog.data
    ? {
        ...catalog.data,
        programs: [
          ...new Map(
            [...(catalog.data.programs || []), ...programList.rows].map(
              (program) => [String(program._id), program]
            )
          ).values(),
        ],
      }
    : null
  const caps = data?.capabilities || {}
  const effectiveTab =
    !data?.enabled && tab === 'sell'
      ? 'history'
      : tab === 'finance' && !caps.finance
        ? 'history'
        : tab === 'sell' && !caps.sell
          ? 'schedule'
          : tab
  const choose = (next) => {
    setTab(next)
    setVisited((previous) =>
      previous.includes(next) ? previous : [...previous, next]
    )
  }
  const allowed = data && caps.read === true
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-sky-950">
          Билеты и посещения{' '}
          <FieldHelp
            label="Часовые пояса"
            text="Начало и окончание сеанса показаны во времени устройства. Дата свободного посещения и период финансового отчёта считаются по часовому поясу компании."
          />
        </h1>
        <button
          type="button"
          className={ticketButton}
          disabled={catalog.busy}
          onClick={catalog.reload}
        >
          Обновить данные
        </button>
      </div>
      <TicketError>{catalog.error}</TicketError>
      {catalog.error && !data ? (
        <button type="button" className={ticketButton} onClick={catalog.reload}>
          Повторить загрузку
        </button>
      ) : null}
      {catalog.busy && !data ? (
        <p role="status" className="text-sm text-slate-500">
          Загрузка программ и сеансов…
        </p>
      ) : null}
      {data && !allowed ? (
        <p className={ticketCard + ' text-sm text-slate-600'}>
          У вашей должности нет доступа к билетам и посещениям.
        </p>
      ) : null}
      {allowed ? (
        <>
          {!data.enabled ? (
            <p
              role="status"
              className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900"
            >
              Модуль выключен. Новые продажи и оплаты недоступны. История
              сохранена; вход, возвраты и отмена существующих сеансов доступны
              по правам должности.
            </p>
          ) : null}
          <div
            role="group"
            aria-label="Разделы билетного модуля"
            className="flex flex-wrap gap-2"
          >
            {[
              data.enabled && caps.sell && ['sell', 'Продать'],
              ['schedule', 'Расписание'],
              ['history', 'История'],
              caps.finance && ['finance', 'Финансы'],
            ]
              .filter(Boolean)
              .map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={effectiveTab === key}
                  className={
                    ticketButton +
                    (effectiveTab === key
                      ? ' border-sky-500 bg-sky-50 ring-1 ring-sky-300'
                      : '')
                  }
                  onClick={() => choose(key)}
                >
                  {label}
                </button>
              ))}
          </div>
          <div hidden={effectiveTab !== 'sell'}>
            {caps.sell && visited.includes('sell') ? (
              <TicketSaleForm
                companyId={companyId}
                catalog={data}
                revision={catalog.revision}
                onChanged={catalog.reload}
                programList={data.programsHasMore ? programList : null}
              />
            ) : null}
          </div>
          <div hidden={effectiveTab !== 'schedule'}>
            {visited.includes('schedule') || effectiveTab === 'schedule' ? (
              <TicketingSchedule
                initialSessionId={initialSessionId}
                companyId={companyId}
                catalog={data}
                revision={catalog.revision}
                onChanged={catalog.reload}
                programList={data.programsHasMore ? programList : null}
              />
            ) : null}
          </div>
          {caps.finance && visited.includes('finance') ? (
            <div hidden={effectiveTab !== 'finance'}>
              <PartyFinancialOverview
                companyId={companyId}
                timeZone={timeZone}
              />
            </div>
          ) : null}
          <div hidden={effectiveTab !== 'history'}>
            {visited.includes('history') || effectiveTab === 'history' ? (
              <TicketingHistory
                companyId={companyId}
                catalog={data}
                revision={catalog.revision}
                onChanged={catalog.reload}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}

export default function PartyTicketingWorkspace({
  companies = [],
  initialSessionId = '',
  initialCompanyId = '',
}) {
  const [companyId, setCompanyId] = useState(
    initialCompanyId || companies[0]?.id || ''
  )
  const [ready, setReady] = useState(false)
  const [notice, setNotice] = useState('')
  const current = useRef(initialCompanyId || companies[0]?.id || '')
  const initialized = useRef(false)
  const choose = useCallback(
    (id, external = false) => {
      const nextId = String(id || '')
      if (!nextId || nextId === current.current) return
      const restore = () => {
        const previous = current.current
        queueMicrotask(() => {
          if (current.current === previous)
            publishPartyActiveCompanyId(previous, {
              skipGuard: true,
              persist: false,
            })
        })
      }
      if (!companies.some((company) => String(company.id) === nextId)) {
        setNotice('У вашей должности нет доступа к билетам выбранной компании.')
        restore()
        return
      }
      if (!requestPartyLeave({ kind: 'company', target: nextId })) {
        restore()
        return
      }
      if (!external && !publishPartyActiveCompanyId(nextId)) return
      current.current = nextId
      setCompanyId(nextId)
      setNotice('')
    },
    [companies]
  )
  useEffect(() => {
    if (initialized.current) return
    const frame = requestAnimationFrame(() => {
      initialized.current = true
      const id = companies.some((company) => company.id === initialCompanyId)
        ? initialCompanyId
        : readPartyActiveCompanyId(companies)
      current.current = id
      setCompanyId(id)
      setReady(true)
      if (id) publishPartyActiveCompanyId(id, { skipGuard: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [companies, initialCompanyId])
  useEffect(() => {
    const changed = (event) => choose(event.detail?.companyId, true)
    const storage = (event) => {
      if (event.key === PARTY_ACTIVE_COMPANY_STORAGE_KEY)
        choose(event.newValue, true)
    }
    window.addEventListener(PARTY_ACTIVE_COMPANY_EVENT, changed)
    window.addEventListener('storage', storage)
    return () => {
      window.removeEventListener(PARTY_ACTIVE_COMPANY_EVENT, changed)
      window.removeEventListener('storage', storage)
    }
  }, [choose])
  return (
    <main
      className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-5"
      data-company-id={companyId}
    >
      {notice ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          {notice}
        </p>
      ) : null}
      {companies.length > 1 ? (
        <label className="block text-sm text-slate-600">
          Компания
          <select
            className={ticketControl + ' cursor-pointer'}
            value={companyId}
            disabled={!ready}
            onChange={(event) => choose(event.target.value)}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {!ready ? (
        <p role="status" className="text-sm text-slate-500">
          Загрузка компании…
        </p>
      ) : companyId ? (
        <CompanyTicketing
          key={companyId}
          companyId={companyId}
          timeZone={
            companies.find((company) => company.id === companyId)?.timeZone
          }
          initialSessionId={
            !initialCompanyId || companyId === initialCompanyId
              ? initialSessionId
              : ''
          }
        />
      ) : (
        <section className={ticketCard}>
          <h1 className="text-xl font-semibold text-sky-950">
            Билеты и посещения
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            У вашей должности нет доступа к билетам и посещениям компаний.
          </p>
        </section>
      )}
    </main>
  )
}
