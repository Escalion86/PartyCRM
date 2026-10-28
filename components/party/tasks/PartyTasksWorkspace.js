'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  PARTY_ACTIVE_COMPANY_EVENT,
  PARTY_ACTIVE_COMPANY_STORAGE_KEY,
  publishPartyActiveCompanyId,
  readPartyActiveCompanyId,
} from '@helpers/partyActiveCompany'
import { requestPartyLeave } from '@components/party/navigation/usePartyUnsavedChanges'
import PartyUnsavedChangesBootstrap from '@components/party/navigation/PartyUnsavedChangesBootstrap'
import PartyTasks from './PartyTasks'

export default function PartyTasksWorkspace({ companies = [] }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [companyReady, setCompanyReady] = useState(false)
  const companyRef = useRef(companyId)
  const initializedCompany = useRef(false)
  const changeCompany = useCallback(
    (nextCompanyId, broadcast = false) => {
      const nextId = String(nextCompanyId || '')
      if (nextId === companyRef.current) return true
      const restoreSelection = () => {
        const expectedId = companyRef.current
        queueMicrotask(() => {
          if (companyRef.current === expectedId)
            publishPartyActiveCompanyId(expectedId, {
              skipGuard: true,
              persist: false,
            })
        })
      }
      if (!companies.some((company) => String(company.id) === nextId)) {
        restoreSelection()
        return false
      }
      if (!requestPartyLeave({ kind: 'company', target: nextId })) {
        restoreSelection()
        return false
      }
      // The publisher can be cancelled by any registered form. Commit the
      // controlled selection only after it accepts the same navigation lease.
      if (broadcast && !publishPartyActiveCompanyId(nextId)) {
        restoreSelection()
        return false
      }
      companyRef.current = nextId
      setCompanyId(nextId)
      return true
    },
    [companies]
  )
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (initializedCompany.current) return
      initializedCompany.current = true
      const initialId = readPartyActiveCompanyId(companies, companyRef.current)
      companyRef.current = initialId
      setCompanyId(initialId)
      setCompanyReady(true)
      if (initialId) publishPartyActiveCompanyId(initialId, { skipGuard: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [companies])
  useEffect(() => {
    const synchronize = (event) => changeCompany(event.detail?.companyId)
    const synchronizeStorage = (event) => {
      if (event.key === PARTY_ACTIVE_COMPANY_STORAGE_KEY && event.newValue)
        changeCompany(event.newValue)
    }
    window.addEventListener(PARTY_ACTIVE_COMPANY_EVENT, synchronize)
    window.addEventListener('storage', synchronizeStorage)
    return () => {
      window.removeEventListener(PARTY_ACTIVE_COMPANY_EVENT, synchronize)
      window.removeEventListener('storage', synchronizeStorage)
    }
  }, [changeCompany])
  return (
    <>
      <PartyUnsavedChangesBootstrap />
      <div className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-5">
        {companies.length > 1 && (
          <label className="block text-sm text-slate-600">
            Компания
            <select
              className="mt-1 min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-2"
              value={companyId}
              disabled={!companyReady}
              onChange={(event) => changeCompany(event.target.value, true)}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {!companyReady ? (
          <p role="status" className="p-3 text-sm text-slate-500">
            Загрузка компании…
          </p>
        ) : companyId ? (
          <PartyTasks key={companyId} companyId={companyId} />
        ) : (
          <p>Нет компаний с доступом к задачам.</p>
        )}
      </div>
    </>
  )
}
