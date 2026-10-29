'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import {
  PARTY_ACTIVE_COMPANY_EVENT,
  PARTY_ACTIVE_COMPANY_STORAGE_KEY,
  publishPartyActiveCompanyId,
  readPartyActiveCompanyId,
} from '@helpers/partyActiveCompany'
import { requestPartyLeave } from '@components/party/navigation/usePartyUnsavedChanges'
import PartyUnsavedChangesBootstrap from '@components/party/navigation/PartyUnsavedChangesBootstrap'
import PartyResourceCalendar from './PartyResourceCalendar'

export default function PartyResourceCalendarWorkspace({ companies = [] }) {
  const pathname = usePathname()
  const [companyId, setCompanyId] = useState('')
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const currentCompany = useRef('')
  const initialized = useRef(false)
  const changeCompany = useCallback(
    (value, broadcast = false) => {
      const next = String(value || '')
      if (!companies.some((company) => String(company.id) === next)) {
        const expected = currentCompany.current
        queueMicrotask(() => {
          if (expected && currentCompany.current === expected)
            publishPartyActiveCompanyId(expected, {
              skipGuard: true,
              persist: false,
            })
        })
        setError(
          'Для выбранной компании календарь ресурсов недоступен. Выберите компанию из списка.'
        )
        return false
      }
      if (next === currentCompany.current && !broadcast) return true
      if (
        next !== currentCompany.current &&
        !requestPartyLeave({ kind: 'company', target: next })
      ) {
        if (currentCompany.current)
          publishPartyActiveCompanyId(currentCompany.current, {
            skipGuard: true,
            persist: false,
          })
        return false
      }
      if (broadcast && !publishPartyActiveCompanyId(next)) return false
      currentCompany.current = next
      setCompanyId(next)
      setError('')
      return true
    },
    [companies]
  )
  const company = companies.find((item) => String(item.id) === companyId)
  const visibleError =
    companyId && !company
      ? 'Доступ к компании изменился. Выберите доступную компанию.'
      : error
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (initialized.current) {
        if (
          currentCompany.current &&
          !companies.some(
            (company) => String(company.id) === currentCompany.current
          )
        ) {
          currentCompany.current = ''
          setCompanyId('')
          setError('Доступ к компании изменился. Выберите доступную компанию.')
        }
        return
      }
      initialized.current = true
      const url = new URL(window.location.href)
      const requested = url.searchParams.getAll('companyId')
      if (
        requested.length &&
        (requested.length !== 1 ||
          !companies.some((company) => String(company.id) === requested[0]))
      ) {
        setError('Компания из ссылки недоступна. Выберите доступную компанию.')
        setReady(true)
        return
      }
      const next = requested[0] || readPartyActiveCompanyId(companies)
      currentCompany.current = next
      setCompanyId(next)
      setReady(true)
      if (next) publishPartyActiveCompanyId(next, { skipGuard: true })
      if (requested.length) {
        url.searchParams.delete('companyId')
        window.history.replaceState(
          window.history.state,
          '',
          `${url.pathname}${url.search}${url.hash}`
        )
      }
    })
    return () => cancelAnimationFrame(frame)
  }, [companies])
  useEffect(() => {
    const sync = (event) => changeCompany(event.detail?.companyId)
    const storage = (event) => {
      if (event.key === PARTY_ACTIVE_COMPANY_STORAGE_KEY && event.newValue)
        changeCompany(event.newValue)
    }
    window.addEventListener(PARTY_ACTIVE_COMPANY_EVENT, sync)
    window.addEventListener('storage', storage)
    return () => {
      window.removeEventListener(PARTY_ACTIVE_COMPANY_EVENT, sync)
      window.removeEventListener('storage', storage)
    }
  }, [changeCompany])
  return (
    <>
      <PartyUnsavedChangesBootstrap />
      <div className="mx-auto w-full max-w-[100rem] space-y-4 p-3 sm:p-5">
        {companies.length > 1 || visibleError ? (
          <label className="block text-sm text-slate-600">
            Компания
            <select
              aria-label="Компания календаря ресурсов"
              className="mt-1 min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-2"
              value={company?.id || ''}
              disabled={!ready}
              onChange={(event) => {
                if (changeCompany(event.target.value, true)) {
                  const url = new URL(window.location.href)
                  url.searchParams.delete('companyId')
                  window.history.replaceState(
                    window.history.state,
                    '',
                    `${url.pathname}${url.search}${url.hash}`
                  )
                }
              }}
            >
              <option value="" disabled>
                Выберите компанию
              </option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {visibleError ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
          >
            {visibleError}
          </p>
        ) : null}
        {!ready ? (
          <p role="status" className="p-3 text-sm text-slate-500">
            Загрузка компании…
          </p>
        ) : company ? (
          <PartyResourceCalendar
            key={company.id}
            company={company}
            companyRoute={pathname.startsWith('/company')}
          />
        ) : !visibleError ? (
          <p>Нет компаний с доступом к календарю ресурсов.</p>
        ) : null}
      </div>
    </>
  )
}
