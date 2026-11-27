'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCheck } from '@fortawesome/free-solid-svg-icons/faCheck'
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import Modal from '@components/Modal'
import { apiJson } from '@helpers/apiClient'
import { formatAddressPoolShort, normalizePartyPoolAddress } from '@helpers/addressPool'
import { canPartyAccess, isPartyRestrictedManagementContext } from '@helpers/partyRolePermissions'
import {
  calculatePartyBooking,
  isPartyServiceAvailable,
} from '@helpers/partyOrderBooking'
import { normalizePartyPaymentExpectation } from '@helpers/partyPaymentExpectations'
import { partyZonedParts, partyDateAtTime } from '@helpers/partyWorkingSchedule'
import usePartyUnsavedChanges, {
  requestPartyLeave,
} from '@components/party/navigation/usePartyUnsavedChanges'
import { PartyEventBriefEditor } from './PartyEventBrief'
import { getPartyBriefAnswer, hasPartyBriefAnswer } from '@helpers/partyBriefTemplates'
import PartyOrderClientPicker from './PartyOrderClientPicker'
import PartyOrderTypeCreateModal from './PartyOrderTypeCreateModal'
import PartyOrderAddressEditor from './PartyOrderAddressEditor'
import PartyOrderServiceModal from './PartyOrderServiceModal'
import PartyOrderServiceParameters from './PartyOrderServiceParameters'
import PartyOrderScheduleModal from './PartyOrderScheduleModal'
import PartyOrderAvailabilityPicker from './PartyOrderAvailabilityPicker'
import PartyInitialExpectations from './PartyInitialExpectations'
import usePartyOrderWizardDraft from './usePartyOrderWizardDraft'
import { getPartyOrderWizardDraftScope } from '@helpers/partyOrderWizardDraft'
import { emptyPartyOrderServiceParameters, previewPartyOrderService } from '@helpers/partyOrderServicePreview'
import { PARTY_ORDER_WIZARD_STEP as STEP } from '@helpers/partyOrderWizardSteps'
import { isPartyCompanyModuleEnabled } from '@helpers/partyCompanyModules'
import { calculatePartyMultiPlaceTotal } from '@helpers/partyMultiPlaceBooking'
import {
  createPartyOrderPlaceDraft,
  previewPartyOrderPlaceDraft,
  serializePartyOrderPlaceDrafts,
  storedPartyOrderPlaceDrafts,
} from '@helpers/partyMultiPlaceOrderDraft'
import {
  PartyMultiPlaceFinance,
  PartyMultiPlaceSelection,
  PartyMultiPlaceServices,
  PartyMultiPlaceTime,
} from './PartyMultiPlaceOrderSteps'

const input =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 aria-invalid:border-red-700'
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50'
const editorButton =
  'min-h-11 cursor-pointer rounded-lg px-2 py-2 text-sm font-semibold text-sky-800 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50'
const steps = ['Клиент', 'Тип', 'Место', 'Услуги', 'Время', 'Бриф', 'Финансы']
const money = (value) => Number(value || 0).toLocaleString('ru-RU') + ' ₽'
const selectionOf = (order) =>
  (order.serviceSelections || order.orderItems?.length
    ? (order.serviceSelections || order.orderItems)
        .filter((item) => item.serviceId)
        .map((item) => ({
          serviceId: String(item.serviceId),
          quantity: item.quantity,
          ...(item.serviceConfiguration?.parameters ? { parameters: item.serviceConfiguration.parameters } : {}),
        }))
    : (order.servicesIds || []).map((serviceId) => ({
        serviceId: String(serviceId),
        quantity: 1,
      })))

