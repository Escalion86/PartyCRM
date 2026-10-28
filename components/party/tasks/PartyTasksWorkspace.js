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
import PartyTaskFocus from './PartyTaskFocus'
import { readPartyTaskFocus } from '@helpers/partyTaskFocus'

export default function PartyTasksWorkspace({ companies = [] }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [companyReady, setCompanyReady] = useState(false)
  const [focusedTaskId, setFocusedTaskId] = useState('')
  const [focusError, setFocusError] = useState('')
  const [taskRefresh, setTaskRefresh] = useState(0)
  const [childDirty, setChildDirty] = useState(false)
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
      setFocusedTaskId('')
      setFocusError('')
      setChildDirty(false)
      const url = new URL(window.location.href)
      if (url.searchParams.has('companyId') || url.searchParams.has('taskId')) {
        url.searchParams.set('companyId', nextId)
        url.searchParams.delete('taskId')
        window.history.replaceState(window.history.state, '', url)
      }
      return true
    },
    [companies]
  )
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (initializedCompany.current) return
      initializedCompany.current = true
      const focused = readPartyTaskFocus(window.location.search, companies)
      const initialId = focused.requested
        ? focused.companyId
        : readPartyActiveCompanyId(companies, companyRef.current)
      setFocusedTaskId(focused.taskId)
      setFocusError(focused.error)
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
        {(companies.length > 1 ||
          (companyReady && !companyId && companies.length > 0)) && (
          <label className="block text-sm text-slate-600">
            Компания
            <select
              className="mt-1 min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white p-2"
              value={companyId}
              disabled={!companyReady}
              onChange={(event) => changeCompany(event.target.value, true)}
            >
              {!companyId ? (
                <option value="" disabled>
                  Выберите компанию
                </option>
              ) : null}
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.title}
                </option>
              ))}
            </select>
          </label>
        )}
        {focusError ? (
          <p
            role="alert"
            className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
          >
            {focusError}
          </p>
        ) : null}
        {!companyReady ? (
          <p role="status" className="p-3 text-sm text-slate-500">
            Загрузка компании…
          </p>
        ) : companyId ? (
          <>
            {focusedTaskId ? (
              <PartyTaskFocus
                key={`${companyId}:${focusedTaskId}`}
                companyId={companyId}
                taskId={focusedTaskId}
                disabled={childDirty}
                onChanged={() => setTaskRefresh((previous) => previous + 1)}
                onClose={() => {
                  setFocusedTaskId('')
                  const url = new URL(window.location.href)
                  url.searchParams.delete('taskId')
                  window.history.replaceState(window.history.state, '', url)
                }}
              />
            ) : null}
            <PartyTasks
              key={companyId}
              companyId={companyId}
              onDirtyChange={setChildDirty}
              refreshKey={taskRefresh}
            />
          </>
        ) : (
          <p>
            {companies.length
              ? 'Выберите доступную компанию, чтобы открыть задачи.'
              : 'Нет компаний с доступом к задачам.'}
          </p>
        )}
      </div>
    </>
  )
}
