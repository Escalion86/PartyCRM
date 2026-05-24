import { useAtom, useSetAtom } from 'jotai'

import eventsAtom from '@state/atoms/eventsAtom'
import clientsAtom from '@state/atoms/clientsAtom'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import transactionsAtom from '@state/atoms/transactionsAtom'
import servicesAtom from '@state/atoms/servicesAtom'
import usersAtom from '@state/atoms/usersAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'
import { useEffect, useRef } from 'react'
import LoadingSpinner from '@components/LoadingSpinner'
import ReleaseOnboardingCoach from '@components/ReleaseOnboardingCoach'
import ModalsPortal from '@layouts/modals/ModalsPortal'
import isSiteLoadingAtom from '@state/atoms/isSiteLoadingAtom'
import cn from 'classnames'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useWindowDimensionsRecoil } from '@helpers/useWindowDimensions'
import { modalsFuncAtom } from '@state/atoms'
import modalsFuncGenerator from '@layouts/modals/modalsFuncGenerator'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import itemsFuncGenerator from '@state/itemsFuncGenerator'
import useSnackbar from '@helpers/useSnackbar'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import { pages } from '@helpers/constants'
import isPageAllowedForRole from '@helpers/pageAccess'
import {
  readServerSyncDisabledFromStorage,
  resolveServerSyncDisabled,
} from '@helpers/serverSyncMode'
import {
  appendServerSyncQueueItem,
  readServerSyncQueue,
  replaceServerSyncQueue,
  SERVER_SYNC_FLUSH_NOW_EVENT,
  shiftServerSyncQueue,
} from '@helpers/serverSyncQueue'
import { sendClientLog } from '@helpers/clientLog'
import { queryKeys } from '@helpers/queryKeys'
import { useEventActions } from '@helpers/useEventsQuery'
import { useClientActions } from '@helpers/useClientsQuery'
import { isPushSupported, syncPushSubscription } from '@helpers/pushClient'
import useCabinetPerformanceMetrics from '@helpers/useCabinetPerformanceMetrics'

