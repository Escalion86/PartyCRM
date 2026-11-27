'use client'

import {
  faAngleDown,
  faAngleUp,
  faArrowRotateLeft,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { apiJson } from '@helpers/apiClient'
import {
  PARTY_IMPERSONATION_API_PATH,
  PARTY_IMPERSONATION_RETURN_PATH,
} from '@helpers/partyImpersonationConstants'
import {
  hasPartyImpersonationChanged,
  isPartyImpersonationPage,
  isPartyImpersonationSwitching,
  notifyPartyImpersonationChange,
  PARTY_IMPERSONATION_CHANGE_KEY,
  setPartyImpersonationSwitching,
} from '@helpers/partyImpersonationClient'
import { useEffect, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import {
  allowPartyNavigation,
  requestPartyLeave,
} from './navigation/partyUnsavedChangesRuntime'

const subscribeToPageMode = () => () => {}
const getServerPageMode = () => false

export default function PartyImpersonationControl() {
  const active = useSyncExternalStore(
    subscribeToPageMode,
    isPartyImpersonationPage,
    getServerPageMode
  )
  const [status, setStatus] = useState(null)
  const [collapsed, setCollapsed] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const pathname = usePathname()
  const checkStatus = active || pathname === '/party/login'

  useEffect(() => {
    const needsReload = () => !isPartyImpersonationSwitching() && hasPartyImpersonationChanged()
    const syncSession = () => {
      if (!needsReload()) return
      window.location.reload()
    }
    const onStorage = (event) => {
      if (event.key === PARTY_IMPERSONATION_CHANGE_KEY) syncSession()
    }
    const onVisibilityChange = () => {
      if (!document.hidden) syncSession()
    }
    const onPageShow = (event) => {
      if (event.persisted) setPartyImpersonationSwitching(false)
      syncSession()
    }
    const interceptStaleInteraction = (event) => {
      if (!needsReload()) return
      event.preventDefault()
      event.stopImmediatePropagation()
      syncSession()
    }

    window.addEventListener('storage', onStorage)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('focus', syncSession)
    window.addEventListener('click', interceptStaleInteraction, true)
    window.addEventListener('submit', interceptStaleInteraction, true)
    document.addEventListener('visibilitychange', onVisibilityChange)
    syncSession()
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('focus', syncSession)
      window.removeEventListener('click', interceptStaleInteraction, true)
      window.removeEventListener('submit', interceptStaleInteraction, true)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  useEffect(() => {
    if (!checkStatus) return
    const controller = new AbortController()
    apiJson(PARTY_IMPERSONATION_API_PATH, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(({ data }) => {
        if (controller.signal.aborted) return
        setStatus(data)
      })
      .catch(() => {})
    return () => controller.abort()
  }, [checkStatus])

  const returnToAccount = async () => {
    if (
      pending ||
      !requestPartyLeave({ kind: 'route', target: PARTY_IMPERSONATION_RETURN_PATH })
    ) return
    setPending(true)
    setError('')
    setPartyImpersonationSwitching(true)
    try {
      const { data } = await apiJson(PARTY_IMPERSONATION_API_PATH, { method: 'DELETE' })
      const target = data?.redirectTo || PARTY_IMPERSONATION_RETURN_PATH
      notifyPartyImpersonationChange()
      allowPartyNavigation(target)
      window.location.replace(target)
    } catch (err) {
      setPartyImpersonationSwitching(false)
      setError(err?.message || 'Не удалось вернуться. Попробуйте ещё раз.')
      setPending(false)
    }
  }

  if (!active && !status?.active) return null

  const description = status?.unavailable ? 'Кабинет недоступен' : 'Работа от лица'
  const toggleLabel = collapsed ? 'Показать кнопку возврата' : 'Свернуть панель возврата'

  return (
    <aside
      aria-label="Работа от лица пользователя"
      className="fixed top-[max(0.5rem,env(safe-area-inset-top))] left-1/2 z-[1400] w-max max-w-[calc(100vw-7.5rem)] -translate-x-1/2 text-slate-900 sm:max-w-[calc(100vw-2rem)]"
    >
      <div className="flex min-w-0 items-center gap-1 rounded-xl bg-violet-50 p-1 shadow-[0_3px_14px_#2e106534]">
        <div id="party-impersonation-controls" hidden={collapsed} className="min-w-0">
          <div className="flex min-w-0 items-center gap-2 pl-1 sm:pl-2">
            <div className="hidden min-w-0 text-xs leading-4 whitespace-nowrap sm:block">
              <div className="font-semibold text-violet-900">{description}</div>
              {status?.userName && (
                <div className="max-w-44 truncate text-violet-800" title={status.userName}>
                  {status.userName}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={returnToAccount}
              disabled={pending}
              aria-label="Вернуться в свой аккаунт"
              className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 rounded-lg bg-violet-700 px-2 text-sm font-semibold text-white hover:bg-violet-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700 disabled:cursor-wait disabled:opacity-70 sm:px-3"
            >
              <FontAwesomeIcon icon={faArrowRotateLeft} className="hidden h-4 w-4 shrink-0 sm:block" />
              <span className="min-w-0">
                <span className="block truncate text-left text-[0.625rem] leading-3 text-violet-100 sm:hidden">
                  {status?.userName || (status?.unavailable ? 'Кабинет недоступен' : 'Кабинет пользователя')}
                </span>
                <span>{pending ? 'Возврат…' : 'Вернуться'}</span>
              </span>
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label={toggleLabel}
          aria-expanded={!collapsed}
          aria-controls="party-impersonation-controls"
          title={toggleLabel}
          onClick={() => setCollapsed((value) => !value)}
          className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-lg text-violet-800 hover:bg-violet-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-700"
        >
          <FontAwesomeIcon icon={collapsed ? faAngleDown : faAngleUp} className="h-4 w-4" />
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-900 shadow-sm">
          {error}
        </p>
      )}
    </aside>
  )
}