function Wizard({
  companyId,
  order = {},
  inboxId,
  options,
  refreshOrderTypes,
  initialStep = STEP.client,
  onSaved,
  onQuickLeadSaved,
  onClose,
  onShowDetails,
  onSwitchToAdvanced,
  onDirtyChange,
}) {
  const context = options.context
  const existing = Boolean(order._id)
  const offsiteAllowed = order.placeType === 'client_address' || isPartyCompanyModuleEnabled(context.company, 'offsite')
  const can = (resource, action = 'read') =>
    canPartyAccess(context, { resource, action })
  const canReadOrderType = can('orders.title')
  const canEditOrderType = can('orders.title', 'edit')
  const canManageCatalog = ['owner', 'admin'].includes(context.role) && !isPartyRestrictedManagementContext(context)
  const canCreateOrderType = canEditOrderType && canManageCatalog
  const canEditServices = can('orders.servicesIds', 'edit')
  const canEditPlaces = ['orders.locationId', 'orders.servicesIds', 'orders.eventDate', 'orders.dateEnd']
    .every((resource) => can(resource, 'edit')) && order.placesEditable !== false
  const canEditBrief = can('orders.eventBrief', 'edit')
  const canEditAddress = can('orders.customAddress', 'edit') || can('orders.clientAddress', 'edit')
  const canReadClient = can('orders.clientId')
  const canEditClient = can('orders.clientId', 'edit')
  const canCaptureLead = !existing && (canEditClient || can('orders.adminComment', 'edit'))
  const timeZone = context.company?.settings?.timeZone || 'Asia/Krasnoyarsk'
  const [draft, setDraft] = useState(() => ({
    orderTypeId: order.orderTypeId ? String(order.orderTypeId) : '',
    placeType:
      order.placeType ||
      (offsiteAllowed && (context.company?.settings?.noOwnPremises || !options.locations.length)
        ? 'client_address'
        : 'company_location'),
    locationId: order.locationId ? String(order.locationId) : '',
    customAddress:
      order.customAddress ||
      formatAddressPoolShort({ ...order.clientAddress, comment: '' }),
    clientAddress: normalizePartyPoolAddress(order.clientAddress),
    serviceSelections: selectionOf(order),
    places: storedPartyOrderPlaceDrafts(order),
    eventDate: order.eventDate || '',
    rental:
      order.rental ||
      (order.locationId && order.eventDate && order.dateEnd
        ? { startsAt: order.eventDate, endsAt: order.dateEnd }
        : null),
    clientId: order.clientId ? String(order.clientId) : '',
    adminComment: order.adminComment || '',
    eventBrief: structuredClone(order.eventBrief || {}),
    discount: structuredClone(order.discount || { type: 'amount', value: 0 }),
  }))
  const [initialPayment, setInitialPayment] = useState({
    amount: '',
    paymentMethod: 'transfer',
  })
  const [expectations, setExpectations] = useState([])
  const [createdClients, setCreatedClients] = useState([])
  const [orderTypeCatalog, setOrderTypeCatalog] = useState(null)
  const [typeCreateOpen, setTypeCreateOpen] = useState(false)
  const [serviceEditor, setServiceEditor] = useState(null)
  const [catalogChanges, setCatalogChanges] = useState({})
  const [scheduleOpen, setScheduleOpen] = useState(false)
  const [updatedLocations, setUpdatedLocations] = useState({})
  const [availabilityRefresh, setAvailabilityRefresh] = useState(0)
  const typeCreateTrigger = useRef(null)
  const typeCatalogRequest = useRef(null)
  const serviceEditorTrigger = useRef(null)
  const scheduleTrigger = useRef(null)
  const orderTypes = orderTypeCatalog ?? options.orderTypes ?? []
  const firstBookingStep = canReadClient && !draft.clientId ? STEP.client : STEP.type
  const requestedStep = existing ? initialStep : canCaptureLead ? STEP.lead : firstBookingStep
  const startStep = requestedStep === STEP.client && !canReadClient ? STEP.type : requestedStep
  const [step, setStep] = useState(startStep)
  const [reachedStep, setReachedStep] = useState(startStep)
  const [clientForm, setClientForm] = useState(null)
  const [clientPickerOpen, setClientPickerOpen] = useState(false)
  const [clientFormVersion, setClientFormVersion] = useState(0)
  const [validationStep, setValidationStep] = useState(null)
  const [invalidBriefField, setInvalidBriefField] = useState(null)
  const [briefValidation, setBriefValidation] = useState(null)
  const multiPlace = Array.isArray(draft.places)
  const selectedServiceIds = [...new Set((multiPlace && draft.places.length
    ? draft.places.flatMap((place) => place.serviceSelections)
    : draft.serviceSelections).map((item) => item.serviceId))]
  const briefKey = JSON.stringify([draft.orderTypeId, selectedServiceIds])
  const updateBriefValidation = useCallback(
    (value) => setBriefValidation({ ...value, key: briefKey }),
    [briefKey]
  )
  const briefCheck = briefValidation?.key === briefKey ? briefValidation : null
  const briefError = canEditBrief
    ? briefCheck?.missingLabel
      ? `Заполните поле «${briefCheck.missingLabel}», чтобы продолжить бронирование.`
      : step === STEP.brief && (briefCheck?.error || !briefCheck || briefCheck.loading)
        ? briefCheck?.error
          ? 'Повторите загрузку брифа, чтобы продолжить.'
          : 'Дождитесь загрузки брифа.'
        : ''
    : ''
  const stepSection = useRef(null)
  const stepHeading = useRef(null)
  const stepProgress = useRef(null)
  const previousStep = useRef(startStep > STEP.client ? null : step)
  const [rentalMinutes, setRentalMinutes] = useState(() =>
    order.rental
      ? (+new Date(order.rental.endsAt) - +new Date(order.rental.startsAt)) /
        60000
      : order.durationMinutes || 60
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [unresolved, setUnresolved] = useState(false)
  const [clientDirty, setClientDirty] = useState(false)
  const [contactDirty, setContactDirty] = useState(false)
  const childDirty = clientDirty || contactDirty
  const attempt = useRef(null)
  const saving = useRef(false)
  const baseline = useRef(JSON.stringify(draft))
  const initialPlaces = useRef(JSON.stringify(draft.places))
  const baselineRentalMinutes = useRef(rentalMinutes)
  const dirty =
    JSON.stringify(draft) !== baseline.current ||
    rentalMinutes !== baselineRentalMinutes.current ||
    expectations.length > 0 ||
    initialPayment.amount !== '' ||
    childDirty ||
    unresolved
  usePartyUnsavedChanges(dirty, {
    label: 'оформление заказа',
    scope: companyId,
    pending: busy,
  })
  useEffect(() => {
    onDirtyChange?.(dirty)
    return () => onDirtyChange?.(false)
  }, [dirty, onDirtyChange])
  useEffect(() => {
    if (!refreshOrderTypes || !canReadOrderType) return
    const controller = new AbortController()
    typeCatalogRequest.current = controller
    apiJson('/api/party/order-types', {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    }).then(({ data }) => {
      if (!controller.signal.aborted) setOrderTypeCatalog(data)
    }).catch(() => {
      // Keep the catalog already supplied with the order options.
    })
    return () => controller.abort()
  }, [canReadOrderType, companyId, refreshOrderTypes])
  const childChanged = useCallback((value) => setClientDirty(value), [])
  const contactChanged = useCallback((value) => setContactDirty(value), [])
  const draftScope = getPartyOrderWizardDraftScope(context, order, inboxId)
  const snapshot = useMemo(() => ({
    draft, step, reachedStep, rentalMinutes, initialPayment, expectations,
    clientForm, createdClients, attempt: attempt.current, unresolved,
    // A create in flight may have committed before the page was interrupted.
    pending: busy,
  }), [draft, step, reachedStep, rentalMinutes, initialPayment, expectations, clientForm, createdClients, unresolved, busy])
  const recovery = usePartyOrderWizardDraft(draftScope, snapshot, dirty || busy || unresolved)
  const canPrice = can('finance.clientAmount')
  const disabled = busy || unresolved || !recovery.ready || Boolean(recovery.recovery)
  const leadMode = step === STEP.lead
  const errorId = 'party-order-wizard-field-error'
  useEffect(() => {
    if (previousStep.current !== step) {
      stepHeading.current?.focus()
      stepProgress.current?.querySelector('[aria-current="step"]')?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      })
    }
    previousStep.current = step
  }, [step])
  const fieldError = (index) => ({
    'aria-invalid': validationStep === index && Boolean(error) || undefined,
    'aria-describedby': validationStep === index && error ? errorId : undefined,
  })
  const reportValidation = (index, message, fromBrief = false) => {
    setStep(index)
    setReachedStep((previous) => Math.max(previous, index))
    setValidationStep(index)
    setInvalidBriefField(fromBrief || (index === STEP.brief && message === briefError)
      ? briefCheck?.missingId || ''
      : null)
    setError(message)
    requestAnimationFrame(() => {
      const section = stepSection.current
      const target = section?.querySelector('[aria-invalid="true"]:not(fieldset):not(:disabled)') ||
        section?.querySelector('select:not(:disabled), input:not(:disabled), textarea:not(:disabled)') ||
        stepHeading.current
      target?.focus()
    })
  }
  const navigateTo = (index) => {
    if (childDirty) {
      setError('Сначала создайте или отмените нового клиента.')
      return
    }
    setError('')
    setValidationStep(null)
    setStep(index)
    setReachedStep((previous) => Math.max(previous, index))
  }
  const startBooking = () => {
    if (reachedStep === STEP.lead) {
      const activeTypes = orderTypes.filter((type) => type.active !== false)
      const availableLocations = options.locations.filter(
        (location) => location.status === 'active' && location.bookingEnabled !== false
      )
      const defaultPlace = can('orders.locationId', 'edit') && draft.placeType === 'company_location' &&
        !draft.locationId && availableLocations.length === 1 ? singleLocationPatch(draft, availableLocations[0]._id) : {}
      setDraft((previous) => ({
        ...previous,
        ...(canEditOrderType && !previous.orderTypeId && activeTypes.length === 1
          ? { orderTypeId: String(activeTypes[0]._id) }
          : {}),
        ...defaultPlace,
      }))
    }
    navigateTo(firstBookingStep)
  }
  const restore = () => {
    const saved = recovery.recovery
    setDraft(saved.draft)
    setBriefValidation(null)
    let restoredStep = saved.step
    if (restoredStep === STEP.client && !canReadClient) {
      restoredStep = saved.reachedStep >= STEP.brief ? STEP.brief : STEP.type
    }
    setStep(restoredStep)
    setReachedStep(Math.max(restoredStep, saved.reachedStep))
    setRentalMinutes(saved.rentalMinutes)
    setInitialPayment(saved.initialPayment)
    setExpectations(saved.expectations)
    setClientForm(saved.clientForm || null)
    setClientPickerOpen(Boolean(saved.clientForm?.open && !saved.attempt && !saved.unresolved && [STEP.lead, STEP.client].includes(restoredStep)))
    setCreatedClients(saved.createdClients || [])
    setClientFormVersion((previous) => previous + 1)
    attempt.current = saved.attempt || null
    setUnresolved(Boolean(saved.attempt || saved.unresolved))
    recovery.accept()
  }
  const location = updatedLocations[draft.locationId] || options.locations.find((item) => String(item._id) === draft.locationId)
  const locations = options.locations.map((item) => updatedLocations[String(item._id)] || item)
  const requiresPlaceEditor = !multiPlace && draft.placeType === 'company_location' && (location?.rentalConfiguration?.hourlyRate || location?.rentalConfiguration?.extras) &&
    (!existing || String(order.locationId) !== draft.locationId)
  const clients = [
    ...options.clients,
    ...createdClients.filter(
      (person) => !options.clients.some((item) => item._id === person._id)
    ),
  ]
  const servicesById = useMemo(
    () =>
      new Map(
        [...options.services.map((service) => [String(service._id), service]), ...Object.entries(catalogChanges)]
      ),
    [options.services, catalogChanges]
  )
  const priorItems = new Map((order.orderItems || order.serviceSelections || [])
    .filter((item) => item.serviceId).map((item) => [String(item.serviceId), item]))
  const previewServices = (selections, changedService) => selections.map((selection) => {
    const id = String(selection.serviceId)
    const service = String(changedService?._id) === id ? changedService : servicesById.get(id)
    return previewPartyOrderService(service, priorItems.get(id), selection)
  })
  const servicePreviews = previewServices(draft.serviceSelections)
  const invalidService = !multiPlace && servicePreviews.find(({ error }) => error)
  const savedPlaces = new Map((order.places || []).map((place) => [place.id, place]))
  const savedLines = order.orderItems || order.serviceSelections || []
  const placePreviews = (draft.places || []).map((place) => {
    const savedPlace = savedPlaces.get(place.id)
    const preview = previewPartyOrderPlaceDraft({
      place,
      location: locations.find((item) => String(item._id) === place.locationId),
      servicesById,
      savedItems: savedLines,
      savedPlace,
      previousLocationId: order.bookingVersion !== 2 ? order.locationId : null,
      previousPricingSnapshot: order.bookingVersion !== 2 ? order.pricingSnapshot : null,
      previousTypeId: order.orderTypeId,
      orderTypeId: draft.orderTypeId,
    })
    return !canEditPlaces && savedPlace ? { ...preview, pricingSnapshot: savedPlace.pricingSnapshot } : preview
  })
  const placeError = canEditPlaces && placePreviews.find(({ place, guestError, placeError, location: selected }) => !place.locationId || !selected || guestError || placeError)
  const multiServiceError = canEditPlaces && (placePreviews.reduce((count, { lines }) => count + lines.length, 0) > 100
    ? 'В заказе может быть до 100 позиций услуг.'
    : placePreviews.find(({ serviceError }) => serviceError)?.serviceError)
  const multiTimeError = canEditPlaces && placePreviews.find(({ timeError }) => timeError)?.timeError
  const untimedPlace = canEditPlaces && placePreviews.find(({ timed }) => !timed)
  const configurationError = multiPlace ? multiServiceError || '' : invalidService
    ? invalidService.configuration
      ? `Проверьте параметры услуги «${invalidService.item.title}».`
      : invalidService.error.message
    : ''
  const preservedItems = (order.orderItems || []).filter((item) => !item.serviceId)
  const initialSelections = selectionOf(order)
  const incompatible = draft.serviceSelections.filter((selection, index) => {
    const prior = initialSelections.find(
      (item) => String(item.serviceId) === String(selection.serviceId)
    )
    const unchanged =
      existing &&
      prior &&
      Number(prior.quantity) === Number(selection.quantity) &&
      JSON.stringify(prior.parameters) === JSON.stringify(servicePreviews[index].normalizedParameters ?? selection.parameters) &&
      String(order.orderTypeId || '') === draft.orderTypeId &&
      String(order.locationId || '') === draft.locationId &&
      order.placeType === draft.placeType
    return (
      !unchanged &&
      !isPartyServiceAvailable(
        servicesById.get(String(selection.serviceId)),
        draft
      )
    )
  })
  let calculation,
    calculationError = ''
  try {
    if (multiPlace) {
      if (placePreviews.length && placePreviews.every(({ pricingSnapshot }) => pricingSnapshot))
        calculation = calculatePartyMultiPlaceTotal(placePreviews, draft.discount)
    } else if (!invalidService) calculation = calculatePartyBooking({
      items: [...servicePreviews.map(({ item }) => item), ...preservedItems],
      rental: draft.rental,
      placeType: draft.placeType,
      hourlyRate:
        order.pricingSnapshot && String(order.locationId) === draft.locationId
          ? Number(order.pricingSnapshot.hourlyRateKopecks || 0) / 100
          : location?.hourlyRentalRate || 0,
      discount: draft.discount,
    })
  } catch (cause) {
    calculationError = cause.message
  }
  const duration = multiPlace || invalidService ? 0 : Math.ceil(
    [...servicePreviews.map(({ item }) => item), ...preservedItems].reduce((total, item) =>
      total + (Number(item.durationMinutes) || 0) * (Number(item.quantity) || 0), 0)
  )
  const programTooLong = duration > 10080
  const dateEnd =
    draft.eventDate && duration > 0 && !programTooLong
      ? new Date(+new Date(draft.eventDate) + duration * 60000).toISOString()
      : draft.rental?.endsAt || ''
  const dateText = (value) =>
    value
      ? new Date(value).toLocaleString('ru-RU', {
          timeZone,
          day: 'numeric',
          month: 'long',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Не указано'
  const edit = (patch) => {
    setDraft((previous) => ({ ...previous, ...(typeof patch === 'function' ? patch(previous) : patch) }))
    setError('')
    setValidationStep(null)
  }
  const makePlace = (values) => createPartyOrderPlaceDraft({ id: crypto.randomUUID(), ...values })
  const primaryPlace = (previous, overrides = {}) => makePlace({
    locationId: previous.locationId,
    eventDate: previous.eventDate,
    rental: previous.rental,
    serviceSelections: previous.serviceSelections.map((item) => ({ ...item, lineId: crypto.randomUUID() })),
    ...overrides,
  })
  function singleLocationPatch(previous, id) {
    const locationId = String(id)
    const configured = options.locations.find((item) => String(item._id) === locationId)?.rentalConfiguration
    return {
      locationId, eventDate: '', rental: null,
      ...(canEditPlaces && (configured?.hourlyRate || configured?.extras) ? {
        places: [primaryPlace(previous, { locationId, eventDate: '', rental: null })],
      } : {}),
    }
  }
  const updatePlace = (id, patch) => edit((previous) => ({
    places: previous.places.map((place) => place.id === id ? { ...place, ...patch } : place),
  }))
  const addPlace = () => {
    const nextPlace = makePlace()
    const places = draft.places || [primaryPlace(draft)]
    if (places.length < 10) edit({ places: [...places, nextPlace] })
  }
  const openPlaceParameters = () => edit({ places: [primaryPlace(draft)] })
  const removePlace = (id) => edit((previous) => ({ places: previous.places.filter((place) => place.id !== id) }))
  const selectServices = (selections, changedService) => {
    edit({ serviceSelections: selections })
    if (!draft.eventDate) {
      const nextDuration = previewServices(selections, changedService).reduce(
        (sum, { item, error }) => error ? sum : sum + Number(item.durationMinutes || 0) * Number(item.quantity || 0),
        0)
      setRentalMinutes(Math.max(1, nextDuration || 60))
    }
  }
  const compatibleServices = step === STEP.services && canEditServices
    ? [...servicesById.values()].filter((service) => isPartyServiceAvailable(service, draft))
    : []
  const addableServices = compatibleServices.filter(
    (service) => !draft.serviceSelections.some((item) => String(item.serviceId) === String(service._id))
  )
  let servicePickerMessage = ''
  if (step === STEP.services && canEditServices && addableServices.length === 0) {
    if (compatibleServices.length > 0) {
      servicePickerMessage = 'Все подходящие услуги уже добавлены.'
    } else if (servicesById.size === 0) {
      servicePickerMessage = canManageCatalog
        ? 'В справочнике пока нет услуг. Чтобы создать услугу, нажмите «+».'
        : 'В справочнике пока нет услуг. Попросите администратора добавить услугу.'
    } else {
      servicePickerMessage = canManageCatalog
        ? 'Для выбранного типа заказа и места нет доступных услуг. Измените тип или место либо проверьте настройки доступности услуги.'
        : 'Для выбранного типа заказа и места нет доступных услуг. Измените тип или место либо попросите администратора проверить доступность услуги.'
    }
  }
  const addServiceSelection = (service) => ({
    serviceId: String(service._id),
    quantity: 1,
    ...(service.configuration ? { parameters: emptyPartyOrderServiceParameters(service.configuration) } : {}),
  })
  const focusServiceParameters = (serviceId) => {
    const row = Array.from(stepSection.current?.querySelectorAll('[data-order-service-id]') || [])
      .find((element) => element.dataset.orderServiceId === serviceId)
    const control = row?.querySelector('[data-service-parameters] :is(input, select):not(:disabled)')
    control?.focus()
    return Boolean(control)
  }
  const addService = (serviceId) => {
    const service = servicesById.get(String(serviceId))
    selectServices([...draft.serviceSelections, addServiceSelection(service)])
    if (service.configuration) requestAnimationFrame(() => focusServiceParameters(String(serviceId)))
  }
  const serviceDetails = (service) =>
    service.configuration ? 'Настраиваемая услуга' : `${service.duration || 0} мин${canPrice ? ` · ${money(service.price)}` : ''}`
  const changeType = async (orderTypeId) => {
    if (childDirty) { setError('Сначала сохраните или отмените новый контакт.'); return }
    const archivedAnswers = [...(draft.eventBrief.archivedAnswers || [])]
    if (draft.orderTypeId && Object.values(draft.eventBrief.customAnswers || {}).some(hasPartyBriefAnswer)) {
      setBusy(true)
      try {
        const result = await apiJson(`/api/party/brief-template?orderTypeId=${draft.orderTypeId}`, { headers: { 'x-partycrm-company-id': companyId }, cache: 'no-store' })
        for (const field of [...(result.data.fields || []), ...(result.data.retiredFields || [])]) {
          const value = getPartyBriefAnswer(draft.eventBrief, field)
          if (hasPartyBriefAnswer(value) && !archivedAnswers.some((answer) => answer.field?.id === field.id && JSON.stringify(answer.value) === JSON.stringify(value))) archivedAnswers.push({ field, value })
        }
      } catch (cause) { setError(cause.message || 'Не удалось сохранить историю брифа'); return }
      finally { setBusy(false) }
    }
    edit({ orderTypeId, eventBrief: { customAnswers: {}, archivedAnswers } })
  }
  const closeTypeCreate = () => {
    setTypeCreateOpen(false)
    requestAnimationFrame(() => typeCreateTrigger.current?.focus())
  }
  const applyCreatedOrderType = async (type) => {
    typeCatalogRequest.current?.abort()
    const typeId = String(type._id)
    setOrderTypeCatalog((previous) => [
      ...(previous ?? options.orderTypes ?? []).filter((item) => String(item._id) !== typeId),
      type,
    ])
    await changeType(typeId)
    closeTypeCreate()
  }
  const openServiceEditor = (serviceId, trigger, placeId) => {
    serviceEditorTrigger.current = trigger
    setServiceEditor({ serviceId, placeId })
  }
  const closeServiceEditor = (focusServiceId) => {
    setServiceEditor(null)
    requestAnimationFrame(() => {
      if (!focusServiceId || !focusServiceParameters(focusServiceId)) serviceEditorTrigger.current?.focus()
    })
  }
  const applySavedService = (service, created) => {
    const serviceId = String(service._id)
    setCatalogChanges((previous) => ({ ...previous, [serviceId]: service }))
    if (serviceEditor?.placeId) {
      const place = draft.places.find((item) => item.id === serviceEditor.placeId)
      if (created && place && isPartyServiceAvailable(service, { orderTypeId: draft.orderTypeId, placeType: 'company_location', locationId: place.locationId })) {
        updatePlace(place.id, { serviceSelections: [...place.serviceSelections, { ...addServiceSelection(service), lineId: crypto.randomUUID() }] })
      } else if (created) setError('Услуга сохранена. Проверьте её доступность для выбранного места.')
      closeServiceEditor()
      return
    }
    if (!created || isPartyServiceAvailable(service, draft)) {
      const selections = created && !draft.serviceSelections.some((item) => item.serviceId === serviceId)
        ? [...draft.serviceSelections, addServiceSelection(service)]
        : !service.configuration && !priorItems.get(serviceId)?.serviceConfiguration
          ? draft.serviceSelections.map((item) => item.serviceId === serviceId
            ? { serviceId: item.serviceId, quantity: item.quantity } : item)
          : draft.serviceSelections
      selectServices(selections, service)
    } else {
      setError('Услуга сохранена. Проверьте её доступность для выбранного типа заказа и места.')
    }
    closeServiceEditor(created && service.configuration ? serviceId : null)
  }
  const closeSchedule = () => {
    setScheduleOpen(false)
    requestAnimationFrame(() => scheduleTrigger.current?.focus())
  }
  const applySavedSchedule = (updatedLocation) => {
    if (updatedLocation) setUpdatedLocations((previous) => ({ ...previous, [String(updatedLocation._id)]: updatedLocation }))
    setAvailabilityRefresh((value) => value + 1)
    closeSchedule()
  }
  const timeError =
    draft.eventDate &&
    draft.placeType === 'company_location' &&
    (!draft.rental ||
      +new Date(draft.eventDate) < +new Date(draft.rental.startsAt) ||
      +new Date(dateEnd) > +new Date(draft.rental.endsAt))
      ? 'Аренда должна полностью вмещать программу. Увеличьте время аренды или измените начало программы.'
      : ''
  const durationError = programTooLong
    ? 'Сократите программу до семи дней.'
    : draft.placeType === 'client_address' && !duration
      ? 'Добавьте услугу с указанной длительностью.'
      : ''
  const stepError = (index) => {
    switch (index) {
      case STEP.client:
        return canReadClient && !draft.clientId ? 'Выберите или создайте клиента.' : ''
      case STEP.type:
        return draft.orderTypeId ? '' : 'Выберите тип заказа.'
      case STEP.place: {
        if (multiPlace) {
          if (!canEditPlaces) return ''
          if (placeError) return placeError.guestError || placeError.placeError?.message || 'Укажите доступное помещение у каждого места.'
          return ''
        }
        if (requiresPlaceEditor) return canEditPlaces
          ? 'Нажмите «Настроить аренду», чтобы выбрать параметры площадки.'
          : 'Для расчёта аренды этой площадки нужны права на изменение места, услуг и времени.'
        const place = draft.placeType === 'company_location' ? draft.locationId : draft.customAddress.trim()
        return place ? '' : 'Укажите помещение или адрес выезда.'
      }
      case STEP.services:
        if (multiPlace) return configurationError
        return configurationError || (incompatible.length ? 'Уберите несовместимые услуги или измените тип и место.' : durationError)
      case STEP.time:
        if (multiPlace) return multiTimeError || (untimedPlace ? `Выберите время места «${untimedPlace.title}».` : '')
        return durationError || timeError || (draft.eventDate ? '' : 'Выберите свободное время.')
      case STEP.brief:
        return briefError
      default:
        return ''
    }
  }
  const leaveWizard = (callback, target) => {
    if (
      !busy &&
      ((inboxId && !dirty) || requestPartyLeave({ kind: 'record', target }))
    )
    {
      recovery.clear()
      callback?.(true)
    }
  }
  const close = () => leaveWizard(onClose, 'close-order-wizard')
  const save = async (complete) => {
    if (saving.current || childDirty) return
    const writePlaces = multiPlace && canEditPlaces && (!existing || order.bookingVersion !== 2 ||
      String(order.orderTypeId || '') !== draft.orderTypeId || JSON.stringify(draft.places) !== initialPlaces.current)
    if (!unresolved && writePlaces && (placeError || multiTimeError)) {
      reportValidation(placeError ? STEP.place : STEP.time, placeError ? stepError(STEP.place) : multiTimeError)
      return
    }
    if (!unresolved && requiresPlaceEditor) {
      reportValidation(STEP.place, stepError(STEP.place))
      return
    }
    if (!unresolved && (multiPlace ? writePlaces && configurationError : configurationError || (programTooLong && !leadMode))) {
      reportValidation(STEP.services, configurationError || durationError)
      return
    }
    if (!unresolved && !multiPlace && !leadMode && draft.eventDate && timeError) {
      reportValidation(STEP.time, timeError)
      return
    }
    if (!unresolved && leadMode && !draft.clientId && !draft.adminComment?.trim()) {
      reportValidation(STEP.lead, 'Выберите клиента, создайте нового или запишите суть обращения.')
      return
    }
    if (!unresolved && complete) {
      for (let index = STEP.client; index < STEP.finance; index++) {
        const message = stepError(index)
        if (message) {
          reportValidation(index, message)
          return
        }
      }
    }
    try {
      if (!unresolved && calculationError) throw new Error(calculationError)
      if (!unresolved)
        for (const payment of expectations)
          normalizePartyPaymentExpectation(payment)
      const body = {
        bookingVersion: multiPlace ? 2 : 1,
        ...(writePlaces ? { places: serializePartyOrderPlaceDrafts(placePreviews) } : {}),
        ...(can('orders.title', 'edit')
          ? { orderTypeId: draft.orderTypeId || null }
          : {}),
        ...(!multiPlace && can('orders.servicesIds', 'edit')
          ? {
              serviceSelections: draft.serviceSelections.map(
                ({ serviceId, quantity }, index) => ({
                  serviceId,
                  quantity: Number(quantity),
                  ...(servicePreviews[index].configuration ? { parameters: servicePreviews[index].normalizedParameters } : {}),
                })
              ),
            }
          : {}),
        ...(!multiPlace && can('orders.placeType', 'edit')
          ? { placeType: draft.placeType }
          : {}),
        ...(!multiPlace && can('orders.locationId', 'edit')
          ? {
              locationId:
                draft.placeType === 'company_location'
                  ? draft.locationId || null
                  : null,
            }
          : {}),
        ...(can('orders.customAddress', 'edit')
          ? { customAddress: draft.customAddress }
          : {}),
        ...(draft.placeType === 'client_address' && can('orders.clientAddress', 'edit') && draft.clientAddress
          ? { clientAddress: draft.clientAddress }
          : {}),
        ...(!multiPlace && can('orders.eventDate', 'edit')
          ? { eventDate: draft.eventDate || null }
          : {}),
        ...(!multiPlace && can('orders.eventDate', 'edit') && can('orders.dateEnd', 'edit')
          ? {
              rental:
                draft.placeType === 'company_location' ? draft.rental : null,
            }
          : {}),
        ...(can('orders.clientId', 'edit')
          ? { clientId: draft.clientId || null }
          : {}),
        ...(can('orders.adminComment', 'edit')
          ? { adminComment: draft.adminComment }
          : {}),
        ...(can('orders.eventBrief', 'edit')
          ? { eventBrief: draft.eventBrief }
          : {}),
        ...(can('finance.clientAmount', 'edit')
          ? {
              discount: {
                ...draft.discount,
                value: Number(draft.discount.value || 0),
              },
            }
          : {}),
        completeBooking: complete,
        ...(existing
          ? {
              commercialRevision: order.commercialRevision || 0,
              ...(canEditBrief ? { expectedUpdatedAt: order.updatedAt } : {}),
            }
          : {
              ...(inboxId ? { inboxId } : {}),
              initialExpectations: expectations.map(
                ({ localId: _local, ...payment }) => payment
              ),
              ...(initialPayment.amount !== '' ? { initialPayment } : {}),
            }),
      }
      if (!existing && !attempt.current)
        attempt.current = { key: crypto.randomUUID(), body }
      if (!existing) recovery.write({ ...snapshot, attempt: attempt.current, unresolved: true })
      saving.current = true
      setBusy(true)
      setError('')
      const result = await apiJson(
        existing ? `/api/party/orders/${order._id}` : '/api/party/orders',
        {
          method: existing ? 'PATCH' : 'POST',
          headers: {
            'x-partycrm-company-id': companyId,
            ...(!existing ? { 'Idempotency-Key': attempt.current.key } : {}),
          },
          body: JSON.stringify(existing ? body : attempt.current.body),
        }
      )
      onDirtyChange?.(false)
      recovery.clear()
      const handleSaved = leadMode && onQuickLeadSaved ? onQuickLeadSaved : onSaved
      handleSaved?.(result.data, result.accessChanged || !result.data)
    } catch (cause) {
      if (
        !existing &&
        attempt.current &&
        (!cause.status || cause.status >= 500) &&
        ![
          'partycrm_initial_payment_transaction_required',
          'partycrm_venue_transaction_required',
          'partycrm_venue_topology_unavailable',
        ].includes(cause.payload?.error?.code)
      )
        setUnresolved(true)
      else if (!unresolved) attempt.current = null
      if (canEditBrief && cause.payload?.error?.code === 'partycrm_booking_brief_required') {
        reportValidation(STEP.brief, 'Заполните обязательные вопросы брифа, чтобы завершить бронирование.', true)
      } else if (multiPlace && cause.payload?.error?.code === 'partycrm_venue_conflict') {
        setAvailabilityRefresh((value) => value + 1)
        reportValidation(STEP.time, cause.message)
      } else {
        setError(cause.message || 'Не удалось сохранить заказ')
      }
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const clientPickerVisible = clientPickerOpen && canReadClient && canEditClient && (leadMode || step === STEP.client)
  const clientFields = canReadClient ? (
    <PartyOrderClientPicker
      key={clientFormVersion}
      companyId={companyId}
      context={context}
      clients={clients}
      selectedId={draft.clientId}
      savedName={order.client?.name}
      canEdit={canEditClient}
      showCreateAction
      disabled={disabled}
      open={clientPickerVisible}
      fieldError={fieldError(leadMode ? STEP.lead : STEP.client)}
      initialForm={clientForm}
      onFormStateChange={setClientForm}
      onDirtyChange={childChanged}
      onOpen={() => setClientPickerOpen(true)}
      onClose={() => {
        setClientPickerOpen(false)
        setClientForm(null)
      }}
      onChoose={(person) => {
        const clientId = person ? String(person._id) : ''
        if (person && !clients.some((item) => String(item._id) === clientId)) {
          setCreatedClients((previous) => [...previous, person])
        }
        edit({ clientId })
      }}
    />
  ) : null
  const title = existing ? 'Параметры заказа' : leadMode ? 'Новая заявка' : 'Бронирование'
  const footer = (
    <div className="w-full space-y-3">
      {error && validationStep !== step ? (
        <p role="alert" className="text-sm text-red-800">
          {error}
        </p>
      ) : null}
      {unresolved ? (
        <p role="status" className="text-sm text-amber-950">
          Связь прервалась. Заказ мог сохраниться. Нажмите «Проверить сохранение».
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!leadMode && (
          <div className="flex flex-wrap gap-2">
            {existing && onShowDetails && (
              <button
                type="button"
                className={editorButton}
                disabled={disabled || childDirty}
                onClick={() => leaveWizard(onShowDetails, 'order-details')}
              >
                Подробная форма
              </button>
            )}
            {existing && onSwitchToAdvanced && (
              <button
                type="button"
                className={editorButton}
                disabled={disabled || childDirty}
                onClick={() => leaveWizard(onSwitchToAdvanced, 'order-advanced-editor')}
              >
                Расширенный режим
              </button>
            )}
            <button
              type="button"
              className={button}
              disabled={disabled || childDirty || step === (canCaptureLead ? STEP.lead : STEP.client)}
              onClick={() => navigateTo(step - 1)}
            >
              Назад
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`${button} ${leadMode ? 'bg-sky-700 !text-white hover:bg-sky-800' : ''}`}
            disabled={busy || childDirty || !recovery.ready || Boolean(recovery.recovery)}
            onClick={() => save(false)}
          >
            {unresolved
              ? 'Проверить сохранение'
              : busy
                ? 'Сохранение…'
                : existing
                ? 'Сохранить изменения'
                : leadMode ? 'Сохранить заявку' : 'Сохранить как заявку'}
          </button>
          {leadMode ? (
            <button
              type="button"
              className={button}
              disabled={disabled || childDirty || (!orderTypes.length && !canCreateOrderType)}
              onClick={startBooking}
            >
              Оформить бронирование
            </button>
          ) : step < STEP.finance ? (
            <button
              type="button"
              className={`${button} bg-sky-700 !text-white hover:bg-sky-800`}
              disabled={disabled || childDirty || (step === STEP.type && !orderTypes.length)}
              onClick={() => {
                const message = stepError(step)
                if (step > STEP.services && configurationError) reportValidation(STEP.services, configurationError)
                else if (message) reportValidation(step, message)
                else navigateTo(step + 1)
              }}
            >
              Далее
            </button>
          ) : (
            <button
              type="button"
              className={`${button} bg-sky-700 !text-white hover:bg-sky-800`}
              disabled={disabled || childDirty}
              onClick={() => save(true)}
            >
              {busy
                ? 'Сохранение…'
                : existing
                  ? 'Проверить и сохранить'
                  : 'Проверить и создать заказ'}
            </button>
          )}
        </div>
      </div>
      {recovery.storageState === 'unavailable' ? (
        <p role="status" className="text-xs text-slate-600">
          Автосохранение в этой вкладке недоступно. Сохраните заявку перед уходом.
        </p>
      ) : null}
    </div>
  )
  const localStart = draft.eventDate
    ? partyZonedParts(draft.eventDate, timeZone)
    : null
  return (
    <Modal
      open
      title={title}
      tone="party"
      size="full"
      inactive={clientPickerVisible || typeCreateOpen || Boolean(serviceEditor) || scheduleOpen}
      onClose={close}
      disableBackdropClick={busy}
      initialFocusRef={existing ? stepHeading : undefined}
      footer={footer}
    >
      <div className="space-y-5">
        {recovery.recovery ? (
          <section aria-label="Восстановление черновика" className="space-y-3 rounded-lg bg-sky-50 p-4 text-sm text-sky-950">
            <p>Остался незавершённый черновик. Продолжить его заполнение?</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className={button} onClick={restore}>Восстановить черновик</button>
              <button type="button" className={button} onClick={recovery.discard}>Начать заново</button>
            </div>
          </section>
        ) : null}
        {leadMode ? null : <ol
          ref={stepProgress}
          className="flex min-w-0 gap-1 overflow-x-auto px-1 pb-1"
          aria-label="Шаги оформления заказа"
        >
          {steps.map((label, index) => (
            <li key={label} className="shrink-0">
              <button
                type="button"
                disabled={disabled || childDirty || index > reachedStep}
                aria-current={step === index ? 'step' : undefined}
                className={`${button} ${step === index ? 'border-sky-700 bg-sky-50 text-sky-950' : 'border-transparent text-slate-600'}`}
                onClick={() => {
                  if (index > STEP.services && configurationError) reportValidation(STEP.services, configurationError)
                  else navigateTo(index)
                }}
              >
                {index + 1}. {label}
              </button>
            </li>
          ))}
        </ol>}
        <h2 ref={stepHeading} tabIndex={-1} className="text-xl font-semibold text-slate-950 outline-none">{leadMode ? 'Клиент и обращение' : steps[step]}</h2>
        {validationStep === step && error ? <p id={errorId} role="alert" className="text-sm text-red-800">{error}</p> : null}
        <fieldset ref={stepSection} disabled={disabled} className="min-w-0 space-y-4" aria-describedby={validationStep === step && error ? errorId : undefined}>
          {leadMode ? (
            <>
              {canReadClient && canEditClient && can('orders.adminComment', 'edit') && (
                <p className="text-sm text-slate-600">Для заявки достаточно выбрать клиента или записать суть обращения.</p>
              )}
              {clientFields}
              {can('orders.adminComment', 'edit') ? (
                <label className="block text-sm">
                  Суть обращения
                  <textarea
                    className={input}
                    rows={3}
                    maxLength={2000}
                    value={draft.adminComment}
                    {...fieldError(STEP.lead)}
                    onChange={(event) => edit({ adminComment: event.target.value })}
                  />
                  <span className="mt-1 block text-xs text-slate-600">Внутренняя заметка менеджера.</span>
                </label>
              ) : null}
              {!orderTypes.length && (
                <p className="text-sm text-slate-600">
                  {canCreateOrderType ? 'Первый тип заказа можно добавить на шаге «Тип».' : 'Для бронирования попросите владельца или администратора добавить тип заказа.'}
                </p>
              )}
            </>
          ) : null}
          {step === STEP.client ? (
            clientFields || <p className="text-sm text-slate-600">Выбор клиента недоступен вашей должности.</p>
          ) : null}
          {step === STEP.type ? (
            <>
              <div className="flex items-end gap-2">
                <label className="min-w-0 flex-1 text-sm">
                  Тип заказа
                  <select
                    aria-label="Тип заказа"
                    {...fieldError(STEP.type)}
                    className={`${input} cursor-pointer`}
                    value={draft.orderTypeId}
                    disabled={!canEditOrderType}
                    onChange={(event) => changeType(event.target.value)}
                  >
                    <option value="">Выберите тип</option>
                    {draft.orderTypeId &&
                    !orderTypes.some((item) => String(item._id) === draft.orderTypeId) ? (
                      <option value={draft.orderTypeId}>
                        {order.orderTypeSnapshot || order.title || 'Сохранённый тип'}
                      </option>
                    ) : null}
                    {orderTypes.map((type) => (
                      <option value={String(type._id)} key={String(type._id)}>
                        {type.title}
                      </option>
                    ))}
                  </select>
                </label>
                {canCreateOrderType && (
                  <button
                    ref={typeCreateTrigger}
                    type="button"
                    aria-label="Добавить тип заказа"
                    title="Добавить тип заказа"
                    aria-haspopup="dialog"
                    aria-expanded={typeCreateOpen}
                    className={`${button} inline-grid size-11 shrink-0 place-items-center`}
                    onClick={() => setTypeCreateOpen(true)}
                  >
                    <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
                  </button>
                )}
              </div>
              <p className="text-sm text-slate-600">
                {orderTypes.length
                  ? 'Тип станет заголовком заказа и определит услуги и вопросы брифа.'
                  : canCreateOrderType
                    ? 'Добавьте первый тип заказа кнопкой «+».'
                    : 'Попросите владельца или администратора добавить тип заказа.'}
              </p>
            </>
          ) : null}
          {step === STEP.place && multiPlace ? (
            <PartyMultiPlaceSelection previews={placePreviews} locations={locations} onAdd={addPlace} onRemove={removePlace} onUpdate={updatePlace}
              canEdit={canEditPlaces && !disabled} canPrice={canPrice} showErrors={validationStep === STEP.place} />
          ) : null}
          {step === STEP.place && !multiPlace ? (
            <>
              <label className="block text-sm">
                Место проведения
                <select
                  aria-label="Место проведения"
                  className={`${input} cursor-pointer`}
                  value={draft.placeType}
                  disabled={!can('orders.placeType', 'edit')}
                  onChange={(event) =>
                    edit({
                      placeType: event.target.value,
                      eventDate: '',
                      rental: null,
                    })
                  }
                >
                  <option value="company_location">В помещении компании</option>
                  {offsiteAllowed ? <option value="client_address">На выезде</option> : null}
                </select>
              </label>
              {draft.placeType === 'company_location' ? (
                <div className="space-y-3">
                <label className="block text-sm">
                  Помещение
                  <select
                    aria-label="Помещение"
                  {...fieldError(STEP.place)}
                    className={`${input} cursor-pointer`}
                    value={draft.locationId}
                    disabled={!can('orders.locationId', 'edit')}
                    onChange={(event) => edit(singleLocationPatch(draft, event.target.value))}
                  >
                    <option value="">Выберите помещение</option>
                    {options.locations.map((item) => (
                      <option key={String(item._id)} value={String(item._id)}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
                {canEditPlaces && requiresPlaceEditor && <button className={button} type="button" onClick={openPlaceParameters}>Настроить аренду</button>}
                {canEditPlaces && locations.some((item) => item.status !== 'archived' && item.bookingEnabled !== false && String(item._id) !== draft.locationId) && (
                  <button type="button" className={button} disabled={!draft.locationId} onClick={addPlace}>Добавить место</button>
                )}
                </div>
              ) : (
                <PartyOrderAddressEditor
                  companyId={companyId}
                  value={draft.clientAddress}
                  addressLine={draft.customAddress}
                  disabled={!canEditAddress}
                  canManage={canManageCatalog}
                  canEditDetails={can('orders.clientAddress', 'edit')}
                  onChange={(update) => edit((previous) => {
                    const clientAddress = update(previous.clientAddress)
                    const line = formatAddressPoolShort({ ...clientAddress, comment: '' })
                    const previousLine = formatAddressPoolShort({ ...previous.clientAddress, comment: '' })
                    return { clientAddress, customAddress: line || (previousLine ? '' : previous.customAddress) }
                  })}
                />
              )}
            </>
          ) : null}
          {step === STEP.services && multiPlace ? (
            <PartyMultiPlaceServices previews={placePreviews} services={servicesById} orderTypeId={draft.orderTypeId}
              update={updatePlace} canEdit={canEditPlaces && !disabled} canPrice={canPrice} canManageCatalog={canManageCatalog}
              onOpenService={(placeId, serviceId, trigger) => openServiceEditor(serviceId, trigger, placeId)} showErrors={validationStep === STEP.services} />
          ) : null}
          {step === STEP.services && !multiPlace ? (
            <>
              {incompatible.length ? (
                <div className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
                  <p>
                    Не подходят выбранному типу или месту:{' '}
                    {incompatible
                      .map(
                        (item) =>
                          servicesById.get(String(item.serviceId))?.title ||
                          'Сохранённая услуга'
                      )
                      .join(', ')}
                    .
                  </p>
                  <button
                    type="button"
                    className={button}
                    onClick={() =>
                      selectServices(
                        draft.serviceSelections.filter(
                          (item) =>
                            !incompatible.some(
                              (invalid) => invalid.serviceId === item.serviceId
                            )
                        )
                      )
                    }
                  >
                    Убрать несовместимые услуги
                  </button>
                </div>
              ) : null}
              {servicePreviews.length ? (
                <div className="space-y-2">
                  <h3 className="text-sm font-semibold text-slate-900">Выбранные услуги</h3>
                  <ul className="space-y-3" role="list" aria-label="Выбранные услуги">
                    {servicePreviews.map(({ item, configuration, parameters, error: serviceError }, index) => {
                      const service = servicesById.get(String(item.serviceId))
                      const changeSelection = (patch) => selectServices(draft.serviceSelections.map((entry, position) =>
                        position === index ? { ...entry, ...patch } : entry
                      ))
                      return (
                        <li
                          className={`grid items-end gap-3 rounded-xl border border-sky-200 bg-sky-50 p-3 text-sky-950 ${
                            service?.repeatable
                              ? 'sm:grid-cols-[minmax(0,1fr)_7rem_auto]'
                              : 'sm:grid-cols-[minmax(0,1fr)_auto]'
                          }`}
                          key={String(item.serviceId)}
                          data-order-service-id={String(item.serviceId)}
                        >
                          <div className="min-w-0">
                            <p className="flex items-start gap-2 font-semibold">
                              <FontAwesomeIcon icon={faCheck} aria-hidden="true" className="mt-1 size-4 shrink-0 text-sky-700" />
                              <span className="min-w-0 [overflow-wrap:anywhere]">{item.title}</span>
                            </p>
                            <p className="mt-1 pl-6 text-sm text-sky-900" aria-live={configuration ? 'polite' : undefined}>
                              {serviceError ? 'Заполните параметры для расчёта' : (
                                <>
                                  {item.durationMinutes || 0} мин за выполнение
                                  {canPrice ? ` · ${money(item.unitPrice)}` : ''}
                                  {!service?.repeatable && Number(item.quantity) > 1
                                    ? ` · ${item.quantity} шт.`
                                    : ''}
                                  {draft.placeType === 'company_location' && item.includedRentalMinutes
                                    ? ` · аренда включена: ${item.includedRentalMinutes} мин`
                                    : ''}
                                </>
                              )}
                            </p>
                          </div>
                          {service?.repeatable ? (
                            <label className="text-sm">
                              Количество
                              <input
                                className={input}
                                type="number"
                                min={1}
                                max={service.maxQuantity || 100000}
                                step={1}
                                disabled={!canEditServices}
                                value={item.quantity}
                                onChange={(event) => changeSelection({ quantity: event.target.value })}
                              />
                            </label>
                          ) : null}
                          <div className="flex flex-wrap gap-2">
                            {canManageCatalog && canEditServices && service && (
                              <button type="button" className={`${button} bg-white`} aria-label={`Редактировать услугу ${item.title}`}
                                onClick={(event) => openServiceEditor(String(item.serviceId), event.currentTarget)}>
                                <FontAwesomeIcon icon={faPencilAlt} aria-hidden="true" />
                              </button>
                            )}
                            <button className={`${button} bg-white`} type="button" disabled={!canEditServices}
                              onClick={() => selectServices(draft.serviceSelections.filter((_, position) => position !== index))}>
                              Убрать
                            </button>
                          </div>
                          {configuration ? (
                            <PartyOrderServiceParameters
                              title={item.title}
                              configuration={configuration}
                              parameters={parameters}
                              error={serviceError}
                              showError={validationStep === STEP.services}
                              canEdit={canEditServices}
                              canPrice={canPrice}
                              onChange={(value) => changeSelection({ parameters: value })}
                            />
                          ) : canEditServices && service?.configuration && (
                            <div className="sm:col-span-full">
                              <button className={editorButton} type="button"
                                onClick={() => {
                                  changeSelection({ parameters: emptyPartyOrderServiceParameters(service.configuration) })
                                  requestAnimationFrame(() => focusServiceParameters(String(item.serviceId)))
                                }}>
                                Настроить по справочнику
                              </button>
                            </div>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ) : null}
              {preservedItems.length ? (
                <div className="rounded-xl border border-slate-200 p-3 text-sm">
                  <p className="font-semibold">Согласованные дополнительные позиции</p>
                  {preservedItems.map((item, index) => (
                    <p key={item.id || index} className="mt-2">
                      {item.title || 'Позиция'} · {item.quantity || 1} шт.
                      {canPrice ? ` · ${money(item.unitPrice)}` : ''}
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="flex items-end gap-2">
              {addableServices.length === 1 ? (
                <button
                  type="button"
                  className={`${button} min-w-0 flex-1 text-left [overflow-wrap:anywhere]`}
                  onClick={() => addService(addableServices[0]._id)}
                >
                  Добавить «{addableServices[0].title}»
                  <span className="block text-xs font-normal text-slate-600">{serviceDetails(addableServices[0])}</span>
                </button>
              ) : addableServices.length > 1 ? (
              <label className="min-w-0 flex-1 text-sm">
                Добавить услугу
                <select
                  aria-label="Добавить услугу"
                  className={`${input} cursor-pointer`}
                  value=""
                  onChange={(event) => {
                    if (event.target.value) addService(event.target.value)
                  }}
                >
                  <option value="">Выберите доступную услугу</option>
                  {addableServices.map((service) => (
                      <option
                        key={String(service._id)}
                        value={String(service._id)}
                      >
                        {service.title} · {serviceDetails(service)}
                      </option>
                    ))}
                </select>
              </label>
              ) : servicePickerMessage ? (
                <p className="min-w-0 flex-1 self-center text-sm text-slate-700">
                  {servicePickerMessage}
                </p>
              ) : null}
              {canManageCatalog && canEditServices && (
                <button type="button" className={`${button} inline-grid size-11 shrink-0 place-items-center`} aria-label="Создать услугу" title="Создать услугу" aria-haspopup="dialog"
                  onClick={(event) => openServiceEditor('', event.currentTarget)}>
                  <FontAwesomeIcon icon={faPlus} aria-hidden="true" />
                </button>
              )}
              </div>
              {canManageCatalog && canEditServices && servicesById.size > 0 && (
                <details className="text-sm">
                  <summary className="min-h-11 cursor-pointer py-3 font-medium">Редактировать услугу из справочника</summary>
                  <select aria-label="Услуга для редактирования" className={`${input} cursor-pointer`} value="" onChange={(event) => {
                    if (event.target.value) openServiceEditor(event.target.value, event.currentTarget)
                  }}>
                    <option value="">Выберите услугу</option>
                    {Array.from(servicesById.values()).map((service) => <option key={String(service._id)} value={String(service._id)}>{service.title}</option>)}
                  </select>
                </details>
              )}
              <p className="text-sm font-semibold">
                {invalidService ? 'Итог программы появится после заполнения параметров.' : (
                  <>
                    Программа: {duration} мин
                    {canPrice && calculation ? ` · услуги на ${money(calculation.servicesKopecks / 100)}` : ''}
                    {draft.placeType === 'company_location'
                      ? ` · включено аренды: ${calculation?.includedRentalMinutes || 0} мин`
                      : ''}
                  </>
                )}
              </p>
              <p className="text-xs text-slate-600">
                Услуги идут последовательно. Для аренды без программы можно
                оставить список пустым.
              </p>
            </>
          ) : null}
          {step === STEP.time && multiPlace ? (
            <PartyMultiPlaceTime previews={placePreviews} companyId={companyId} orderId={order._id} timeZone={timeZone}
              onUpdate={updatePlace} canEdit={canEditPlaces && !disabled} refreshKey={availabilityRefresh} />
          ) : null}
          {step === STEP.time && !multiPlace ? (
            <>
              {draft.placeType === 'company_location' ? (
                <label className="block text-sm">
                  Длительность аренды, минут
                  <input
                    type="number"
                    min={Math.max(duration, 1)}
                    max={10080}
                    step={1}
                    className={input}
                    value={rentalMinutes}
                    onChange={(event) => {
                      const minutes = event.target.value
                      setRentalMinutes(minutes)
                      if (draft.rental?.startsAt && Number(minutes) > 0)
                        edit({
                          rental: {
                            startsAt: draft.rental.startsAt,
                            endsAt: new Date(
                              +new Date(draft.rental.startsAt) +
                                Number(minutes) * 60000
                            ).toISOString(),
                          },
                        })
                    }}
                  />
                </label>
              ) : (
                <p className="text-sm">
                  Длительность программы: {duration} мин
                </p>
              )}
              {canManageCatalog && can('orders.eventDate', 'edit') && (
                <button ref={scheduleTrigger} className={button} type="button" aria-haspopup="dialog" onClick={() => setScheduleOpen(true)}>
                  {location?.workingSchedule ? 'Настроить график помещения' : 'Настроить график бронирования'}
                </button>
              )}
              <PartyOrderAvailabilityPicker
                companyId={companyId}
                orderId={order._id}
                placeType={draft.placeType}
                locationId={draft.locationId}
                durationMinutes={
                  draft.placeType === 'company_location'
                    ? Number(rentalMinutes)
                    : duration
                }
                refreshKey={availabilityRefresh}
                selectedStart={draft.rental?.startsAt || draft.eventDate}
                timeZone={timeZone}
                disabled={
                  disabled ||
                  Boolean(invalidService) ||
                  programTooLong ||
                  !can('orders.eventDate', 'edit') ||
                  !can('orders.dateEnd', 'edit')
                }
                onSelect={(slot) =>
                  edit({
                    eventDate: slot.startsAt,
                    rental:
                      draft.placeType === 'company_location' ? slot : null,
                  })
                }
              />
              {draft.rental && duration > 0 ? (
                <label className="block text-sm">
                  Начало программы внутри аренды
                  <input
                    type="datetime-local"
                    className={input}
                    value={
                      localStart
                        ? `${localStart.year}-${localStart.month}-${localStart.day}T${localStart.hour}:${localStart.minute}`
                        : ''
                    }
                    onChange={(event) => {
                      if (event.target.value)
                        edit({
                          eventDate: partyDateAtTime(
                            event.target.value.slice(0, 10),
                            event.target.value.slice(11, 16),
                            timeZone
                          ).toISOString(),
                        })
                    }}
                  />
                </label>
              ) : null}
              {draft.eventDate ? (
                <div className="space-y-1 rounded-lg bg-sky-50 p-3 text-sm text-sky-950">
                  <p>
                    Программа: {dateText(draft.eventDate)} — {dateText(dateEnd)}
                  </p>
                  {draft.rental ? (
                    <p>
                      Аренда: {dateText(draft.rental.startsAt)} —{' '}
                      {dateText(draft.rental.endsAt)}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {timeError ? (
                <p role="alert" className="text-sm text-red-800">
                  {timeError}
                </p>
              ) : null}
            </>
          ) : null}
          {step === STEP.brief && can('orders.eventBrief') ? (
            <PartyEventBriefEditor
              key={draft.orderTypeId}
              value={draft.eventBrief}
              onChange={(eventBrief) => edit({ eventBrief })}
              companyId={companyId}
              orderId={order._id || ''}
              orderTypeId={draft.orderTypeId}
              contactOptions={{ ...options, clients }}
              onContactDirtyChange={contactChanged}
              timeZone={timeZone}
              servicesIds={selectedServiceIds}
              booking
              onValidationChange={canEditBrief ? updateBriefValidation : undefined}
              invalidFieldId={validationStep === STEP.brief ? invalidBriefField : undefined}
              validationErrorId={errorId}
              disabled={disabled || !canEditBrief}
            />
          ) : null}
          {step === STEP.finance ? (
            <>
              <div className="space-y-2 rounded-xl border border-slate-200 p-4">
                <p className="font-semibold">
                  {orderTypes.find(
                    (type) => String(type._id) === draft.orderTypeId
                  )?.title ||
                    order.orderTypeSnapshot ||
                    'Заказ'}
                </p>
                {multiPlace ? <PartyMultiPlaceFinance previews={placePreviews} timeZone={timeZone} canPrice={canPrice} /> : <><p className="text-sm">
                  {draft.placeType === 'company_location'
                    ? location?.title || 'Помещение не выбрано'
                    : draft.customAddress}
                </p>
                <p className="text-sm">
                  {dateText(draft.eventDate)} — {dateText(dateEnd)}
                </p></>}
                {multiPlace && calculation?.durationMinutes > 0 ? <p className="text-sm">Длительность события · {calculation.durationMinutes} мин</p> : null}
                {canPrice && calculation ? (
                  <dl className="space-y-2 border-t border-slate-200 pt-3 text-sm tabular-nums">
                    {!multiPlace && <div className="flex justify-between gap-3">
                      <dt>Услуги</dt>
                      <dd>{money(calculation.servicesKopecks / 100)}</dd>
                    </div>}
                    {!multiPlace && draft.placeType === 'company_location' ? (
                      <div className="flex justify-between gap-3">
                        <dt>Аренда · {calculation.billedHours} ч к оплате</dt>
                        <dd>{money(calculation.rentalKopecks / 100)}</dd>
                      </div>
                    ) : null}
                    {calculation.discountKopecks > 0 ? (
                      <div className="flex justify-between gap-3">
                        <dt>Скидка</dt>
                        <dd>{money(calculation.discountKopecks / 100)}</dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-3 text-lg font-semibold">
                      <dt>Договорная сумма</dt>
                      <dd>{money(calculation.totalKopecks / 100)}</dd>
                    </div>
                  </dl>
                ) : null}
              </div>
              {can('finance.clientAmount', 'edit') ? (
                <details className="rounded-lg border border-slate-200 px-3">
                  <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-800">
                    Добавить скидку
                    {Number(draft.discount.value) > 0 ? (
                      <span className="font-normal text-slate-600">
                        {' · '}{draft.discount.type === 'percent' ? `${draft.discount.value}%` : money(draft.discount.value)}
                      </span>
                    ) : null}
                  </summary>
                  <div className="grid gap-3 pb-3 sm:grid-cols-2">
                    <label className="text-sm">
                      Скидка
                      <select
                        aria-label="Способ задания скидки"
                        className={`${input} cursor-pointer`}
                        value={draft.discount.type}
                        onChange={(event) =>
                          edit({ discount: { ...draft.discount, type: event.target.value } })
                        }
                      >
                        <option value="amount">Суммой, ₽</option>
                        <option value="percent">Процентом, %</option>
                      </select>
                    </label>
                    <label className="text-sm">
                      Размер скидки
                      <input
                        type="number"
                        min={0}
                        max={draft.discount.type === 'percent' ? 100 : undefined}
                        step="0.01"
                        className={input}
                        value={draft.discount.value}
                        onChange={(event) =>
                          edit({ discount: { ...draft.discount, value: event.target.value } })
                        }
                      />
                    </label>
                  </div>
                </details>
              ) : null}
              {calculationError ? (
                <p role="alert" className="text-sm text-red-800">
                  {calculationError}
                </p>
              ) : null}
              {!existing && can('finance.payments', 'edit') ? (
                <details className="rounded-lg border border-slate-200 px-3">
                  <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-slate-800">
                    Записать полученный аванс
                    {initialPayment.amount !== '' ? (
                      <span className="font-normal text-slate-600">{' · '}{money(initialPayment.amount)}</span>
                    ) : null}
                  </summary>
                  <div className="grid min-w-0 gap-3 pb-3 sm:grid-cols-2">
                    <label className="text-sm">
                      Получено, ₽
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        className={input}
                        value={initialPayment.amount}
                        onChange={(event) =>
                          setInitialPayment({ ...initialPayment, amount: event.target.value })
                        }
                      />
                    </label>
                    <label className="text-sm">
                      Способ оплаты
                      <select
                        className={`${input} cursor-pointer`}
                        value={initialPayment.paymentMethod}
                        onChange={(event) =>
                          setInitialPayment({ ...initialPayment, paymentMethod: event.target.value })
                        }
                      >
                        <option value="transfer">Перевод</option>
                        <option value="cash">Наличные</option>
                        <option value="account">Расчётный счёт</option>
                      </select>
                    </label>
                  </div>
                </details>
              ) : null}
              {!existing ? (
                <PartyInitialExpectations
                  context={context}
                  value={expectations}
                  onChange={setExpectations}
                  disabled={disabled}
                  timeZone={timeZone}
                />
              ) : (
                <p className="text-sm text-slate-600">
                  Платежи и ожидания доступны в разделе «Финансы» сохранённого
                  заказа.
                </p>
              )}
            </>
          ) : null}
        </fieldset>
      </div>
      {typeCreateOpen && <PartyOrderTypeCreateModal companyId={companyId} onClose={closeTypeCreate} onCreated={applyCreatedOrderType} />}
      {serviceEditor && <PartyOrderServiceModal companyId={companyId} serviceId={serviceEditor.serviceId} onClose={closeServiceEditor} onSaved={applySavedService} />}
      {scheduleOpen && <PartyOrderScheduleModal companyId={companyId} location={location?.workingSchedule ? location : null} onClose={closeSchedule} onSaved={applySavedSchedule} />}
    </Modal>
  )
}

export default function PartyOrderWizard({ options, ...props }) {
  const [remote, setRemote] = useState({ options: null, error: '' })
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    if (options) return
    const controller = new AbortController()
    apiJson(
      `/api/party/order-options${props.order?._id ? `?orderId=${props.order._id}` : ''}`,
      {
        headers: { 'x-partycrm-company-id': props.companyId },
        cache: 'no-store',
        signal: controller.signal,
      }
    )
      .then((result) => {
        if (!controller.signal.aborted)
          setRemote({ options: result.data, error: '' })
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setRemote({ options: null, error: cause.message })
      })
    return () => controller.abort()
  }, [options, props.companyId, props.order?._id, retry])
  const resolved = options || remote.options
  if (!resolved)
    return (
      <Modal
        open
        title="Оформление заказа"
        tone="party"
        size="full"
        onClose={props.onClose}
      >
        {remote.error ? (
          <div role="alert">
            <p>{remote.error}</p>
            <button
              type="button"
              className={button}
              onClick={() => setRetry((value) => value + 1)}
            >
              Повторить загрузку
            </button>
          </div>
        ) : (
          <p role="status">Загрузка формы заказа…</p>
        )}
      </Modal>
    )
  const scope = getPartyOrderWizardDraftScope(resolved.context, props.order, props.inboxId)
  return <Wizard key={`${scope?.key || props.companyId}:${scope?.signature || ''}`} {...props} options={resolved} refreshOrderTypes={Boolean(options)} />
}
