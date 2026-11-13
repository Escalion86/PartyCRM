'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
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
import PartyOrderScheduleModal from './PartyOrderScheduleModal'
import PartyOrderAvailabilityPicker from './PartyOrderAvailabilityPicker'
import PartyInitialExpectations from './PartyInitialExpectations'
import usePartyOrderWizardDraft from './usePartyOrderWizardDraft'
import { getPartyOrderWizardDraftScope } from '@helpers/partyOrderWizardDraft'

const input =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 aria-invalid:border-red-700'
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50'
const steps = ['Тип', 'Место', 'Услуги', 'Время', 'Клиент и бриф', 'Финансы']
const money = (value) => Number(value || 0).toLocaleString('ru-RU') + ' ₽'
const selectionOf = (order) =>
  order.serviceSelections ||
  (order.orderItems?.length
    ? order.orderItems
        .filter((item) => item.serviceId)
        .map((item) => ({
          serviceId: String(item.serviceId),
          quantity: item.quantity,
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
  onSaved,
  onClose,
  onDirtyChange,
}) {
  const context = options.context
  const existing = Boolean(order._id)
  const can = (resource, action = 'read') =>
    canPartyAccess(context, { resource, action })
  const canReadOrderType = can('orders.title')
  const canEditOrderType = can('orders.title', 'edit')
  const canManageCatalog = ['owner', 'admin'].includes(context.role) && !isPartyRestrictedManagementContext(context)
  const canCreateOrderType = canEditOrderType && canManageCatalog
  const canEditServices = can('orders.servicesIds', 'edit')
  const canEditBrief = can('orders.eventBrief', 'edit')
  const canEditAddress = can('orders.customAddress', 'edit') || can('orders.clientAddress', 'edit')
  const canCaptureLead = !existing && (can('orders.clientId', 'edit') || can('orders.adminComment', 'edit'))
  const timeZone = context.company?.settings?.timeZone || 'Asia/Krasnoyarsk'
  const [draft, setDraft] = useState(() => ({
    orderTypeId: order.orderTypeId ? String(order.orderTypeId) : '',
    placeType:
      order.placeType ||
      (context.company?.settings?.noOwnPremises || !options.locations.length
        ? 'client_address'
        : 'company_location'),
    locationId: order.locationId ? String(order.locationId) : '',
    customAddress:
      order.customAddress ||
      formatAddressPoolShort({ ...order.clientAddress, comment: '' }),
    clientAddress: normalizePartyPoolAddress(order.clientAddress),
    serviceSelections: selectionOf(order),
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
  const [step, setStep] = useState(canCaptureLead ? -1 : 0)
  const [reachedStep, setReachedStep] = useState(canCaptureLead ? -1 : 0)
  const [clientForm, setClientForm] = useState(null)
  const [clientPickerOpen, setClientPickerOpen] = useState(false)
  const [clientFormVersion, setClientFormVersion] = useState(0)
  const [validationStep, setValidationStep] = useState(null)
  const [invalidBriefField, setInvalidBriefField] = useState(null)
  const [briefValidation, setBriefValidation] = useState(null)
  const briefKey = JSON.stringify([draft.orderTypeId, draft.serviceSelections.map((item) => item.serviceId)])
  const updateBriefValidation = useCallback(
    (value) => setBriefValidation({ ...value, key: briefKey }),
    [briefKey]
  )
  const briefCheck = briefValidation?.key === briefKey ? briefValidation : null
  const briefError = canEditBrief
    ? briefCheck?.missingLabel
      ? `Заполните поле «${briefCheck.missingLabel}», чтобы продолжить бронирование.`
      : step === 4 && (briefCheck?.error || !briefCheck || briefCheck.loading)
        ? briefCheck?.error
          ? 'Повторите загрузку брифа, чтобы продолжить.'
          : 'Дождитесь загрузки брифа.'
        : ''
    : ''
  const stepSection = useRef(null)
  const stepHeading = useRef(null)
  const stepProgress = useRef(null)
  const previousStep = useRef(step)
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
  const leadMode = step === -1
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
    setInvalidBriefField(fromBrief || (index === 4 && message === briefError)
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
    if (reachedStep < 0) {
      const activeTypes = orderTypes.filter((type) => type.active !== false)
      const availableLocations = options.locations.filter(
        (location) => location.status === 'active' && location.bookingEnabled !== false
      )
      setDraft((previous) => ({
        ...previous,
        ...(canEditOrderType && !previous.orderTypeId && activeTypes.length === 1
          ? { orderTypeId: String(activeTypes[0]._id) }
          : {}),
        ...(can('orders.locationId', 'edit') &&
        previous.placeType === 'company_location' &&
        !previous.locationId &&
        availableLocations.length === 1
          ? { locationId: String(availableLocations[0]._id) }
          : {}),
      }))
    }
    navigateTo(0)
  }
  const restore = () => {
    const saved = recovery.recovery
    setDraft(saved.draft)
    setBriefValidation(null)
    setStep(saved.step)
    setReachedStep(saved.reachedStep)
    setRentalMinutes(saved.rentalMinutes)
    setInitialPayment(saved.initialPayment)
    setExpectations(saved.expectations)
    setClientForm(saved.clientForm || null)
    setClientPickerOpen(Boolean(saved.clientForm?.open && !saved.attempt && !saved.unresolved && [-1, 4].includes(saved.step)))
    setCreatedClients(saved.createdClients || [])
    setClientFormVersion((previous) => previous + 1)
    attempt.current = saved.attempt || null
    setUnresolved(Boolean(saved.attempt || saved.unresolved))
    recovery.accept()
  }
  const location = updatedLocations[draft.locationId] || options.locations.find((item) => String(item._id) === draft.locationId)
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
  const items = draft.serviceSelections.map((selection) => {
    const service = servicesById.get(String(selection.serviceId))
    const prior =
      order.orderItems?.find(
        (item) => String(item.serviceId) === String(selection.serviceId)
      ) ||
      order.serviceSelections?.find(
        (item) => String(item.serviceId) === String(selection.serviceId)
      )
    return {
      ...service,
      ...prior,
      serviceId: selection.serviceId,
      quantity: selection.quantity,
      unitPrice: prior?.unitPrice ?? service?.price ?? 0,
      durationMinutes: prior?.durationMinutes ?? service?.duration ?? 0,
      includedRentalMinutes:
        prior?.includedRentalMinutes ?? service?.includedRentalMinutes ?? 0,
      title: prior?.title || service?.title || 'Сохранённая услуга',
    }
  })
  const preservedItems = (order.orderItems || []).filter((item) => !item.serviceId)
  const incompatible = draft.serviceSelections.filter((selection) => {
    const prior = selectionOf(order).find(
      (item) => String(item.serviceId) === String(selection.serviceId)
    )
    const unchanged =
      existing &&
      prior &&
      Number(prior.quantity) === Number(selection.quantity) &&
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
    calculation = calculatePartyBooking({
      items: [...items, ...preservedItems],
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
  const duration = Math.ceil(calculation?.durationMinutes || 0)
  const dateEnd =
    draft.eventDate && duration
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
    setDraft((previous) => ({ ...previous, ...patch }))
    setError('')
    setValidationStep(null)
  }
  const selectServices = (selections, changedService) => {
    edit({ serviceSelections: selections })
    if (!draft.eventDate) {
      const nextDuration = selections.reduce(
        (sum, item) => {
          const service = String(changedService?._id) === String(item.serviceId)
            ? changedService : servicesById.get(String(item.serviceId))
          return sum + (Number(service?.duration) || 0) * Number(item.quantity || 0)
        },
        0
      )
      setRentalMinutes(Math.max(1, nextDuration || 60))
    }
  }
  const addableServices = step === 2 && canEditServices
    ? [...servicesById.values()].filter(
      (service) => isPartyServiceAvailable(service, draft) &&
        !draft.serviceSelections.some((item) => String(item.serviceId) === String(service._id))
    )
    : []
  const addService = (serviceId) =>
    selectServices([...draft.serviceSelections, { serviceId: String(serviceId), quantity: 1 }])
  const serviceDetails = (service) =>
    `${service.duration || 0} мин${canPrice ? ` · ${money(service.price)}` : ''}`
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
  const openServiceEditor = (serviceId, trigger) => {
    serviceEditorTrigger.current = trigger
    setServiceEditor({ serviceId })
  }
  const closeServiceEditor = () => {
    setServiceEditor(null)
    requestAnimationFrame(() => serviceEditorTrigger.current?.focus())
  }
  const applySavedService = (service, created) => {
    const serviceId = String(service._id)
    setCatalogChanges((previous) => ({ ...previous, [serviceId]: service }))
    if (!created || isPartyServiceAvailable(service, draft)) {
      const selections = created ? [...draft.serviceSelections, { serviceId, quantity: 1 }] : draft.serviceSelections
      selectServices(selections, service)
    } else {
      setError('Услуга сохранена. Проверьте её доступность для выбранного типа заказа и места.')
    }
    closeServiceEditor()
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
  const stepError = (index) =>
    index === 0 && !draft.orderTypeId
      ? 'Выберите тип заказа.'
      : index === 1 &&
          (draft.placeType === 'company_location'
            ? !draft.locationId
            : !draft.customAddress.trim())
        ? 'Укажите помещение или адрес выезда.'
        : index === 2 && incompatible.length
          ? 'Уберите несовместимые услуги или измените тип и место.'
        : (index === 2 || index === 3) && draft.placeType === 'client_address' && !duration
            ? 'Добавьте услугу с указанной длительностью.'
          : index === 3 && (!draft.eventDate || timeError)
            ? timeError || 'Выберите свободное время.'
            : index === 4 && can('orders.clientId') && !draft.clientId
              ? 'Выберите или создайте клиента.'
              : index === 4 ? briefError : ''
  const close = () => {
    if (
      !busy &&
      ((inboxId && !dirty) || requestPartyLeave({ kind: 'record', target: 'close-order-wizard' }))
    )
    {
      recovery.clear()
      onClose?.(true)
    }
  }
  const save = async (complete) => {
    if (saving.current || childDirty) return
    if (!unresolved && leadMode && !draft.clientId && !draft.adminComment?.trim()) {
      reportValidation(-1, 'Выберите клиента, создайте нового или запишите суть обращения.')
      return
    }
    if (!unresolved && complete) {
      for (let index = 0; index < 5; index++) {
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
        bookingVersion: 1,
        ...(can('orders.title', 'edit')
          ? { orderTypeId: draft.orderTypeId || null }
          : {}),
        ...(can('orders.servicesIds', 'edit')
          ? {
              serviceSelections: draft.serviceSelections.map(
                ({ serviceId, quantity }) => ({
                  serviceId,
                  quantity: Number(quantity),
                })
              ),
            }
          : {}),
        ...(can('orders.placeType', 'edit')
          ? { placeType: draft.placeType }
          : {}),
        ...(can('orders.locationId', 'edit')
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
        ...(can('orders.eventDate', 'edit')
          ? { eventDate: draft.eventDate || null }
          : {}),
        ...(can('orders.eventDate', 'edit') && can('orders.dateEnd', 'edit')
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
          ? { commercialRevision: order.commercialRevision || 0 }
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
      onSaved?.(result.data, result.accessChanged || !result.data)
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
        reportValidation(4, 'Заполните обязательные вопросы брифа, чтобы завершить бронирование.', true)
      } else {
        setError(cause.message || 'Не удалось сохранить заказ')
      }
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const canReadClient = can('orders.clientId')
  const canEditClient = can('orders.clientId', 'edit')
  const clientPickerVisible = clientPickerOpen && canReadClient && canEditClient && (leadMode || step === 4)
  const clientFields = canReadClient ? (
    <PartyOrderClientPicker
      key={clientFormVersion}
      companyId={companyId}
      context={context}
      clients={clients}
      selectedId={draft.clientId}
      savedName={order.client?.name}
      canEdit={canEditClient}
      showCreateButton={leadMode && !draft.clientId}
      disabled={disabled}
      open={clientPickerVisible}
      fieldError={validationStep === 4 && invalidBriefField !== null ? undefined : fieldError(leadMode ? -1 : 4)}
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
        {!leadMode && <button
          type="button"
          className={button}
          disabled={disabled || childDirty || step === (canCaptureLead ? -1 : 0)}
          onClick={() => navigateTo(step - 1)}
        >
          Назад
        </button>}
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
          ) : step < 5 ? (
            <button
              type="button"
              className={`${button} bg-sky-700 !text-white hover:bg-sky-800`}
              disabled={disabled || childDirty || (step === 0 && !orderTypes.length)}
              onClick={() => {
                const message = stepError(step)
                if (message) reportValidation(step, message)
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
      {leadMode ? <p className="text-xs leading-5 text-slate-600">Для заявки достаточно клиента или заметки.</p> : null}
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
                onClick={() => navigateTo(index)}
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
              {clientFields}
              {can('orders.adminComment', 'edit') ? (
                <label className="block text-sm">
                  Суть обращения
                  <textarea
                    className={input}
                    rows={3}
                    maxLength={2000}
                    value={draft.adminComment}
                    {...fieldError(-1)}
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
          {step === 0 ? (
            <>
              <div className="flex items-end gap-2">
                <label className="min-w-0 flex-1 text-sm">
                  Тип заказа
                  <select
                    aria-label="Тип заказа"
                    {...fieldError(0)}
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
          {step === 1 ? (
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
                  <option value="client_address">На выезде</option>
                </select>
              </label>
              {draft.placeType === 'company_location' ? (
                <label className="block text-sm">
                  Помещение
                  <select
                    aria-label="Помещение"
                  {...fieldError(1)}
                    className={`${input} cursor-pointer`}
                    value={draft.locationId}
                    disabled={!can('orders.locationId', 'edit')}
                    onChange={(event) =>
                      edit({
                        locationId: event.target.value,
                        eventDate: '',
                        rental: null,
                      })
                    }
                  >
                    <option value="">Выберите помещение</option>
                    {options.locations.map((item) => (
                      <option key={String(item._id)} value={String(item._id)}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <PartyOrderAddressEditor
                  companyId={companyId}
                  value={draft.clientAddress}
                  addressLine={draft.customAddress}
                  disabled={!canEditAddress}
                  canManage={canManageCatalog}
                  canEditDetails={can('orders.clientAddress', 'edit')}
                  onChange={(clientAddress) => {
                    const line = formatAddressPoolShort({ ...clientAddress, comment: '' })
                    const previousLine = formatAddressPoolShort({ ...draft.clientAddress, comment: '' })
                    edit({ clientAddress, customAddress: line || (previousLine ? '' : draft.customAddress) })
                  }}
                />
              )}
            </>
          ) : null}
          {step === 2 ? (
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
              <div className="space-y-3">
                {items.map((item, index) => {
                  const service = servicesById.get(String(item.serviceId))
                  return (
                    <div
                      className="grid items-end gap-3 rounded-xl border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto]"
                      key={String(item.serviceId)}
                    >
                      <div>
                        <p className="font-semibold">{item.title}</p>
                        <p className="mt-1 text-sm text-slate-600">
                          {item.durationMinutes || 0} мин за выполнение
                          {canPrice ? ` · ${money(item.unitPrice)}` : ''}
                          {draft.placeType === 'company_location' &&
                          item.includedRentalMinutes
                            ? ` · аренда включена: ${item.includedRentalMinutes} мин`
                            : ''}
                        </p>
                      </div>
                      <label className="text-sm">
                        Количество
                        <input
                          className={input}
                          type="number"
                          min={1}
                          max={
                            service?.repeatable
                              ? service.maxQuantity || 100000
                              : Math.max(1, Number(item.quantity))
                          }
                          step={1}
                          disabled={
                            !can('orders.servicesIds', 'edit') ||
                            !service?.repeatable
                          }
                          value={item.quantity}
                          onChange={(event) =>
                            selectServices(
                              draft.serviceSelections.map((entry, position) =>
                                position === index
                                  ? { ...entry, quantity: event.target.value }
                                  : entry
                              )
                            )
                          }
                        />
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {canManageCatalog && canEditServices && service && (
                          <button type="button" className={button} aria-label={`Редактировать услугу ${item.title}`}
                            onClick={(event) => openServiceEditor(String(item.serviceId), event.currentTarget)}>
                            <FontAwesomeIcon icon={faPencilAlt} aria-hidden="true" />
                          </button>
                        )}
                        <button className={button} type="button" disabled={!canEditServices}
                          onClick={() => selectServices(draft.serviceSelections.filter((_, position) => position !== index))}>
                          Убрать
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
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
                Программа: {duration} мин
                {draft.placeType === 'company_location'
                  ? ` · включено аренды: ${calculation?.includedRentalMinutes || 0} мин`
                  : ''}
              </p>
              <p className="text-xs text-slate-600">
                Услуги идут последовательно. Для аренды без программы можно
                оставить список пустым.
              </p>
            </>
          ) : null}
          {step === 3 ? (
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
          {step === 4 ? (
            <>
              {clientFields}
              {can('orders.eventBrief') ? (
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
                  servicesIds={draft.serviceSelections.map(
                    (item) => item.serviceId
                  )}
                  booking
                  onValidationChange={canEditBrief ? updateBriefValidation : undefined}
                  invalidFieldId={validationStep === 4 ? invalidBriefField : undefined}
                  validationErrorId={errorId}
                  disabled={disabled || !canEditBrief}
                />
              ) : null}
            </>
          ) : null}
          {step === 5 ? (
            <>
              <div className="space-y-2 rounded-xl border border-slate-200 p-4">
                <p className="font-semibold">
                  {orderTypes.find(
                    (type) => String(type._id) === draft.orderTypeId
                  )?.title ||
                    order.orderTypeSnapshot ||
                    'Заказ'}
                </p>
                <p className="text-sm">
                  {draft.placeType === 'company_location'
                    ? location?.title || 'Помещение не выбрано'
                    : draft.customAddress}
                </p>
                <p className="text-sm">
                  {dateText(draft.eventDate)} — {dateText(dateEnd)}
                </p>
                {canPrice && calculation ? (
                  <dl className="space-y-2 border-t border-slate-200 pt-3 text-sm tabular-nums">
                    <div className="flex justify-between gap-3">
                      <dt>Услуги</dt>
                      <dd>{money(calculation.servicesKopecks / 100)}</dd>
                    </div>
                    {draft.placeType === 'company_location' ? (
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