const StateLoader = (props) => {
  if (props.error && Object.keys(props.error).length > 0)
    console.log('props.error', props.error)

  const snackbar = useSnackbar()

  const router = useRouter()
  const queryClient = useQueryClient()

  const [modalFunc, setModalsFunc] = useAtom(modalsFuncAtom)

  const [isSiteLoading, setIsSiteLoading] = useAtom(isSiteLoadingAtom)

  // const [mode, setMode] = useAtom(modeAtom)

  const [loggedUser, setLoggedUser] = useAtom(loggedUserAtom)

  const setEventsState = useSetAtom(eventsAtom)
  const setClientsState = useSetAtom(clientsAtom)
  const setTransactionsState = useSetAtom(transactionsAtom)
  const [siteSettingsState, setSiteSettingsState] =
    useAtom(siteSettingsAtom)
  const setUsersState = useSetAtom(usersAtom)
  // const setRolesSettingsState = useSetAtom(rolesAtom)
  // const setHistoriesState = useSetAtom(historiesAtom)
  // const setQuestionnairesState = useSetAtom(questionnairesAtom)
  // const setQuestionnairesUsersState = useSetAtom(questionnairesUsersAtom)
  const setServicesState = useSetAtom(servicesAtom)
  const setTariffsState = useSetAtom(tariffsAtom)
  // const setServicesUsersState = useSetAtom(servicesUsersAtom)
  // const setServerSettingsState = useSetAtom(serverSettingsAtom)

  const setItemsFunc = useSetAtom(itemsFuncAtom)
  const serverSyncDisabled = resolveServerSyncDisabled(siteSettingsState)
  const eventActions = useEventActions()
  const clientActions = useClientActions()

  useWindowDimensionsRecoil()

  const customSettings = siteSettingsState?.custom
  const isTenantPushEnabled =
    (typeof customSettings?.get === 'function'
      ? customSettings.get('publicLeadPushEnabled')
      : customSettings?.publicLeadPushEnabled) === true

  useCabinetPerformanceMetrics({
    page: props.page,
    events: props.events,
    clients: props.clients,
    transactions: props.transactions,
    services: props.services,
    tariffs: props.tariffs,
    users: props.users,
    eventsPaging: props.eventsPaging,
    isSiteLoading,
  })

  useEffect(() => {
    const itemsFunc = itemsFuncGenerator(snackbar, loggedUser, {
      disableServerSync: serverSyncDisabled,
      eventActions,
      clientActions,
    })
    setItemsFunc(itemsFunc)
    setModalsFunc(
      modalsFuncGenerator(
        router,
        itemsFunc,
        loggedUser,
        { disableServerSync: serverSyncDisabled }
        // loggedUser,
        // siteSettingsState,
      )
    )
  }, [
    loggedUser,
    clientActions,
    eventActions,
    router,
    serverSyncDisabled,
    setItemsFunc,
    setModalsFunc,
    snackbar,
  ])

  useEffect(() => {
    setLoggedUser(props.loggedUser)
    setEventsState(props.events)
    setClientsState(props.clients)
    setTransactionsState(props.transactions ?? [])
    setServicesState(props.services ?? [])
    setTariffsState(props.tariffs ?? [])
    setUsersState(props.users ?? [])
    setSiteSettingsState(props.siteSettings)
    const eventsScope =
      props.eventsPaging?.scope && props.eventsPaging.scope !== 'none'
        ? props.eventsPaging.scope
        : props.page === 'eventsUpcoming'
          ? 'upcoming'
          : props.page === 'eventsPast'
            ? 'past'
            : 'all'
    const eventsQueryPayload = {
      data: props.events ?? [],
      meta: props.eventsPaging ?? {},
    }
    queryClient.setQueryData(
      queryKeys.events({ scope: eventsScope }),
      eventsQueryPayload
    )
    queryClient.setQueryData(queryKeys.events({ scope: 'all' }), eventsQueryPayload)
    ;(props.events ?? []).forEach((event) => {
      if (event?._id) queryClient.setQueryData(queryKeys.event(event._id), event)
    })
    queryClient.setQueryData(queryKeys.clients(), props.clients ?? [])
    queryClient.setQueryData(queryKeys.transactionsAll, props.transactions ?? [])
    queryClient.setQueryData(queryKeys.services(), props.services ?? [])
    queryClient.setQueryData(queryKeys.tariffs(), props.tariffs ?? [])
    queryClient.setQueryData(queryKeys.users(), props.users ?? [])
    queryClient.setQueryData(queryKeys.siteSettings, props.siteSettings ?? {})
    if (props.loggedUser) {
      queryClient.setQueryData(queryKeys.loggedUser, props.loggedUser)
    }
    queryClient.setQueryData(queryKeys.statistics(), {
      events: props.events ?? [],
      clients: props.clients ?? [],
      services: props.services ?? [],
      transactions: props.transactions ?? [],
      filters: {},
    })
    setIsSiteLoading(false)
  }, [
    props.clients,
    props.events,
    props.eventsPaging,
    props.loggedUser,
    props.page,
    props.siteSettings,
    props.services,
    props.tariffs,
    props.transactions,
    props.users,
    queryClient,
    setClientsState,
    setEventsState,
    setIsSiteLoading,
    setLoggedUser,
    setServicesState,
    setTariffsState,
    setUsersState,
    setSiteSettingsState,
    setTransactionsState,
  ])

  useEffect(() => {
    if (!loggedUser?._id) return
    if (!isPushSupported()) return
    if (Notification.permission !== 'granted') return
    if (!isTenantPushEnabled) return

    let cancelled = false

    const syncCurrentPushSubscription = async () => {
      try {
        if (cancelled) return
        await syncPushSubscription({
          ensureLocalSubscription: true,
        }).catch(() => null)
      } catch (error) {
        // Silent sync: user can still manage push manually from settings.
      }
    }

    syncCurrentPushSubscription()

    return () => {
      cancelled = true
    }
  }, [isTenantPushEnabled, loggedUser?._id])

  useEffect(() => {
    if (!loggedUser?._id) return
    const access = getUserTariffAccess(loggedUser, props.tariffs ?? [])
    const needsTariff = !access.trialActive && !access.hasTariff
    const allowedPages = ['tariff-select', 'tariffs']
    if (needsTariff && props.page && !allowedPages.includes(props.page)) {
      router.push('/cabinet/tariff-select')
    }
  }, [
    loggedUser,
    loggedUser?._id,
    loggedUser?.tariffId,
    props.page,
    props.tariffs,
    router,
  ])

  const onboardingShownRef = useRef(false)
  const privacyWarningShownRef = useRef(false)
  const syncFlushInProgressRef = useRef(false)
  const startupErrorLoggedRef = useRef(false)

  useEffect(() => {
    if (!props.error || startupErrorLoggedRef.current) return
    startupErrorLoggedRef.current = true
    sendClientLog({
      type: 'cabinet-props-error',
      page: props.page,
      message:
        typeof props.error?.message === 'string'
          ? props.error.message
          : 'unknown',
      name: props.error?.name,
      code: props.error?.code,
      digest: props.error?.digest,
      url: typeof window !== 'undefined' ? window.location.href : undefined,
      hasLoggedUser: Boolean(props.loggedUser?._id),
      hasEvents: Array.isArray(props.events),
      eventsCount: Array.isArray(props.events) ? props.events.length : null,
    })
  }, [props.error, props.events, props.loggedUser?._id, props.page])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const nativeFetch = window.fetch.bind(window)

    const getMethod = (input, init) =>
      String(
        init?.method ??
          (typeof input === 'object' && input ? input.method : 'GET') ??
          'GET'
      ).toUpperCase()

    const normalizeBody = (body) => {
      if (!body) return ''
      if (typeof body === 'string') return body
      if (body instanceof URLSearchParams) return body.toString()
      if (body instanceof FormData) return '[form-data]'
      if (body instanceof Blob || body instanceof ArrayBuffer) return '[binary]'
      try {
        return JSON.stringify(body)
      } catch (error) {
        return '[unserializable]'
      }
    }

    const normalizeHeaders = (headersValue) => {
      if (!headersValue) return {}
      if (headersValue instanceof Headers) {
        return Object.fromEntries(headersValue.entries())
      }
      if (Array.isArray(headersValue)) {
        return Object.fromEntries(headersValue)
      }
      if (typeof headersValue === 'object') {
        return { ...headersValue }
      }
      return {}
    }

    const shouldBlock = (input, init) => {
      const disabledFromStorage = readServerSyncDisabledFromStorage()
      const disabled = typeof disabledFromStorage === 'boolean'
        ? disabledFromStorage
        : serverSyncDisabled
      if (!disabled) return false

      const method = getMethod(input, init)
      if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false

      const inputUrl =
        typeof input === 'string'
          ? input
          : typeof input?.url === 'string'
            ? input.url
            : ''
      if (!inputUrl) return false

      const url = new URL(inputUrl, window.location.origin)
      const isSameOriginApi =
        url.origin === window.location.origin && url.pathname.startsWith('/api/')
      if (!isSameOriginApi) return false

      if (url.pathname.startsWith('/api/auth/')) return false

      return true
    }

    window.fetch = async (input, init = {}) => {
      if (!shouldBlock(input, init)) {
        return nativeFetch(input, init)
      }

      const method = getMethod(input, init)
      const inputUrl =
        typeof input === 'string'
          ? input
          : typeof input?.url === 'string'
            ? input.url
            : ''
      const url = new URL(inputUrl, window.location.origin)

      appendServerSyncQueueItem({
        id: `queue-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        url: `${url.pathname}${url.search}`,
        method,
        body: normalizeBody(init?.body),
        headers: normalizeHeaders(init?.headers),
        createdAt: new Date().toISOString(),
      })

      if (!privacyWarningShownRef.current) {
        snackbar.warning(
          'Серверная синхронизация отключена: запрос сохранен локально'
        )
        privacyWarningShownRef.current = true
      }

      return new Response(
        JSON.stringify({
          success: true,
          data: null,
          localOnly: true,
          queued: true,
        }),
        {
          status: 202,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      )
    }

    return () => {
      window.fetch = nativeFetch
    }
  }, [serverSyncDisabled, snackbar])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const flushQueue = async () => {
      if (syncFlushInProgressRef.current) return
      if (serverSyncDisabled) return
      if (!navigator.onLine) return

      const queue = readServerSyncQueue()
      if (queue.length === 0) return

      syncFlushInProgressRef.current = true
      try {
        let processed = 0
        for (const item of queue) {
          const method = String(item?.method || 'POST').toUpperCase()
          const body =
            typeof item?.body === 'string' && item.body !== '[form-data]' && item.body !== '[binary]'
              ? item.body
              : undefined
          const headers =
            item?.headers && typeof item.headers === 'object'
              ? item.headers
              : { 'Content-Type': 'application/json' }

          const response = await fetch(item.url, {
            method,
            headers,
            body,
          })
          if (!response.ok) break
          processed += 1
        }

        if (processed > 0) {
          shiftServerSyncQueue(processed)
          snackbar.success(`Синхронизировано локальных изменений: ${processed}`)
        }

        const left = readServerSyncQueue()
        if (left.length > 0 && processed === 0) {
          snackbar.warning(
            'Не удалось синхронизировать очередь. Проверьте подключение и повторите.'
          )
        } else if (left.length > 0 && processed > 0) {
          replaceServerSyncQueue(left)
        }
      } catch (error) {
        snackbar.warning('Синхронизация очереди прервана')
      } finally {
        syncFlushInProgressRef.current = false
      }
    }

    const handleOnline = () => {
      flushQueue()
    }
    const handleManualFlush = () => {
      flushQueue()
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener(SERVER_SYNC_FLUSH_NOW_EVENT, handleManualFlush)

    flushQueue()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener(SERVER_SYNC_FLUSH_NOW_EVENT, handleManualFlush)
    }
  }, [serverSyncDisabled, snackbar])

  useEffect(() => {
    if (!loggedUser?._id || onboardingShownRef.current) return
    const firstName = loggedUser?.firstName?.trim() ?? ''
    const secondName = loggedUser?.secondName?.trim() ?? ''
    const town = siteSettingsState?.defaultTown?.trim() ?? ''
    const timeZone = siteSettingsState?.timeZone ?? ''
    const timeZoneConfirmed =
      siteSettingsState?.custom?.timeZoneConfirmed === true
    const needsOnboarding =
      !firstName || !secondName || !town || !timeZone || !timeZoneConfirmed

    if (needsOnboarding && modalFunc?.user?.onboarding) {
      onboardingShownRef.current = true
      modalFunc.user.onboarding()
    }
  }, [
    loggedUser?._id,
    loggedUser?.firstName,
    loggedUser?.secondName,
    siteSettingsState?.defaultTown,
    siteSettingsState?.timeZone,
    siteSettingsState?.custom?.timeZoneConfirmed,
    modalFunc,
  ])

  useEffect(() => {
    if (!loggedUser?._id || !props.page) return
    const role = loggedUser?.role ?? 'user'
    const pageConfig = pages.find((item) => item.href === props.page)
    const isAllowed = isPageAllowedForRole(pageConfig?.accessRoles, role)
    if (!isAllowed) {
      router.push('/cabinet/eventsUpcoming')
    }
  }, [loggedUser?._id, loggedUser?.role, props.page, router])

  // Убрали авто-редирект со страницы заявок при пустом списке.

  // useEffect(() => {
  //   if (loggedUser) {
  //     postData(
  //       `/api/loginhistory`,
  //       {
  //         userId: loggedUser._id,
  //         browser: browserVer(true),
  //       },
  //       null,
  //       null,
  //       false,
  //       null,
  //       true
  //     )
  //   }
  // }, [loggedUser])

  return (
    <div className={cn('relative overflow-hidden', props.className)}>
      {isSiteLoading ? (
        <div className="h-[100dvh] w-full">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <div className="relative w-full bg-transparent">{props.children}</div>
      )}
      <ReleaseOnboardingCoach />
      <ModalsPortal />
    </div>
  )
}

export default StateLoader
