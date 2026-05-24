import DateTimePicker from '@components/DateTimePicker'
import ErrorsList from '@components/ErrorsList'
import FormWrapper from '@components/FormWrapper'
import IconCheckBox from '@components/IconCheckBox'
import AddIconButton from '@components/AddIconButton'
import IconActionButton from '@components/IconActionButton'
import Textarea from '@components/Textarea'
import { faCircleCheck, faTrashAlt } from '@fortawesome/free-solid-svg-icons'
import { faPencilAlt } from '@fortawesome/free-solid-svg-icons/faPencilAlt'
import ClientPicker from '@components/ClientPicker'
import ColleaguePicker from '@components/ColleaguePicker'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  DEFAULT_ADDRESS,
  DEFAULT_EVENT,
  TRANSACTION_CATEGORIES,
  TRANSACTION_TYPES,
} from '@helpers/constants'
import { getEventStatusButtonClasses } from '@helpers/eventStatusStyles'
import TabContext from '@components/Tabs/TabContext'
import TabPanel from '@components/Tabs/TabPanel'
import tariffsAtom from '@state/atoms/tariffsAtom'
import { postData } from '@helpers/CRUD'
import { getUserTariffAccess } from '@helpers/tariffAccess'
import useErrors from '@helpers/useErrors'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import { modalsFuncAtom } from '@state/atoms'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import Input from '@components/Input'
import ComboBox from '@components/ComboBox'
import AppButton from '@components/AppButton'
import QuickActionButtons from '@components/QuickActionButtons'
import RequisitesWarning from '@components/RequisitesWarning'
import AddressPoolPicker from '@components/AddressPoolPicker'
import InputWrapper from '@components/InputWrapper'
import LabeledContainer from '@components/LabeledContainer'
import OtherContactsPicker from '@components/OtherContactsPicker'
import LinksListEditor from '@components/LinksListEditor'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import ServiceMultiSelect from '@components/ServiceMultiSelect'
import serviceFunc from './serviceFunc'
import openEventAdditionalEventEditorModal from './eventAdditionalEventEditorModal'
import servicesAtom from '@state/atoms/servicesAtom'
import { getContractTemplateVariablesMap } from '@helpers/generateContractTemplate'
import { getActTemplateVariablesMap } from '@helpers/generateActTemplate'
import exportDocxFromTemplate from '@helpers/exportDocxFromTemplate'
import getPersonFullName from '@helpers/getPersonFullName'
import {
  useDeleteTransactionMutation,
  useTransactionsQuery,
} from '@helpers/useTransactionsQuery'
import { useClientsQuery } from '@helpers/useClientsQuery'
import { useEventQuery, useEventsQuery } from '@helpers/useEventsQuery'

const normalizeAddressValue = (rawAddress) => {
  const normalized = { ...DEFAULT_ADDRESS }

  if (!rawAddress) return normalized

  if (typeof rawAddress === 'string') {
    return { ...normalized, comment: rawAddress }
  }

  if (typeof rawAddress !== 'object') return normalized

  Object.keys(DEFAULT_ADDRESS).forEach((key) => {
    if (
      key in rawAddress &&
      rawAddress[key] !== undefined &&
      rawAddress[key] !== null
    ) {
      normalized[key] = rawAddress[key]
    }
  })

  return normalized
}

const normalizeLinksList = (links) => {
  if (!Array.isArray(links)) return []
  return links
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
}

const normalizeOtherContacts = (contacts) => {
  if (!Array.isArray(contacts)) return []
  return contacts
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      return {
        clientId: item.clientId ?? null,
        comment: typeof item.comment === 'string' ? item.comment : '',
      }
    })
    .filter(Boolean)
}

const normalizeAdditionalEvents = (items) => {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      return {
        title: typeof item.title === 'string' ? item.title : '',
        description:
          typeof item.description === 'string' ? item.description : '',
        date: item.date ?? null,
        done: Boolean(item.done),
        doneAt: item.doneAt ?? null,
        googleCalendarEventId:
          typeof item.googleCalendarEventId === 'string'
            ? item.googleCalendarEventId
            : '',
      }
    })
    .filter(Boolean)
}

const DEFAULT_CONTRACT_DOCX_TEMPLATE_URL =
  '/templates/default-contract-template.docx'
const DEFAULT_ACT_DOCX_TEMPLATE_URL = '/templates/default-act-template.docx'

const arrayBufferToBase64 = (buffer) => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return window.btoa(binary)
}

const getSuggestedDecisionAdditionalEventDate = (eventDateValue) => {
  const now = new Date()
  const suggested = new Date(now)
  suggested.setDate(suggested.getDate() + 3)
  suggested.setSeconds(0, 0)

  if (!eventDateValue) return suggested.toISOString()
  const eventDate = new Date(eventDateValue)
  if (Number.isNaN(eventDate.getTime())) return suggested.toISOString()

  const latestAllowed = new Date(eventDate)
  latestAllowed.setDate(latestAllowed.getDate() - 1)
  latestAllowed.setSeconds(0, 0)

  return (
    suggested.getTime() > latestAllowed.getTime() ? latestAllowed : suggested
  ).toISOString()
}

