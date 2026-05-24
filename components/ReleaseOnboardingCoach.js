/* eslint-disable react-hooks/set-state-in-effect */
import { getData, postData } from '@helpers/CRUD'
import { modalsFuncAtom } from '@state/atoms'
import eventsAtom from '@state/atoms/eventsAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import servicesAtom from '@state/atoms/servicesAtom'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import cn from 'classnames'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useRef, useState } from 'react'
import useSnackbar from '@helpers/useSnackbar'

const getCustomValue = (custom, key) => {
  if (!custom) return undefined
  if (typeof custom.get === 'function') return custom.get(key)
  return custom[key]
}

const hasAdditionalEvents = (events = []) =>
  events.some(
    (event) =>
      Array.isArray(event?.additionalEvents) && event.additionalEvents.length > 0
  )

const ReleaseOnboardingCoach = () => {
  const router = useRouter()
  const snackbar = useSnackbar()
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const loggedUser = useAtomValue(loggedUserAtom)
  const services = useAtomValue(servicesAtom)
  const setServices = useSetAtom(servicesAtom)
  const events = useAtomValue(eventsAtom)
  const [siteSettings, setSiteSettings] = useAtom(siteSettingsAtom)
  const [collapsed, setCollapsed] = useState(false)
  const [showPreviousSteps, setShowPreviousSteps] = useState(false)
  const [selectedStepIndex, setSelectedStepIndex] = useState(null)
  const [forceShow, setForceShow] = useState(false)
  const [servicesLoaded, setServicesLoaded] = useState(false)
  const manualStepSelectionRef = useRef(false)
  const saveInProgressRef = useRef(false)

  const firstName = loggedUser?.firstName?.trim() ?? ''
  const secondName = loggedUser?.secondName?.trim() ?? ''
  const town = siteSettings?.defaultTown?.trim() ?? ''
  const timeZone = siteSettings?.timeZone ?? ''
  const timeZoneConfirmed = siteSettings?.custom?.timeZoneConfirmed === true
  const profileReady =
    Boolean(loggedUser?._id) &&
    Boolean(firstName) &&
    Boolean(secondName) &&
    Boolean(town) &&
    Boolean(timeZone) &&
    timeZoneConfirmed

  const custom = siteSettings?.custom ?? {}
  const isCompleted =
    getCustomValue(custom, 'releaseOnboardingCompleted') === true
  const forceShowToken = getCustomValue(custom, 'releaseOnboardingShowToken')
  const hasActiveEvent = Array.isArray(events)
    ? events.some((event) => event?.status === 'active')
    : false

  const steps = useMemo(
    () => [
      {
        id: 'services',
        title: 'Создайте услугу',
        description:
          'Добавьте хотя бы одну услугу, чтобы использовать ее в заявках.',
        done: Array.isArray(services) && services.length > 0,
        actionText: 'Добавить услугу',
        onAction: () => modalsFunc?.service?.add?.(),
      },
      {
        id: 'event',
        title: 'Создайте первую заявку',
        description: 'Создайте мероприятие в статусе "Заявка".',
        done: Array.isArray(events) && events.length > 0,
        actionText: 'Новая заявка',
        onAction: () => modalsFunc?.event?.create?.(),
      },
      {
        id: 'additional',
        title: 'Добавьте доп. событие',
        description:
          'В заявке добавьте напоминание (например: "Узнать что решили"), чтобы не потерять контакт.',
        done: hasAdditionalEvents(events),
        actionText: 'Открыть мероприятия',
        onAction: () => router.push('/cabinet/eventsUpcoming'),
      },
      {
        id: 'activeStatus',
        title: 'Переведите заявку в тип "Мероприятие"',
        description:
          'Статус "Активно" означает, что клиент подтвердил мероприятие и вы берете его в работу.',
        done: hasActiveEvent,
        actionText: 'Открыть мероприятия',
        onAction: () => router.push('/cabinet/eventsUpcoming'),
      },
    ],
    [events, hasActiveEvent, modalsFunc, router, services]
  )

  const currentStepIndex = useMemo(
    () => steps.findIndex((step) => !step.done),
    [steps]
  )
  const isAllStepsDone = currentStepIndex === -1
  const currentStep =
    currentStepIndex >= 0 && currentStepIndex < steps.length
      ? steps[currentStepIndex]
      : null
  const normalizedSelectedStepIndex =
    selectedStepIndex !== null &&
    selectedStepIndex >= 0 &&
    selectedStepIndex < steps.length
      ? selectedStepIndex
      : null
  const fallbackStepIndex = isAllStepsDone ? steps.length - 1 : currentStepIndex
  const viewedStepIndex =
    normalizedSelectedStepIndex !== null
      ? normalizedSelectedStepIndex
      : fallbackStepIndex
  const viewedStep =
    viewedStepIndex >= 0 && viewedStepIndex < steps.length
      ? steps[viewedStepIndex]
      : null
  const previousSteps =
    currentStepIndex > 0 ? steps.slice(0, currentStepIndex) : []

  useEffect(() => {
    if (servicesLoaded) return undefined
    if (Array.isArray(services) && services.length > 0) {
      setServicesLoaded(true)
      return
    }

    let cancelled = false
    getData('/api/services').then((items) => {
      if (cancelled) return
      if (Array.isArray(items)) setServices(items)
      setServicesLoaded(true)
    })

    return () => {
      cancelled = true
    }
  }, [services, servicesLoaded, setServices])

  useEffect(() => {
    if (forceShowToken) {
      setForceShow(true)
      setCollapsed(false)
    }
  }, [forceShowToken])

  useEffect(() => {
    if (currentStepIndex >= 0) {
      setCollapsed(false)
    }
  }, [currentStepIndex])

  useEffect(() => {
    if (fallbackStepIndex < 0) return
    setSelectedStepIndex((prev) => {
      if (prev === null || !manualStepSelectionRef.current) {
        return fallbackStepIndex
      }
      if (prev < 0 || prev >= steps.length) return fallbackStepIndex
      return prev
    })
  }, [fallbackStepIndex, steps.length])

  useEffect(() => {
    if (collapsed || fallbackStepIndex < 0) return
    manualStepSelectionRef.current = false
    setSelectedStepIndex(fallbackStepIndex)
  }, [collapsed, fallbackStepIndex])

  useEffect(() => {
    if (currentStepIndex <= 0) {
      setShowPreviousSteps(false)
    }
  }, [currentStepIndex])

  useEffect(() => {
    if (!profileReady || forceShow || isCompleted || !isAllStepsDone) return
    if (saveInProgressRef.current) return
    saveInProgressRef.current = true
    postData(
      '/api/site',
      {
        custom: {
          ...(siteSettings?.custom ?? {}),
          releaseOnboardingCompleted: true,
        },
      },
      (data) => setSiteSettings(data),
      null,
      false,
      null
    ).finally(() => {
      saveInProgressRef.current = false
    })
  }, [
    forceShow,
    isAllStepsDone,
    isCompleted,
    profileReady,
    setSiteSettings,
    siteSettings?.custom,
  ])

  const hideForcedMode = () => {
    setForceShow(false)
    postData(
      '/api/site',
      {
        custom: {
          ...(siteSettings?.custom ?? {}),
          releaseOnboardingCompleted: true,
          releaseOnboardingShowToken: null,
        },
      },
      (data) => setSiteSettings(data),
      null,
      false,
      null
    )
  }

  const closeCoach = () => {
    setForceShow(false)
    snackbar.info('Мастер запуска можно снова открыть в меню настроек')
    postData(
      '/api/site',
      {
        custom: {
          ...(siteSettings?.custom ?? {}),
          releaseOnboardingCompleted: true,
          releaseOnboardingShowToken: null,
        },
      },
      (data) => setSiteSettings(data),
      null,
      false,
      null
    )
  }

  if (!profileReady || !servicesLoaded) return null
  if (!forceShow && (isCompleted || !currentStep)) return null
  if (!viewedStep) return null

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="action-icon-button action-icon-button--warning fixed bottom-3 right-3 z-40 inline-flex h-10 items-center justify-center rounded-full px-4 text-sm font-semibold shadow-lg"
      >
        Мастер запуска
      </button>
    )
  }

  return (
    <div className="fixed inset-x-2 bottom-2 z-40 tablet:inset-x-auto tablet:bottom-4 tablet:right-4 tablet:w-[28rem]">
      <div className="surface-card rounded-xl border border-gray-200 px-3 py-3 shadow-xl">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold text-gray-900">
            {isAllStepsDone
              ? `Все шаги выполнены (${steps.length}/${steps.length})`
              : `Шаг ${viewedStepIndex + 1} из ${steps.length}`}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="cursor-pointer text-xs text-gray-500 hover:text-gray-700"
              onClick={closeCoach}
            >
              Закрыть
            </button>
            <button
              type="button"
              className="cursor-pointer text-xs font-semibold text-gray-500 hover:text-gray-700"
              onClick={() => setCollapsed(true)}
            >
              Свернуть
            </button>
          </div>
        </div>

        <div className="text-sm font-semibold text-gray-900">
          {viewedStep.title}
          {!isAllStepsDone && viewedStepIndex === currentStepIndex ? (
            <span className="ml-2 rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-700">
              текущий
            </span>
          ) : null}
        </div>
        <div className="mt-1 text-sm text-gray-600">{viewedStep.description}</div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={viewedStep.onAction}
            className="action-icon-button action-icon-button--warning inline-flex h-9 items-center justify-center rounded px-3 text-sm font-semibold"
          >
            {viewedStep.actionText}
          </button>
          {forceShow && isAllStepsDone ? (
            <button
              type="button"
              onClick={hideForcedMode}
              className="action-icon-button action-icon-button--neutral inline-flex h-9 items-center justify-center rounded px-3 text-sm font-semibold"
            >
              Завершить мастера запуска
            </button>
          ) : null}
          <div className="flex gap-1.5">
            {steps.map((step, idx) => (
              <button
                type="button"
                key={step.id}
                onClick={() => {
                  manualStepSelectionRef.current = true
                  setSelectedStepIndex(idx)
                }}
                className={cn(
                  'h-5 w-8 cursor-pointer rounded-full py-1.5 transition hover:opacity-90',
                  idx < currentStepIndex || isAllStepsDone
                    ? 'bg-emerald-500'
                    : idx === currentStepIndex
                    ? 'bg-orange-500'
                    : 'bg-gray-300',
                  idx === viewedStepIndex ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                )}
                title={`Шаг ${idx + 1}: ${step.title}`}
              />
            ))}
          </div>
        </div>

        {previousSteps.length > 0 && !isAllStepsDone && (
          <div className="mt-3 border-t border-gray-200 pt-2">
            <button
              type="button"
              onClick={() => setShowPreviousSteps((prev) => !prev)}
              className="text-xs font-semibold text-gray-600 hover:text-gray-800"
            >
              {showPreviousSteps
                ? 'Скрыть предыдущие шаги'
                : `Показать предыдущие шаги (${previousSteps.length})`}
            </button>

            {showPreviousSteps && (
              <div className="mt-2 flex flex-col gap-1.5">
                {previousSteps.map((step, idx) => (
                  <div
                    key={step.id}
                    className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1.5 text-xs text-emerald-800"
                  >
                    <span className="font-semibold">✓ Шаг {idx + 1}:</span>{' '}
                    {step.title}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default ReleaseOnboardingCoach
