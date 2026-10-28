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
import PartyToday from './PartyToday'

export default function PartyTodayWorkspace({ companies = [] }) {
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
          'Для выбранной компании рабочий экран недоступен. Выберите компанию из списка.'
        )
        return false
      }
      if (next === currentCompany.current && !broadcast) return true
      if (
        next !== currentCompany.current &&
        !requestPartyLeave({ kind: 'company', target: next })
      ) {
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
  const selectedAvailable =
    !companyId || companies.some((company) => String(company.id) === companyId)
  const displayedCompanyId = selectedAvailable ? companyId : ''
  const displayedError = selectedAvailable
    ? error
    : 'Доступ к компании изменился. Выберите доступную компанию.'
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
      const requested = url.searchParams.get('companyId')
      if (
        requested !== null &&
        !companies.some((company) => String(company.id) === requested)
      ) {
        setError('Компания из ссылки недоступна. Выберите доступную компанию.')
        setReady(true)
        return
      }
      const initialId = requested || readPartyActiveCompanyId(companies)
      currentCompany.current = initialId
      setCompanyId(initialId)
      setReady(true)
      if (initialId) publishPartyActiveCompanyId(initialId, { skipGuard: true })
      if (requested !== null) {
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
    const syncStorage = (event) => {
      if (event.key === PARTY_ACTIVE_COMPANY_STORAGE_KEY && event.newValue)
        changeCompany(event.newValue)
    }
    window.addEventListener(PARTY_ACTIVE_COMPANY_EVENT, sync)
    window.addEventListener('storage', syncStorage)
    return () => {
      window.removeEventListener(PARTY_ACTIVE_COMPANY_EVENT, sync)
      window.removeEventListener('storage', syncStorage)
    }
  }, [changeCompany])
  return (
    <>
      <PartyUnsavedChangesBootstrap />
      <div className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-5">
        {companies.length > 1 || displayedError ? (
          <label className="block text-sm text-slate-600">
            Компания
            <select
              aria-label="Компания рабочего экрана"
              className="mt-1 min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-2"
              value={displayedCompanyId}
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
        {displayedError ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
          >
            {displayedError}
          </p>
        ) : null}
        {!ready ? (
          <p role="status" className="p-3 text-sm text-slate-500">
            Загрузка компании…
          </p>
        ) : displayedCompanyId ? (
          <PartyToday
            key={displayedCompanyId}
            companyId={displayedCompanyId}
            company={pathname.startsWith('/company')}
          />
        ) : !displayedError ? (
          <p>Нет компаний с доступом к рабочему экрану.</p>
        ) : null}
      </div>
    </>
  )
}