const eventFunc = (
  eventId,
  clone = false,
  initialStatus = null,
  options = {}
) => {
  const initialTab = options?.initialTab || 'Общие'
  const EventModal = ({
    closeModal,
    setOnConfirmFunc,
    setOnDeclineFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
    setDisableDecline,
    setComponentInFooter,
  }) => {
    const { data: eventFromQuery } = useEventQuery(eventId)
    const event = eventId ? eventFromQuery : (options?.initialEvent ?? null)
    const hasInitialEvent = Boolean(options?.initialEvent)
    const itemsFunc = useAtomValue(itemsFuncAtom)
    const setEvent = itemsFunc?.event?.set
    const { data: clients = [] } = useClientsQuery()
    const loggedUser = useAtomValue(loggedUserAtom)
    const [siteSettings, setSiteSettings] = useAtom(siteSettingsAtom)
    const colleagues = useMemo(
      () => clients.filter((client) => client.clientType === 'colleague'),
      [clients]
    )
    const modalsFunc = useAtomValue(modalsFuncAtom)
    const { data: transactions = [] } = useTransactionsQuery(undefined, {
      enabled: false,
    })
    const tariffs = useAtomValue(tariffsAtom)
    const services = useAtomValue(servicesAtom)
    const { data: eventsPayload } = useEventsQuery({
      scope: 'all',
      enabled: false,
    })
    const events = useMemo(
      () => eventsPayload?.data ?? [],
      [eventsPayload?.data]
    )
    const deleteTransactionMutation = useDeleteTransactionMutation()
    const closeModalRef = useRef(closeModal)

    const initialIsTransferred =
      event?.isTransferred ??
      (event?.colleagueId ? true : (DEFAULT_EVENT.isTransferred ?? false))

    const initialStatusValue = clone
      ? 'active'
      : (event?.status ?? initialStatus ?? DEFAULT_EVENT.status)
    const [status, setStatus] = useState(initialStatusValue)
    const isDraft = status === 'draft'

    const [clientId, setClientId] = useState(
      event?.clientId ?? DEFAULT_EVENT.clientId
    )
    const [eventDate, setEventDate] = useState(
      event?.eventDate ?? DEFAULT_EVENT.eventDate
    )
    const [dateEnd, setDateEnd] = useState(
      event?.dateEnd ?? DEFAULT_EVENT.dateEnd ?? null
    )
    const [dateEndTouched, setDateEndTouched] = useState(false)
    const [invoiceLinks, setInvoiceLinks] = useState(
      event?.invoiceLinks ?? DEFAULT_EVENT.invoiceLinks ?? []
    )
    const [receiptLinks, setReceiptLinks] = useState(
      event?.receiptLinks ?? DEFAULT_EVENT.receiptLinks ?? []
    )
    const [actLinks, setActLinks] = useState(
      event?.actLinks ?? DEFAULT_EVENT.actLinks ?? []
    )
    const [contractLinks, setContractLinks] = useState(
      event?.contractLinks ?? DEFAULT_EVENT.contractLinks ?? []
    )
    const [address, setAddress] = useState(() => {
      const normalized = normalizeAddressValue(event?.address)

      if (!normalized.town && siteSettings?.defaultTown && !eventId) {
        normalized.town = siteSettings.defaultTown
      }
      return normalized
    })

    const [contractSum, setContractSum] = useState(
      event?.contractSum ?? DEFAULT_EVENT.contractSum ?? 0
    )
    const [waitDeposit, setWaitDeposit] = useState(
      clone ? false : (event?.waitDeposit ?? DEFAULT_EVENT.waitDeposit ?? false)
    )
    const [depositDueAt, setDepositDueAt] = useState(
      clone ? null : (event?.depositDueAt ?? DEFAULT_EVENT.depositDueAt ?? null)
    )
    const [depositExpectedAmount, setDepositExpectedAmount] = useState(
      clone
        ? null
        : (event?.depositExpectedAmount ??
            DEFAULT_EVENT.depositExpectedAmount ??
            null)
    )
    const [isByContract, setIsByContract] = useState(
      event?.isByContract ?? DEFAULT_EVENT.isByContract ?? false
    )
    const [isTransferred, setIsTransferred] = useState(initialIsTransferred)
    const [colleagueId, setColleagueId] = useState(
      event?.colleagueId ?? DEFAULT_EVENT.colleagueId ?? null
    )
    const [description, setDescription] = useState(
      event?.description ?? event?.comment ?? DEFAULT_EVENT.description ?? ''
    )
    const [eventType, setEventType] = useState(
      event?.eventType ?? DEFAULT_EVENT.eventType ?? ''
    )
    const [financeComment, setFinanceComment] = useState(
      event?.financeComment ?? DEFAULT_EVENT.financeComment ?? ''
    )
    const [requestCreatedAt, setRequestCreatedAt] = useState(() => {
      if (!eventId || clone) return new Date().toISOString()
      return (
        event?.requestCreatedAt ?? event?.createdAt ?? new Date().toISOString()
      )
    })
    const [additionalEvents, setAdditionalEvents] = useState(() =>
      clone
        ? []
        : normalizeAdditionalEvents(
            event?.additionalEvents ?? DEFAULT_EVENT.additionalEvents ?? []
          )
    )
    const [showDoneAdditionalEvents, setShowDoneAdditionalEvents] =
      useState(false)
    const [calendarImportChecked, setCalendarImportChecked] = useState(
      event?.calendarImportChecked ??
        (eventId ? (DEFAULT_EVENT.calendarImportChecked ?? false) : true)
    )
    const [servicesIds, setServicesIds] = useState(
      event?.servicesIds ?? DEFAULT_EVENT.servicesIds ?? []
    )
    const [otherContacts, setOtherContacts] = useState(
      event?.otherContacts ?? DEFAULT_EVENT.otherContacts ?? []
    )
    const googleCalendarResponse = event?.googleCalendarResponse ?? null
    const googleCalendarResponseText = useMemo(() => {
      if (!googleCalendarResponse) return ''
      if (typeof googleCalendarResponse === 'string')
        return googleCalendarResponse
      try {
        return JSON.stringify(googleCalendarResponse, null, 2)
      } catch (error) {
        return String(googleCalendarResponse)
      }
    }, [googleCalendarResponse])

    const importedFromCalendar =
      event?.importedFromCalendar ?? DEFAULT_EVENT.importedFromCalendar

    const [errors, , addError, removeError, clearErrors] = useErrors()
    const addErrorRef = useRef(addError)
    const clearErrorsRef = useRef(clearErrors)

    useEffect(() => {
      addErrorRef.current = addError
      clearErrorsRef.current = clearErrors
      closeModalRef.current = closeModal
    }, [addError, clearErrors, closeModal])

    const initialEventValues = useMemo(() => {
      return {
        clientId: event?.clientId ?? DEFAULT_EVENT.clientId,
        eventDate: event?.eventDate ?? DEFAULT_EVENT.eventDate,
        address: (() => {
          const normalized = normalizeAddressValue(event?.address)
          if (
            !normalized.town &&
            siteSettings?.defaultTown &&
            !eventId &&
            !event?.address?.town
          ) {
            normalized.town = siteSettings.defaultTown
          }
          return normalized
        })(),
        contractSum: event?.contractSum ?? DEFAULT_EVENT.contractSum,
        waitDeposit: event?.waitDeposit ?? DEFAULT_EVENT.waitDeposit,
        depositDueAt: event?.depositDueAt ?? DEFAULT_EVENT.depositDueAt,
        depositExpectedAmount:
          event?.depositExpectedAmount ?? DEFAULT_EVENT.depositExpectedAmount,
        isByContract: event?.isByContract ?? DEFAULT_EVENT.isByContract,
        description:
          event?.description ?? event?.comment ?? DEFAULT_EVENT.description,
        eventType: event?.eventType ?? DEFAULT_EVENT.eventType,
        financeComment: event?.financeComment ?? DEFAULT_EVENT.financeComment,
        dateEnd: event?.dateEnd ?? DEFAULT_EVENT.dateEnd,
        invoiceLinks: event?.invoiceLinks ?? DEFAULT_EVENT.invoiceLinks ?? [],
        receiptLinks: event?.receiptLinks ?? DEFAULT_EVENT.receiptLinks ?? [],
        actLinks: event?.actLinks ?? DEFAULT_EVENT.actLinks ?? [],
        contractLinks:
          event?.contractLinks ?? DEFAULT_EVENT.contractLinks ?? [],
        calendarImportChecked:
          event?.calendarImportChecked ??
          (eventId ? DEFAULT_EVENT.calendarImportChecked : true),
        servicesIds: event?.servicesIds ?? DEFAULT_EVENT.servicesIds ?? [],
        otherContacts: normalizeOtherContacts(
          event?.otherContacts ?? DEFAULT_EVENT.otherContacts ?? []
        ),
        colleagueId: event?.colleagueId ?? DEFAULT_EVENT.colleagueId,
        isTransferred: initialIsTransferred,
        status: initialStatusValue,
        requestCreatedAt:
          event?.requestCreatedAt ?? event?.createdAt ?? requestCreatedAt,
        additionalEvents: clone
          ? []
          : normalizeAdditionalEvents(
              event?.additionalEvents ?? DEFAULT_EVENT.additionalEvents ?? []
            ),
      }
    }, [
      event?.clientId,
      event?.eventDate,
      event?.address,
      event?.contractSum,
      event?.waitDeposit,
      event?.depositDueAt,
      event?.depositExpectedAmount,
      event?.description,
      event?.eventType,
      event?.isByContract,
      event?.financeComment,
      event?.comment,
      event?.dateEnd,
      event?.invoiceLinks,
      event?.receiptLinks,
      event?.actLinks,
      event?.contractLinks,
      event?.calendarImportChecked,
      event?.colleagueId,
      event?.otherContacts,
      event?.servicesIds,
      initialIsTransferred,
      initialStatusValue,
      event?.requestCreatedAt,
      event?.createdAt,
      requestCreatedAt,
      event?.additionalEvents,
      siteSettings?.defaultTown,
    ])

    const initialAddressSignature = useMemo(
      () => JSON.stringify(initialEventValues.address ?? {}),
      [initialEventValues.address]
    )

    const addressSignature = useMemo(
      () => JSON.stringify(address ?? {}),
      [address]
    )

    const isFormChanged = useMemo(
      () =>
        (!eventId && hasInitialEvent) ||
        initialEventValues.clientId !== clientId ||
        initialEventValues.eventDate !== eventDate ||
        initialEventValues.dateEnd !== dateEnd ||
        initialAddressSignature !== addressSignature ||
        initialEventValues.contractSum !== contractSum ||
        initialEventValues.waitDeposit !== waitDeposit ||
        initialEventValues.depositDueAt !== depositDueAt ||
        initialEventValues.depositExpectedAmount !== depositExpectedAmount ||
        initialEventValues.isByContract !== isByContract ||
        initialEventValues.isTransferred !== isTransferred ||
        initialEventValues.colleagueId !== colleagueId ||
        initialEventValues.description !== description ||
        initialEventValues.eventType !== eventType ||
        initialEventValues.financeComment !== financeComment ||
        initialEventValues.status !== status ||
        initialEventValues.requestCreatedAt !== requestCreatedAt ||
        JSON.stringify(initialEventValues.additionalEvents ?? []) !==
          JSON.stringify(additionalEvents) ||
        JSON.stringify(initialEventValues.invoiceLinks ?? []) !==
          JSON.stringify(invoiceLinks) ||
        JSON.stringify(initialEventValues.receiptLinks ?? []) !==
          JSON.stringify(receiptLinks) ||
        JSON.stringify(initialEventValues.actLinks ?? []) !==
          JSON.stringify(actLinks) ||
        JSON.stringify(initialEventValues.contractLinks ?? []) !==
          JSON.stringify(contractLinks) ||
        initialEventValues.calendarImportChecked !== calendarImportChecked ||
        JSON.stringify(initialEventValues.servicesIds ?? []) !==
          JSON.stringify(servicesIds) ||
        JSON.stringify(initialEventValues.otherContacts ?? []) !==
          JSON.stringify(otherContacts),
      [
        clientId,
        eventDate,
        dateEnd,
        initialAddressSignature,
        addressSignature,
        contractSum,
        waitDeposit,
        depositDueAt,
        depositExpectedAmount,
        isByContract,
        isTransferred,
        colleagueId,
        description,
        eventType,
        financeComment,
        invoiceLinks,
        receiptLinks,
        actLinks,
        contractLinks,
        calendarImportChecked,
        servicesIds,
        otherContacts,
        initialEventValues,
        status,
        requestCreatedAt,
        additionalEvents,
        hasInitialEvent,
      ]
    )

    useEffect(() => {
      setAddress(initialEventValues.address)
    }, [initialEventValues.address])

    const sourceEventId = clone ? null : event?._id

    const eventTransactions = useMemo(
      () =>
        (transactions ?? [])
          .filter((transaction) => transaction.eventId === sourceEventId)
          .sort(
            (a, b) =>
              new Date(b.date ?? 0).getTime() - new Date(a.date ?? 0).getTime()
          ),
      [sourceEventId, transactions]
    )

    const incomeTransactions = useMemo(
      () => eventTransactions.filter((item) => item.type === 'income'),
      [eventTransactions]
    )
    const expenseTransactions = useMemo(
      () => eventTransactions.filter((item) => item.type === 'expense'),
      [eventTransactions]
    )
    const incomeTotal = useMemo(
      () =>
        incomeTransactions.reduce(
          (total, item) => total + (item.amount ?? 0),
          0
        ),
      [incomeTransactions]
    )
    const hasDepositTransaction = useMemo(
      () =>
        incomeTransactions.some(
          (item) =>
            ['deposit', 'advance'].includes(String(item?.category ?? '')) &&
            Number(item?.amount ?? 0) > 0
        ),
      [incomeTransactions]
    )
    const hasTaxes = useMemo(
      () => eventTransactions.some((item) => item.category === 'taxes'),
      [eventTransactions]
    )
    const canClose = contractSum <= incomeTotal && (!isByContract || hasTaxes)
    const eventEndDateForStatus = useMemo(
      () => dateEnd || eventDate || null,
      [dateEnd, eventDate]
    )
    const isEventFinished = useMemo(() => {
      if (!eventEndDateForStatus) return false
      const endDate = new Date(eventEndDateForStatus)
      if (Number.isNaN(endDate.getTime())) return false
      return endDate.getTime() < Date.now()
    }, [eventEndDateForStatus])
    const canSetClosedStatus = !isDraft && isEventFinished && canClose
    const isClosed = status === 'closed'
    const formLockedClassName = isClosed ? 'pointer-events-none opacity-65' : ''
    const closeStatusDisabledReason = !isEventFinished
      ? 'Закрыть можно только после завершения мероприятия'
      : !canClose
        ? 'Закрыть можно только после всех поступлений и обязательных налогов'
        : ''

    const missingFields = useMemo(() => {
      const fields = []
      if (!clientId) fields.push('Клиент')
      if (!eventDate) fields.push('Дата начала')
      if (!eventType?.trim()) fields.push('Что за событие')
      if (!servicesIds || servicesIds.length === 0) fields.push('Услуги')
      if (isTransferred && !colleagueId) fields.push('Коллега')
      return fields
    }, [
      clientId,
      eventDate,
      eventType,
      servicesIds,
      isTransferred,
      colleagueId,
    ])
    const requiredMissing = missingFields.length > 0

    const dateRangeError = useMemo(() => {
      if (!eventDate || !dateEnd) return ''
      const startDate = new Date(eventDate)
      const endDate = new Date(dateEnd)
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()))
        return ''
      return startDate.getTime() > endDate.getTime()
        ? 'Дата начала не может быть позже даты завершения'
        : ''
    }, [eventDate, dateEnd])

    const defaultDurationMinutes = useMemo(() => {
      const minutes = Number(
        siteSettings?.custom?.defaultEventDurationMinutes ?? 60
      )
      return Number.isFinite(minutes) && minutes > 0 ? minutes : 60
    }, [siteSettings?.custom?.defaultEventDurationMinutes])

    const addMinutesToDate = (value, minutes) => {
      if (!value) return null
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return null
      date.setMinutes(date.getMinutes() + minutes)
      return date.toISOString()
    }

    const shiftEndByStartChange = (
      prevStartValue,
      nextStartValue,
      endValue
    ) => {
      if (!prevStartValue || !nextStartValue || !endValue) return null
      const prevStart = new Date(prevStartValue)
      const nextStart = new Date(nextStartValue)
      const prevEnd = new Date(endValue)
      if (
        Number.isNaN(prevStart.getTime()) ||
        Number.isNaN(nextStart.getTime()) ||
        Number.isNaN(prevEnd.getTime())
      ) {
        return null
      }

      const durationMs = prevEnd.getTime() - prevStart.getTime()
      if (durationMs <= 0) {
        return new Date(
          nextStart.getTime() + defaultDurationMinutes * 60 * 1000
        ).toISOString()
      }

      return new Date(nextStart.getTime() + durationMs).toISOString()
    }

    useEffect(() => {
      if (dateEndTouched) return
      if (!eventDate) return
      if (!dateEnd) {
        setDateEnd(addMinutesToDate(eventDate, defaultDurationMinutes))
      }
    }, [dateEnd, dateEndTouched, defaultDurationMinutes, eventDate])

    const buildRange = useCallback(
      (startValue, endValue) => {
        if (!startValue) return null
        const start = new Date(startValue)
        if (Number.isNaN(start.getTime())) return null
        let end = endValue ? new Date(endValue) : null
        if (!end || Number.isNaN(end.getTime()) || end <= start) {
          end = new Date(start.getTime() + defaultDurationMinutes * 60 * 1000)
        }
        return { start, end }
      },
      [defaultDurationMinutes]
    )

    const getConflictsCount = useCallback(() => {
      const targetRange = buildRange(eventDate, dateEnd)
      if (!targetRange) return 0
      let count = 0

      ;(events ?? []).forEach((item) => {
        if (!item) return
        if (eventId && String(item._id) === String(eventId)) return
        if (item.status === 'canceled') return
        const range = buildRange(item.eventDate, item.dateEnd)
        if (!range) return
        const overlaps =
          targetRange.start < range.end && range.start < targetRange.end
        if (overlaps) count += 1
      })

      return count
    }, [buildRange, dateEnd, eventDate, events])
    const tariffAccess = useMemo(
      () => getUserTariffAccess(loggedUser, tariffs),
      [loggedUser, tariffs]
    )
    const canUseDocuments = Boolean(tariffAccess?.allowDocuments)

    const onClickConfirm = () => {
      clearErrorsRef.current()
      let hasError = false

      if (!clientId) {
        addErrorRef.current({ clientId: 'Выберите клиента' })
        hasError = true
      }
      if (!eventDate) {
        addErrorRef.current({ eventDate: 'Укажите дату мероприятия' })
        hasError = true
      }
      if (!servicesIds || servicesIds.length === 0) {
        addErrorRef.current({ servicesIds: 'Выберите услугу' })
        hasError = true
      }
      if (!eventType?.trim()) {
        addErrorRef.current({ eventType: 'Укажите, что за событие' })
        hasError = true
      }
      if (isTransferred && !colleagueId) {
        addErrorRef.current({ colleagueId: 'Выберите коллегу' })
        hasError = true
      }
      if (dateRangeError) {
        hasError = true
      }

      const proceedSave = async () => {
        const normalizedContractSum =
          typeof contractSum === 'number' && !Number.isNaN(contractSum)
            ? contractSum
            : 0
        const normalizedInvoiceLinks = normalizeLinksList(invoiceLinks)
        const normalizedReceiptLinks = normalizeLinksList(receiptLinks)
        const normalizedActLinks = normalizeLinksList(actLinks)
        const normalizedContractLinks = normalizeLinksList(contractLinks)
        const normalizedOtherContacts = normalizeOtherContacts(otherContacts)
          .map((item) => ({
            clientId: item.clientId ?? null,
            comment: item.comment?.trim() ?? '',
          }))
          .filter((item) => item.clientId)
        const normalizedAdditionalEvents = normalizeAdditionalEvents(
          additionalEvents
        )
          .map((item) => ({
            title: item.title?.trim() ?? '',
            description: item.description?.trim() ?? '',
            date: item.date ?? null,
            done: Boolean(item.done),
            doneAt: item.done
              ? (item.doneAt ?? new Date().toISOString())
              : null,
            googleCalendarEventId: item.googleCalendarEventId?.trim() ?? '',
          }))
          .filter((item) => item.title || item.description || item.date)
        const payload = {
          _id: event?._id,
          clientId,
          status,
          requestCreatedAt: requestCreatedAt ?? new Date().toISOString(),
          additionalEvents: normalizedAdditionalEvents,
          isTransferred,
          colleagueId: isTransferred ? colleagueId : null,
          eventDate,
          dateEnd,
          address: normalizeAddressValue(address),
          contractSum: normalizedContractSum,
          waitDeposit: hasDepositTransaction ? false : Boolean(waitDeposit),
          depositDueAt:
            hasDepositTransaction || !waitDeposit ? null : depositDueAt,
          depositExpectedAmount:
            hasDepositTransaction || !waitDeposit
              ? null
              : (depositExpectedAmount ?? null),
          isByContract,
          description: description?.trim() ?? '',
          eventType: eventType?.trim() ?? '',
          financeComment: financeComment?.trim() ?? '',
          calendarImportChecked,
          servicesIds,
          otherContacts: normalizedOtherContacts,
        }
        if (canUseDocuments) {
          payload.invoiceLinks = normalizedInvoiceLinks
          payload.receiptLinks = normalizedReceiptLinks
          payload.actLinks = normalizedActLinks
          payload.contractLinks = normalizedContractLinks
        }
        const isCreatingDraftRequest =
          !payload?._id && !clone && payload.status === 'draft'
        const hasAdditionalEvents = (payload?.additionalEvents?.length ?? 0) > 0
        const savedEvent = await setEvent(payload, clone)
        if (typeof options?.onSaved === 'function') {
          await options.onSaved(savedEvent)
        }

        if (
          !isCreatingDraftRequest ||
          hasAdditionalEvents ||
          !savedEvent?._id
        ) {
          closeModalRef.current()
          return
        }

        const suggestedDate = getSuggestedDecisionAdditionalEventDate(
          savedEvent?.eventDate ?? payload?.eventDate
        )
        const suggestedLabel = new Date(suggestedDate).toLocaleString('ru-RU', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
        openAdditionalEventModal(null, {
          title: 'Добавить доп. событие',
          introText: `Рекомендуется добавить напоминание "Что решили клиенты" на ${suggestedLabel}. Вы можете изменить детали ниже.`,
          sourceItem: {
            title: 'Что решили клиенты',
            description: '',
            date: suggestedDate,
            done: false,
            googleCalendarEventId: '',
          },
          confirmButtonName: 'Добавить',
          declineButtonName: 'Позже',
          onConfirm: async (nextItem) => {
            const currentEvent = (events ?? []).find(
              (item) => String(item?._id) === String(savedEvent._id)
            )
            const currentAdditionalEvents = Array.isArray(
              currentEvent?.additionalEvents
            )
              ? currentEvent.additionalEvents
              : Array.isArray(savedEvent?.additionalEvents)
                ? savedEvent.additionalEvents
                : []

            await setEvent(
              {
                _id: savedEvent._id,
                additionalEvents: [...currentAdditionalEvents, nextItem],
              },
              false,
              true
            )
          },
        })
        closeModalRef.current()
      }

      if (!hasError) {
        const conflictsCount = getConflictsCount()
        if (conflictsCount > 0) {
          modalsFunc.add({
            title: 'Пересечение по времени',
            text: `Внимание! Есть мероприятия в выбранном периоде (${conflictsCount}). Все равно сохранить?`,
            confirmButtonName: 'Все равно сохранить',
            declineButtonName: 'Вернуться',
            showDecline: true,
            onConfirm: proceedSave,
          })
          return
        }
        proceedSave()
      }
    }

    const onClickConfirmRef = useRef(onClickConfirm)
    onClickConfirmRef.current = onClickConfirm

    useEffect(() => {
      setOnShowOnCloseConfirmDialog(isFormChanged)
      setDisableConfirm(false)
      setOnConfirmFunc(isFormChanged ? () => onClickConfirmRef.current() : null)
    }, [
      isFormChanged,
      setDisableConfirm,
      setOnConfirmFunc,
      setOnShowOnCloseConfirmDialog,
    ])

    useEffect(() => {
      if (!setComponentInFooter) return
      if (!requiredMissing && !dateRangeError) {
        setComponentInFooter(null)
        return
      }
      setComponentInFooter(
        <div className="flex flex-col gap-1 text-sm text-red-600">
          {requiredMissing && (
            <div>Заполните поля: {missingFields.join(', ')}</div>
          )}
          {dateRangeError && <div>{dateRangeError}</div>}
        </div>
      )
    }, [dateRangeError, missingFields, requiredMissing, setComponentInFooter])

    const selectedClient = useMemo(
      () =>
        clientId && clients.length
          ? clients.find((client) => String(client._id) === String(clientId))
          : null,
      [clientId, clients]
    )
    const selectedServiceTitles = useMemo(
      () =>
        (services ?? [])
          .filter((item) => (servicesIds ?? []).includes(item._id))
          .map((item) => item?.title)
          .filter(Boolean),
      [services, servicesIds]
    )
    const hasDoneAdditionalEvents = useMemo(
      () => (additionalEvents ?? []).some((item) => Boolean(item?.done)),
      [additionalEvents]
    )
    const filteredAdditionalEvents = useMemo(
      () =>
        (additionalEvents ?? [])
          .map((item, index) => ({ item, index }))
          .filter(({ item }) =>
            showDoneAdditionalEvents ? true : !Boolean(item?.done)
          ),
      [additionalEvents, showDoneAdditionalEvents]
    )
    const hasRequiredArtistRequisites = (settings) => {
      const custom = settings?.custom ?? {}
      const artistStatus =
        custom?.contractArtistStatus === 'self_employed'
          ? 'self_employed'
          : 'individual_entrepreneur'
      const hasCommonFields = Boolean(
        String(custom?.contractArtistFullName ?? '').trim() &&
        String(custom?.contractArtistName ?? '').trim() &&
        String(custom?.contractArtistInn ?? '').trim() &&
        String(custom?.contractArtistBankName ?? '').trim() &&
        String(custom?.contractArtistBik ?? '').trim() &&
        String(custom?.contractArtistCheckingAccount ?? '').trim() &&
        String(custom?.contractArtistCorrespondentAccount ?? '').trim() &&
        String(custom?.contractArtistLegalAddress ?? '').trim()
      )
      if (!hasCommonFields) return false
      if (artistStatus === 'self_employed') return true
      return Boolean(String(custom?.contractArtistOgrnip ?? '').trim())
    }
    const hasRequiredClientRequisites = (client) => {
      if (!client) return false
      const hasName = Boolean(
        String(client?.legalName ?? '').trim() ||
        getPersonFullName(client, { fallback: '' }).trim()
      )
      return Boolean(
        hasName &&
        String(client?.inn ?? '').trim() &&
        String(client?.bankName ?? '').trim() &&
        String(client?.bik ?? '').trim() &&
        String(client?.checkingAccount ?? '').trim() &&
        String(client?.correspondentAccount ?? '').trim() &&
        String(client?.legalAddress ?? '').trim()
      )
    }
    const buildContractTemplateVariables = useCallback(
      (
        documentNumber,
        contractDate,
        currentSettings = siteSettings,
        requisitesSidesMode = 'preview',
        currentClient = selectedClient
      ) =>
        getContractTemplateVariablesMap({
          event: {
            ...event,
            eventDate,
            contractSum,
            address: normalizeAddressValue(address),
          },
          client: currentClient,
          serviceTitles: selectedServiceTitles,
          performerName: getPersonFullName(loggedUser),
          contractMeta: {
            defaultTown: currentSettings?.defaultTown ?? '',
            artistFullName:
              currentSettings?.custom?.contractArtistFullName ?? '',
            artistName: currentSettings?.custom?.contractArtistName ?? '',
            artistStatus:
              currentSettings?.custom?.contractArtistStatus ??
              'individual_entrepreneur',
            artistOgrnip: currentSettings?.custom?.contractArtistOgrnip ?? '',
            artistInn: currentSettings?.custom?.contractArtistInn ?? '',
            artistBankName:
              currentSettings?.custom?.contractArtistBankName ?? '',
            artistBik: currentSettings?.custom?.contractArtistBik ?? '',
            artistCheckingAccount:
              currentSettings?.custom?.contractArtistCheckingAccount ?? '',
            artistCorrespondentAccount:
              currentSettings?.custom?.contractArtistCorrespondentAccount ?? '',
            artistLegalAddress:
              currentSettings?.custom?.contractArtistLegalAddress ?? '',
            documentNumber: documentNumber ? String(documentNumber) : '',
            nextDocumentNumber: documentNumber ? Number(documentNumber) : null,
            contractDate: contractDate || '',
            requisitesSidesMode,
          },
        }),
      [
        address,
        contractSum,
        event,
        eventDate,
        loggedUser,
        selectedClient,
        selectedServiceTitles,
        siteSettings,
      ]
    )
    const buildActTemplateVariables = useCallback(
      (
        documentNumber,
        actDate,
        currentSettings = siteSettings,
        requisitesSidesMode = 'preview',
        currentClient = selectedClient
      ) =>
        getActTemplateVariablesMap({
          event: {
            ...event,
            eventDate,
            contractSum,
            address: normalizeAddressValue(address),
          },
          client: currentClient,
          serviceTitles: selectedServiceTitles,
          performerName: getPersonFullName(loggedUser),
          actMeta: {
            defaultTown: currentSettings?.defaultTown ?? '',
            artistFullName:
              currentSettings?.custom?.contractArtistFullName ?? '',
            artistName: currentSettings?.custom?.contractArtistName ?? '',
            artistStatus:
              currentSettings?.custom?.contractArtistStatus ??
              'individual_entrepreneur',
            artistOgrnip: currentSettings?.custom?.contractArtistOgrnip ?? '',
            artistInn: currentSettings?.custom?.contractArtistInn ?? '',
            artistBankName:
              currentSettings?.custom?.contractArtistBankName ?? '',
            artistBik: currentSettings?.custom?.contractArtistBik ?? '',
            artistCheckingAccount:
              currentSettings?.custom?.contractArtistCheckingAccount ?? '',
            artistCorrespondentAccount:
              currentSettings?.custom?.contractArtistCorrespondentAccount ?? '',
            artistLegalAddress:
              currentSettings?.custom?.contractArtistLegalAddress ?? '',
            documentNumber: documentNumber ? String(documentNumber) : '',
            nextDocumentNumber: documentNumber ? Number(documentNumber) : null,
            contractDate: actDate || '',
            actDate: actDate || '',
            requisitesSidesMode,
          },
        }),
      [
        address,
        contractSum,
        event,
        eventDate,
        loggedUser,
        selectedClient,
        selectedServiceTitles,
        siteSettings,
      ]
    )
    const formatDateForDocFileName = (value) => {
      if (!value) return ''
      const str = String(value)
      const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
      if (isoMatch) return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return str
      const dd = String(date.getDate()).padStart(2, '0')
      const mm = String(date.getMonth() + 1).padStart(2, '0')
      const yyyy = date.getFullYear()
      return `${dd}.${mm}.${yyyy}`
    }

    const getDocxTemplateBase64 = useCallback(
      async (customTemplateBase64, defaultTemplateUrl) => {
        if (customTemplateBase64) return customTemplateBase64
        const response = await fetch(defaultTemplateUrl, { cache: 'no-store' })
        if (!response.ok) {
          throw new Error(`Не найден шаблон DOCX: ${defaultTemplateUrl}`)
        }
        const arrayBuffer = await response.arrayBuffer()
        return arrayBufferToBase64(arrayBuffer)
      },
      []
    )

    const eventTypeOptions = useMemo(() => {
      const rawEventTypes = Array.isArray(siteSettings?.custom?.eventTypes)
        ? siteSettings.custom.eventTypes
        : []
      const eventTypesSet = new Set(
        rawEventTypes
          .map((item) => (typeof item === 'string' ? item.trim() : ''))
          .filter(Boolean)
      )
      if (eventType && typeof eventType === 'string')
        eventTypesSet.add(eventType.trim())
      return Array.from(eventTypesSet).sort((a, b) => a.localeCompare(b, 'ru'))
    }, [eventType, siteSettings?.custom?.eventTypes])

    const townOptions = useMemo(() => {
      const townsSet = new Set(
        (siteSettings?.towns ?? [])
          .map((town) => (typeof town === 'string' ? town.trim() : ''))
          .filter(Boolean)
      )
      if (address?.town && typeof address.town === 'string')
        townsSet.add(address.town.trim())

      return Array.from(townsSet).sort((a, b) => a.localeCompare(b, 'ru'))
    }, [address?.town, siteSettings?.towns])

    const handleCreateTown = async (town) => {
      const normalizedTown = typeof town === 'string' ? town.trim() : ''
      if (!normalizedTown) return
      const nextTowns = Array.from(
        new Set([...(siteSettings?.towns ?? []), normalizedTown])
      )
      await postData(
        '/api/site',
        { towns: nextTowns },
        (data) => setSiteSettings(data),
        null,
        false,
        loggedUser?._id
      )
    }

    const handleCreateEventType = async () => {
      const rawEventType = window.prompt('Новый тип события')
      const normalizedEventType =
        typeof rawEventType === 'string' ? rawEventType.trim() : ''
      if (!normalizedEventType) return
      setEventType(normalizedEventType)
      const currentEventTypes = Array.isArray(siteSettings?.custom?.eventTypes)
        ? siteSettings.custom.eventTypes
        : []
      const nextEventTypes = Array.from(
        new Set([...currentEventTypes, normalizedEventType])
      )
      await postData(
        '/api/site',
        {
          custom: {
            ...(siteSettings?.custom ?? {}),
            eventTypes: nextEventTypes,
          },
        },
        (data) => setSiteSettings(data),
        null,
        false,
        loggedUser?._id
      )
    }

    const [financeError, setFinanceError] = useState('')
    const [financeLoading, setFinanceLoading] = useState(false)

    const handleDeleteTransaction = async (id) => {
      if (!id) return
      modalsFunc.confirm({
        title: 'Удаление транзакции',
        text: 'Вы уверены, что хотите удалить транзакцию?',
        onConfirm: async () => {
          setFinanceError('')
          setFinanceLoading(true)
          try {
            await deleteTransactionMutation.mutateAsync(id)
          } catch (error) {
            setFinanceError('Не удалось удалить транзакцию')
          }
          setFinanceLoading(false)
        },
      })
    }

    const openClientSelectModal = () => {
      modalsFunc.client?.select((newClientId) => {
        setClientId(newClientId)
      })
    }

    const openServiceCreateModal = () => {
      modalsFunc.add(
        serviceFunc(null, true, (createdService) => {
          if (!createdService?._id) return
          setServicesIds((prev) =>
            prev.includes(createdService._id)
              ? prev
              : [...prev, createdService._id]
          )
          removeError('servicesIds')
        })
      )
    }

    const selectedColleague = useMemo(
      () =>
        colleagueId && colleagues.length
          ? colleagues.find((colleague) => colleague._id === colleagueId)
          : null,
      [colleagueId, colleagues]
    )

    const openColleagueSelectModal = () => {
      modalsFunc.client?.select(
        (newColleagueId) => {
          setColleagueId(newColleagueId)
        },
        'Выбор коллеги',
        { clientTypes: ['colleague'] }
      )
    }

    const handleOtherContactSelect = (index) => {
      modalsFunc.client?.select((newClientId) => {
        setOtherContacts((prev) =>
          prev.map((item, idx) =>
            idx === index ? { ...item, clientId: newClientId } : item
          )
        )
      })
    }

    const handleOtherContactCommentChange = (index, value) => {
      setOtherContacts((prev) =>
        prev.map((item, idx) =>
          idx === index ? { ...item, comment: value } : item
        )
      )
    }

    const handleOtherContactRemove = (index) => {
      setOtherContacts((prev) => prev.filter((_, idx) => idx !== index))
    }

    const handleOtherContactAdd = () => {
      modalsFunc.client?.select((newClientId) => {
        if (!newClientId) return
        setOtherContacts((prev) => [
          ...prev,
          { clientId: newClientId, comment: '' },
        ])
      })
    }

    const handleAdditionalEventRemove = (index) => {
      setAdditionalEvents((prev) => prev.filter((_, idx) => idx !== index))
    }

    function openAdditionalEventModal(index = null, options = {}) {
      const sourceItem = options?.sourceItem
        ? { ...options.sourceItem }
        : index !== null
          ? additionalEvents[index]
          : {
              title: '',
              description: '',
              date: new Date().toISOString(),
              done: false,
              googleCalendarEventId: '',
            }
      openEventAdditionalEventEditorModal({
        modalsFunc,
        index,
        sourceItem,
        title: options?.title,
        confirmButtonName: options?.confirmButtonName ?? 'Сохранить',
        declineButtonName: options?.declineButtonName ?? 'Отмена',
        introText: options?.introText,
        onConfirm: async (nextItem) => {
          if (typeof options?.onConfirm === 'function') {
            await options.onConfirm(nextItem)
            return
          }
          if (index !== null) {
            setAdditionalEvents((prev) =>
              prev.map((item, idx) =>
                idx === index ? { ...item, ...nextItem } : item
              )
            )
            return
          }
          setAdditionalEvents((prev) => [...prev, nextItem])
        },
      })
    }

    const handleAdditionalEventAdd = () => {
      openAdditionalEventModal(null)
    }

    const handleAdditionalEventEdit = (index) => {
      openAdditionalEventModal(index)
    }

    const handleAdditionalEventToggleDone = (index) => {
      setAdditionalEvents((prev) =>
        prev.map((item, idx) =>
          idx === index
            ? {
                ...item,
                done: !item?.done,
                doneAt: !item?.done ? new Date().toISOString() : null,
              }
            : item
        )
      )
    }

    const openTransactionModal = (transactionId) => {
      if (clone) {
        setFinanceError('В копии транзакции недоступны до сохранения')
        return
      }
      if (isDraft) {
        setFinanceError('Транзакции недоступны для заявки')
        return
      }
      if (!sourceEventId) {
        setFinanceError('Сначала сохраните мероприятие')
        return
      }
      setFinanceError('')
      if (transactionId)
        modalsFunc.transaction?.edit(sourceEventId, transactionId, {
          contractSum,
        })
      else modalsFunc.transaction?.add(sourceEventId, { contractSum })
    }

    const openContractTemplateModal = () => {
      const settingsRef = { current: siteSettings }
      const currentLastNumber = Number(siteSettings?.custom?.contractLastNumber)
      const nextDefaultNumber =
        Number.isFinite(currentLastNumber) && currentLastNumber > 0
          ? currentLastNumber + 1
          : 1
      const now = new Date()
      const defaultContractDate = `${now.getFullYear()}-${String(
        now.getMonth() + 1
      ).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const numberRef = { current: String(nextDefaultNumber) }
      const dateRef = { current: defaultContractDate }
      const clientRef = { current: selectedClient }

      const updateLastContractNumber = async (value) => {
        const parsed = Number(String(value ?? '').trim())
        if (!Number.isFinite(parsed) || parsed <= 0) return
        const currentSettings = settingsRef.current
        const previous = Number(currentSettings?.custom?.contractLastNumber)
        if (Number.isFinite(previous) && previous >= parsed) return
        await postData(
          '/api/site',
          {
            custom: {
              ...(currentSettings?.custom ?? {}),
              contractLastNumber: parsed,
            },
          },
          (data) => setSiteSettings(data),
          null,
          false,
          loggedUser?._id
        )
      }

      const ContractTemplatePreview = () => {
        const liveSiteSettings = useAtomValue(siteSettingsAtom)
        const { data: liveClients = [] } = useClientsQuery()
        const [contractNumber, setContractNumber] = useState(
          String(nextDefaultNumber)
        )
        const [contractDate, setContractDate] = useState(defaultContractDate)
        const liveSelectedClient = useMemo(
          () =>
            (liveClients ?? []).find(
              (item) => String(item?._id) === String(clientId)
            ) ?? null,
          [liveClients]
        )

        useEffect(() => {
          numberRef.current = contractNumber
        }, [contractNumber])
        useEffect(() => {
          dateRef.current = contractDate
        }, [contractDate])
        useEffect(() => {
          settingsRef.current = liveSiteSettings
        }, [liveSiteSettings])
        useEffect(() => {
          clientRef.current = liveSelectedClient
        }, [liveSelectedClient])
        const hasArtistRequisites =
          hasRequiredArtistRequisites(liveSiteSettings)
        const hasClientRequisites =
          hasRequiredClientRequisites(liveSelectedClient)

        return (
          <div className="flex flex-col gap-2">
            <RequisitesWarning
              missingArtistRequisites={!hasArtistRequisites}
              missingClientRequisites={!hasClientRequisites}
              canEditClient={Boolean(liveSelectedClient?._id)}
              onEditArtistRequisites={() =>
                modalsFunc.settings?.artistRequisitesEditor?.()
              }
              onEditClient={() =>
                liveSelectedClient?._id
                  ? modalsFunc.client?.edit(liveSelectedClient._id)
                  : null
              }
            />
            <div className="flex items-end justify-between gap-2">
              <div className="mt-1.5 flex items-end gap-2">
                <Input
                  label="№ договора"
                  value={contractNumber}
                  onChange={setContractNumber}
                  type="number"
                  min={1}
                  noMargin
                  className="w-[104px]"
                  inputClassName="hide-number-spin w-[35px]"
                />
                <Input
                  label="Дата договора"
                  value={contractDate}
                  onChange={setContractDate}
                  type="date"
                  noMargin
                  className="w-[150px]"
                />
              </div>
            </div>
          </div>
        )
      }
      modalsFunc.add({
        title: 'Шаблон договора',
        confirmButtonName: 'Скачать Word (.docx)',
        declineButtonName: 'Закрыть',
        showDecline: true,
        onConfirm: async () => {
          const contractNumber = numberRef.current
          const contractDate = dateRef.current
          const contractFileName = `Договор №${String(contractNumber || '').trim() || '1'} от ${formatDateForDocFileName(contractDate) || formatDateForDocFileName(new Date())}.docx`
          const customTemplateBase64 =
            settingsRef.current?.custom?.contractDocxTemplateBase64 ?? ''
          const templateBase64 = await getDocxTemplateBase64(
            customTemplateBase64,
            DEFAULT_CONTRACT_DOCX_TEMPLATE_URL
          )
          const variables = buildContractTemplateVariables(
            contractNumber,
            contractDate,
            settingsRef.current,
            'docx',
            clientRef.current
          )
          await exportDocxFromTemplate({
            templateBase64,
            fileName: contractFileName,
            variables,
          })
          await updateLastContractNumber(contractNumber)
        },
        Children: ContractTemplatePreview,
      })
    }

    const openActTemplateModal = () => {
      const settingsRef = { current: siteSettings }
      const currentLastNumber = Number(siteSettings?.custom?.actLastNumber)
      const nextDefaultNumber =
        Number.isFinite(currentLastNumber) && currentLastNumber > 0
          ? currentLastNumber + 1
          : 1
      const now = new Date()
      const defaultActDate = `${now.getFullYear()}-${String(
        now.getMonth() + 1
      ).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
      const numberRef = { current: String(nextDefaultNumber) }
      const dateRef = { current: defaultActDate }
      const clientRef = { current: selectedClient }

      const updateLastActNumber = async (value) => {
        const parsed = Number(String(value ?? '').trim())
        if (!Number.isFinite(parsed) || parsed <= 0) return
        const currentSettings = settingsRef.current
        const previous = Number(currentSettings?.custom?.actLastNumber)
        if (Number.isFinite(previous) && previous >= parsed) return
        await postData(
          '/api/site',
          {
            custom: {
              ...(currentSettings?.custom ?? {}),
              actLastNumber: parsed,
            },
          },
          (data) => setSiteSettings(data),
          null,
          false,
          loggedUser?._id
        )
      }

      const ActTemplatePreview = () => {
        const liveSiteSettings = useAtomValue(siteSettingsAtom)
        const { data: liveClients = [] } = useClientsQuery()
        const [actNumber, setActNumber] = useState(String(nextDefaultNumber))
        const [actDate, setActDate] = useState(defaultActDate)
        const liveSelectedClient = useMemo(
          () =>
            (liveClients ?? []).find(
              (item) => String(item?._id) === String(clientId)
            ) ?? null,
          [liveClients]
        )

        useEffect(() => {
          numberRef.current = actNumber
        }, [actNumber])
        useEffect(() => {
          dateRef.current = actDate
        }, [actDate])
        useEffect(() => {
          settingsRef.current = liveSiteSettings
        }, [liveSiteSettings])
        useEffect(() => {
          clientRef.current = liveSelectedClient
        }, [liveSelectedClient])
        const hasArtistRequisites =
          hasRequiredArtistRequisites(liveSiteSettings)
        const hasClientRequisites =
          hasRequiredClientRequisites(liveSelectedClient)

        return (
          <div className="flex flex-col gap-2">
            <RequisitesWarning
              missingArtistRequisites={!hasArtistRequisites}
              missingClientRequisites={!hasClientRequisites}
              canEditClient={Boolean(liveSelectedClient?._id)}
              onEditArtistRequisites={() =>
                modalsFunc.settings?.artistRequisitesEditor?.()
              }
              onEditClient={() =>
                liveSelectedClient?._id
                  ? modalsFunc.client?.edit(liveSelectedClient._id)
                  : null
              }
            />
            <div className="flex items-end justify-between gap-2">
              <div className="mt-1.5 flex items-end gap-2">
                <Input
                  label="№ акта"
                  value={actNumber}
                  onChange={setActNumber}
                  type="number"
                  min={1}
                  noMargin
                  className="w-[104px]"
                  inputClassName="hide-number-spin w-[35px]"
                />
                <Input
                  label="Дата акта"
                  value={actDate}
                  onChange={setActDate}
                  type="date"
                  noMargin
                  className="w-[150px]"
                />
              </div>
            </div>
          </div>
        )
      }
      modalsFunc.add({
        title: 'Шаблон акта',
        confirmButtonName: 'Скачать Word (.docx)',
        declineButtonName: 'Закрыть',
        showDecline: true,
        onConfirm: async () => {
          const actNumber = numberRef.current
          const actDate = dateRef.current
          const actFileName = `Акт №${String(actNumber || '').trim() || '1'} от ${formatDateForDocFileName(actDate) || formatDateForDocFileName(new Date())}.docx`
          const customTemplateBase64 =
            settingsRef.current?.custom?.actDocxTemplateBase64 ?? ''
          const templateBase64 = await getDocxTemplateBase64(
            customTemplateBase64,
            DEFAULT_ACT_DOCX_TEMPLATE_URL
          )
          const variables = buildActTemplateVariables(
            actNumber,
            actDate,
            settingsRef.current,
            'docx',
            clientRef.current
          )
          await exportDocxFromTemplate({
            templateBase64,
            fileName: actFileName,
            variables,
          })
          await updateLastActNumber(actNumber)
        },
        Children: ActTemplatePreview,
      })
    }

    return (
      <TabContext
        value={initialTab}
        variant="fullWidth"
        scrollButtons={false}
        allowScrollButtonsMobile={false}
      >
        <TabPanel tabName="Общие">
          <FormWrapper>
            <InputWrapper label="Статус" paddingY fitWidth>
              <div className="flex w-full flex-col">
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: 'draft', label: 'Заявка' },
                    { value: 'active', label: 'Мероприятие' },
                    { value: 'canceled', label: 'Отменено' },
                    { value: 'closed', label: 'Закрыто' },
                  ].map((item) => {
                    const isActive = status === item.value
                    const isClosedOption = item.value === 'closed'
                    const disabled =
                      isClosedOption && !canSetClosedStatus && !isClosed
                    return (
                      <button
                        key={item.value}
                        type="button"
                        disabled={disabled}
                        title={disabled ? closeStatusDisabledReason : ''}
                        className={`focus-visible:ring-general inline-flex min-h-[32px] items-center rounded border px-3 py-1 text-sm font-medium transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none ${getEventStatusButtonClasses(
                          item.value,
                          isActive
                        )} ${isActive ? 'shadow' : 'shadow-sm'} ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                        onClick={() => {
                          if (disabled) return
                          setStatus(item.value)
                        }}
                      >
                        {item.label}
                      </button>
                    )
                  })}
                </div>
                {status !== 'closed' && !canSetClosedStatus ? (
                  <div className="mt-2 text-xs text-amber-700">
                    {closeStatusDisabledReason}
                  </div>
                ) : null}
                {isClosed ? (
                  <div className="mt-2 text-xs text-red-700">
                    Статус «Закрыто»: редактирование полей мероприятия
                    недоступно.
                  </div>
                ) : null}
              </div>
            </InputWrapper>
            <div className={formLockedClassName}>
              <ServiceMultiSelect
                value={servicesIds}
                onChange={setServicesIds}
                onCreate={openServiceCreateModal}
                error={errors.servicesIds}
                required
                onClearError={() => removeError('servicesIds')}
              />
              <div className="mt-4 flex items-end gap-x-1">
                <ComboBox
                  label="Что за событие?"
                  items={eventTypeOptions}
                  value={eventType}
                  onChange={(value) => {
                    removeError('eventType')
                    setEventType(value ?? '')
                  }}
                  placeholder="Выберите тип события"
                  fullWidth
                  noMargin
                  className="min-w-38 flex-1"
                  error={errors.eventType}
                  required
                />
                <AddIconButton
                  onClick={handleCreateEventType}
                  title="Добавить тип события"
                  size="md"
                />
              </div>

              <div className="flex flex-wrap items-center gap-x-1">
                <DateTimePicker
                  value={eventDate}
                  onChange={(value) => {
                    removeError('eventDate')
                    const nextStart = value ?? null
                    setDateEnd(
                      (prevEnd) =>
                        shiftEndByStartChange(eventDate, nextStart, prevEnd) ??
                        prevEnd
                    )
                    setEventDate(nextStart)
                  }}
                  label="Дата начала"
                  error={errors.eventDate}
                />
                <DateTimePicker
                  value={dateEnd}
                  onChange={(value) => {
                    setDateEndTouched(true)
                    setDateEnd(value ?? null)
                  }}
                  label="Дата окончания"
                />
              </div>
              <AddressPoolPicker
                address={address}
                onChange={setAddress}
                label="Локация"
                required={false}
                errors={errors}
                townOptions={townOptions}
                onCreateTown={handleCreateTown}
              />
              <Textarea
                label="Описание"
                onChange={setDescription}
                value={description}
                rows={3}
              />
              <IconCheckBox
                checked={isTransferred}
                onClick={() => {
                  setIsTransferred((prev) => !prev)
                  removeError('colleagueId')
                }}
                label="Передано коллеге"
                checkedIcon={faCircleCheck}
                checkedIconColor="#F97316"
              />
              {isTransferred && (
                <ColleaguePicker
                  selectedColleague={selectedColleague}
                  selectedColleagueId={colleagueId}
                  onSelectClick={openColleagueSelectModal}
                  label="Коллега"
                  required={isTransferred}
                  error={errors.colleagueId}
                  compact
                  paddingY
                  fullWidth
                />
              )}
              {!calendarImportChecked && (
                <IconCheckBox
                  checked={calendarImportChecked}
                  onClick={() => setCalendarImportChecked(true)}
                  label={
                    importedFromCalendar
                      ? 'Импорт из календаря проверен'
                      : 'Проверка мероприятия завершена'
                  }
                  checkedIcon={faCircleCheck}
                  checkedIconColor="#10B981"
                />
              )}
              <DateTimePicker
                value={requestCreatedAt}
                onChange={(value) => setRequestCreatedAt(value ?? null)}
                label="Дата заявки"
              />
              <ErrorsList errors={errors} />
            </div>
          </FormWrapper>
        </TabPanel>

        <TabPanel tabName="Клиент и Контакты">
          <FormWrapper>
            <div className={formLockedClassName}>
              <ClientPicker
                selectedClient={selectedClient}
                selectedClientId={clientId}
                onSelectClick={openClientSelectModal}
                onViewClick={() => modalsFunc.client?.view(clientId)}
                onEditClick={() => modalsFunc.client?.edit(clientId)}
                onCreateClick={() =>
                  modalsFunc.client?.add((newClient) => {
                    if (!newClient?._id) return
                    setClientId(newClient._id)
                    removeError('clientId')
                  })
                }
                label="Клиент"
                required
                error={errors.clientId}
                paddingY
                fullWidth
                compact
                showSelectButton
              />
              <OtherContactsPicker
                contacts={otherContacts}
                clients={clients}
                onSelectContact={handleOtherContactSelect}
                onChangeComment={handleOtherContactCommentChange}
                onRemoveContact={handleOtherContactRemove}
                onEditContact={(index) => {
                  const contact = otherContacts[index]
                  if (contact?.clientId)
                    modalsFunc.client?.edit(contact.clientId)
                }}
                onViewContact={(index) => {
                  const contact = otherContacts[index]
                  if (contact?.clientId)
                    modalsFunc.client?.view(contact.clientId)
                }}
                onAddContact={handleOtherContactAdd}
              />
              <LabeledContainer label="Доп. события">
                <div className="flex w-full flex-col gap-2">
                  <div className="flex w-full justify-end">
                    <AddIconButton
                      onClick={() => handleAdditionalEventAdd()}
                      title="Добавить событие"
                      size="sm"
                    />
                  </div>
                  {hasDoneAdditionalEvents ? (
                    <IconCheckBox
                      checked={showDoneAdditionalEvents}
                      onClick={() =>
                        setShowDoneAdditionalEvents((prev) => !prev)
                      }
                      label="Показывать выполненные"
                      checkedIcon={faCircleCheck}
                      checkedIconColor="#16A34A"
                      noMargin
                    />
                  ) : null}

                  {additionalEvents.length ===
                  0 ? null : filteredAdditionalEvents.length === 0 ? (
                    <div className="text-sm text-gray-500">
                      Нет событий для выбранного фильтра
                    </div>
                  ) : (
                    <div className="tablet:grid-cols-2 laptop:grid-cols-3 grid grid-cols-1 gap-2">
                      {filteredAdditionalEvents.map(({ item, index }) => (
                        <div
                          key={`additional-event-${index}`}
                          className={`w-full rounded border p-2 ${
                            item?.done
                              ? 'border-emerald-200 bg-emerald-50/70'
                              : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleAdditionalEventToggleDone(index)
                              }
                              title={
                                item?.done
                                  ? 'Отметить как не выполнено'
                                  : 'Отметить как выполнено'
                              }
                              aria-label={
                                item?.done
                                  ? 'Отметить как не выполнено'
                                  : 'Отметить как выполнено'
                              }
                              className={`mt-0.5 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-full border transition ${
                                item?.done
                                  ? 'border-emerald-500 bg-emerald-500 text-white'
                                  : 'border-gray-300 bg-white text-gray-400 hover:border-emerald-400 hover:text-emerald-500'
                              }`}
                            >
                              <FontAwesomeIcon icon={faCircleCheck} />
                            </button>
                            <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div
                                  className={`truncate text-sm font-semibold ${
                                    item?.done
                                      ? 'text-emerald-700'
                                      : 'text-gray-900'
                                  }`}
                                >
                                  {item?.done ? '✓ ' : ''}
                                  {item?.title || `Событие #${index + 1}`}
                                </div>
                                <div className="text-xs text-gray-600">
                                  {item?.date
                                    ? new Date(item.date).toLocaleString(
                                        'ru-RU',
                                        {
                                          day: '2-digit',
                                          month: '2-digit',
                                          year: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        }
                                      )
                                    : 'Дата не указана'}
                                </div>
                                {item?.description ? (
                                  <div className="text-xs text-gray-700">
                                    {item.description}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                                <IconActionButton
                                  icon={faPencilAlt}
                                  onClick={() =>
                                    handleAdditionalEventEdit(index)
                                  }
                                  title="Редактировать событие"
                                  variant="warning"
                                  size="xs"
                                  className="min-h-8 min-w-8"
                                />
                                <IconActionButton
                                  icon={faTrashAlt}
                                  onClick={() =>
                                    handleAdditionalEventRemove(index)
                                  }
                                  title="Удалить событие"
                                  variant="danger"
                                  size="xs"
                                  className="min-h-8 min-w-8"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </LabeledContainer>
            </div>
          </FormWrapper>
        </TabPanel>

        <TabPanel tabName="Финансы и Документы">
          <div className={`flex flex-col gap-2 ${formLockedClassName}`}>
            <Input
              label="Договорная сумма"
              type="number"
              value={contractSum}
              onChange={setContractSum}
              min={0}
              step={1000}
              noMargin
            />
            {!hasDepositTransaction ? (
              <div className="flex flex-col gap-2">
                <IconCheckBox
                  checked={waitDeposit}
                  onClick={() =>
                    setWaitDeposit((prev) => {
                      const next = !prev
                      if (!next) {
                        setDepositDueAt(null)
                        setDepositExpectedAmount(null)
                      } else if (!depositDueAt) {
                        setDepositDueAt(
                          new Date(
                            Date.now() + 24 * 60 * 60 * 1000
                          ).toISOString()
                        )
                      }
                      return next
                    })
                  }
                  label="Ждем задаток"
                  checkedIcon={faCircleCheck}
                  checkedIconColor="#F97316"
                  noMargin
                />
                {waitDeposit ? (
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
                    <Input
                      label="Сумма задатка"
                      type="number"
                      value={depositExpectedAmount}
                      onChange={setDepositExpectedAmount}
                      min={0}
                      step={1000}
                      noMargin
                      className="w-[140px]"
                      inputClassName="w-[60px]"
                    />
                    <DateTimePicker
                      value={depositDueAt}
                      onChange={(value) => setDepositDueAt(value ?? null)}
                      label="Дата ожидания задатка"
                      noMargin
                    />
                  </div>
                ) : null}
              </div>
            ) : null}
            <Textarea
              label="Комментарий по финансам"
              value={financeComment}
              onChange={setFinanceComment}
              rows={2}
              wrapperClassName="mt-2"
              noMargin
            />
            <IconCheckBox
              checked={isByContract}
              onClick={() => setIsByContract((prev) => !prev)}
              label="По договору"
              checkedIcon={faCircleCheck}
              checkedIconColor="#2563EB"
              noMargin
            />
            {isByContract && canUseDocuments && (
              <div className="flex flex-wrap items-center gap-2">
                <AppButton
                  variant="secondary"
                  size="sm"
                  className="rounded"
                  onClick={openContractTemplateModal}
                >
                  Сформировать договор
                </AppButton>
                <AppButton
                  variant="secondary"
                  size="sm"
                  className="rounded"
                  onClick={openActTemplateModal}
                >
                  Сформировать акт
                </AppButton>
              </div>
            )}
            {isDraft ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {`Для заявки финансы, транзакции и документы недоступны. Переведите тип в "Мероприятие"`}
              </div>
            ) : null}
            {isByContract && !isDraft && canUseDocuments && (
              <div className="mt-3 flex flex-col gap-3">
                <LinksListEditor
                  label="Ссылки на договора"
                  links={contractLinks}
                  onChange={setContractLinks}
                  noMargin
                />
                <LinksListEditor
                  label="Ссылки на счета"
                  links={invoiceLinks}
                  onChange={setInvoiceLinks}
                  noMargin
                />
                <LinksListEditor
                  label="Ссылки на чеки"
                  links={receiptLinks}
                  onChange={setReceiptLinks}
                  noMargin
                />
                <LinksListEditor
                  label="Ссылки на акты"
                  links={actLinks}
                  onChange={setActLinks}
                  noMargin
                />
              </div>
            )}

            {!isDraft && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-base font-semibold text-gray-900">
                    Транзакции
                  </div>
                  <AddIconButton
                    onClick={() => openTransactionModal()}
                    disabled={
                      isDraft || clone || financeLoading || !sourceEventId
                    }
                    title="Добавить транзакцию"
                    size="sm"
                    className="disabled:cursor-not-allowed disabled:opacity-60"
                  />
                </div>

                {financeError && (
                  <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                    {financeError}
                  </div>
                )}

                <div className="rounded border border-gray-200 bg-white shadow-sm">
                  {eventTransactions.length === 0 ? (
                    <div className="px-3 py-4 text-sm text-gray-500">
                      Пока никаких транзакций небыло
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                        Поступления
                      </div>
                      {incomeTransactions.length === 0 ? (
                        <div className="px-3 pb-3 text-sm text-gray-500">
                          Поступлений нет
                        </div>
                      ) : (
                        incomeTransactions.map((transaction) => (
                          <div
                            key={transaction._id}
                            className="laptop:flex-row laptop:items-center laptop:justify-between flex flex-col gap-2 px-3 py-3"
                          >
                            <div className="flex flex-1 flex-wrap gap-3 text-sm">
                              <span className="font-semibold text-gray-900">
                                {transaction.amount.toLocaleString()} руб.
                              </span>
                              <span className="text-emerald-700">
                                {TRANSACTION_TYPES.find(
                                  (item) => item.value === transaction.type
                                )?.name ?? transaction.type}
                              </span>
                              {transaction.category && (
                                <span className="text-gray-600">
                                  {
                                    TRANSACTION_CATEGORIES.find(
                                      (item) =>
                                        item.value === transaction.category
                                    )?.name
                                  }
                                </span>
                              )}
                              <span className="text-gray-600">
                                {transaction.date
                                  ? new Date(transaction.date).toLocaleString(
                                      'ru-RU',
                                      {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      }
                                    )
                                  : ''}
                              </span>
                              {transaction.comment && (
                                <span className="text-gray-700">
                                  {transaction.comment}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <IconActionButton
                                icon={faPencilAlt}
                                onClick={() =>
                                  openTransactionModal(transaction._id)
                                }
                                disabled={financeLoading}
                                title="Редактировать транзакцию"
                                variant="warning"
                                size="sm"
                              />
                              <IconActionButton
                                icon={faTrashAlt}
                                onClick={() =>
                                  handleDeleteTransaction(transaction._id)
                                }
                                disabled={financeLoading}
                                title="Удалить транзакцию"
                                variant="danger"
                                size="sm"
                              />
                            </div>
                          </div>
                        ))
                      )}
                      <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                        Расходы
                      </div>
                      {expenseTransactions.length === 0 ? (
                        <div className="px-3 pb-3 text-sm text-gray-500">
                          Расходов нет
                        </div>
                      ) : (
                        expenseTransactions.map((transaction) => (
                          <div
                            key={transaction._id}
                            className="laptop:flex-row laptop:items-center laptop:justify-between flex flex-col gap-2 px-3 py-3"
                          >
                            <div className="flex flex-1 flex-wrap gap-3 text-sm">
                              <span className="font-semibold text-gray-900">
                                {transaction.amount.toLocaleString()} руб.
                              </span>
                              <span className="text-red-700">
                                {TRANSACTION_TYPES.find(
                                  (item) => item.value === transaction.type
                                )?.name ?? transaction.type}
                              </span>
                              {transaction.category && (
                                <span className="text-gray-600">
                                  {
                                    TRANSACTION_CATEGORIES.find(
                                      (item) =>
                                        item.value === transaction.category
                                    )?.name
                                  }
                                </span>
                              )}
                              <span className="text-gray-600">
                                {transaction.date
                                  ? new Date(transaction.date).toLocaleString(
                                      'ru-RU',
                                      {
                                        day: '2-digit',
                                        month: '2-digit',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      }
                                    )
                                  : ''}
                              </span>
                              {transaction.comment && (
                                <span className="text-gray-700">
                                  {transaction.comment}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <IconActionButton
                                icon={faPencilAlt}
                                onClick={() =>
                                  openTransactionModal(transaction._id)
                                }
                                disabled={financeLoading}
                                title="Редактировать транзакцию"
                                variant="warning"
                                size="sm"
                              />
                              <IconActionButton
                                icon={faTrashAlt}
                                onClick={() =>
                                  handleDeleteTransaction(transaction._id)
                                }
                                disabled={financeLoading}
                                title="Удалить транзакцию"
                                variant="danger"
                                size="sm"
                              />
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </TabPanel>
        {googleCalendarResponseText ? (
          <TabPanel tabName="Ответ Google Calendar">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-800">
                Ответ Google Calendar
              </div>
              <button
                type="button"
                className="h-8 rounded border border-gray-300 px-3 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                onClick={() => {
                  if (!navigator?.clipboard) return
                  navigator.clipboard.writeText(googleCalendarResponseText)
                }}
              >
                Скопировать
              </button>
            </div>
            <pre className="max-h-72 w-full overflow-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs whitespace-pre-wrap text-gray-800">
              {googleCalendarResponseText}
            </pre>
          </TabPanel>
        ) : null}
      </TabContext>
    )
  }

  return {
    title: `${eventId && !clone ? 'Редактирование' : 'Создание'} мероприятия`,
    confirmButtonName: eventId && !clone ? 'Применить' : 'Создать',
    Children: EventModal,
  }
}

export default eventFunc
