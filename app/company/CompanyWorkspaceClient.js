'use client'

import { useSetAtom } from 'jotai'
import serviceGroupsAtom from '@state/atoms/serviceGroupsAtom'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  faCalendarAlt,
  faCheck,
  faChevronDown,
  faFilter,
  faList,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { apiJson } from '@helpers/apiClient'
import DropDown from '@components/DropDown'
import OrdersList from '@components/party/lists/OrdersList'
import PartyOrdersCalendar from '@components/party/orders/PartyOrdersCalendar'
import CallsList from '@components/party/lists/CallsList'
import PartyUpcomingEventsModal, {
  getOrderEndDate,
} from '@components/party/modals/PartyUpcomingEventsModal'
import ClientsList from '@components/party/lists/ClientsList'
import StaffList from '@components/party/lists/StaffList'
import LocationsList from '@components/party/lists/LocationsList'
import ServicesList from '@components/party/lists/ServicesList'
import OrderModal from '@components/party/modals/OrderModal'
import OrderViewModal from '@components/party/modals/OrderViewModal'
import OrderAdditionalEventsModal from '@components/party/modals/OrderAdditionalEventsModal'
import {
  ClientFormModal,
  ClientViewModal,
} from '@components/party/modals/ClientModal'
import StaffModal from '@components/party/modals/StaffModal'
import LocationModal from '@components/party/modals/LocationModal'
import { ServiceCreateModal } from '@components/party/modals/ServiceModal'
import {
  EMPTY_ORDER,
  EMPTY_STAFF,
  EMPTY_LOCATION,
  EMPTY_PARTY_CLIENT,
  EMPTY_PARTY_SERVICE,
} from '@helpers/partyHelpers'
import { formatMoney } from '@helpers/formatMoney'
import {
  getPartyCompanyOnboardingProgress,
  getPartyCompanyOnboardingSteps,
} from '@helpers/partyOnboarding'
import { matchesPartyOrderFinanceFilter } from '@helpers/partyOrderFinanceFilters'

const ACTIVE_COMPANY_STORAGE_KEY = 'partycrm.activeCompanyId'

const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

const addDays = (date, days) => {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

const isSameDay = (value, day) => {
  if (!value) return false
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return false
  return startOfDay(date).getTime() === startOfDay(day).getTime()
}

const getOrderPayoutTotal = (order) =>
  (order.assignedStaff ?? []).reduce(
    (sum, item) => sum + Number(item.payoutAmount || 0),
    0
  )

const getOrderContractAmount = (order) =>
  Number(order.contractAmount ?? order.clientPayment?.totalAmount ?? 0)

const getOrderTransactionTotal = (order, type) =>
  (order.transactions ?? [])
    .filter((transaction) => transaction.type === type)
    .reduce((sum, transaction) => sum + Number(transaction.amount || 0), 0)

const hasOpenAdditionalEvents = (order) =>
  (order.additionalEvents ?? []).some((item) => !item.done)

const getOrderDurationMinutes = (order) => {
  const explicit = Number(order?.durationMinutes)
  if (Number.isFinite(explicit) && explicit > 0) return Math.floor(explicit)

  const start = order?.eventDate ? new Date(order.eventDate) : null
  const end = order?.dateEnd ? new Date(order.dateEnd) : null
  if (
    start &&
    end &&
    !Number.isNaN(start.getTime()) &&
    !Number.isNaN(end.getTime()) &&
    end > start
  ) {
    return Math.max(Math.round((end.getTime() - start.getTime()) / 60000), 1)
  }

  return 60
}

const normalizeOrderDraft = (order) => ({
  ...order,
  durationMinutes: String(getOrderDurationMinutes(order)),
  contractAmount:
    order.contractAmount ?? order.clientPayment?.totalAmount ?? '',
  clientPayment: {
    totalAmount: order.clientPayment?.totalAmount ?? order.contractAmount ?? '',
    prepaidAmount: order.clientPayment?.prepaidAmount ?? '',
    status: order.clientPayment?.status ?? 'none',
  },
  transactions: Array.isArray(order.transactions) ? order.transactions : [],
  additionalEvents: Array.isArray(order.additionalEvents)
    ? order.additionalEvents
    : [],
  otherContacts: Array.isArray(order.otherContacts) ? order.otherContacts : [],
  clientAddress: {
    town: order.clientAddress?.town ?? '',
    street: order.clientAddress?.street ?? '',
    house: order.clientAddress?.house ?? '',
    room: order.clientAddress?.room ?? '',
    comment: order.clientAddress?.comment ?? '',
  },
})

const getAssignedStaffIds = (order) =>
  new Set((order.assignedStaff ?? []).map((item) => String(item.staffId)))

const rangesOverlap = (first, second) =>
  first && second && first.start < second.end && second.start < first.end

const getOrderRange = (order) => {
  const start = order.eventDate ? new Date(order.eventDate) : null
  const end = order.dateEnd ? new Date(order.dateEnd) : null
  if (!start || Number.isNaN(start.getTime())) return null
  if (!end || Number.isNaN(end.getTime())) {
    return { start, end: new Date(start.getTime() + 60 * 60 * 1000) }
  }
  return { start, end }
}

const hasOrderConflict = (order, orders) => {
  const range = getOrderRange(order)
  if (!range) return false
  const orderStaffIds = getAssignedStaffIds(order)

  return orders.some((other) => {
    if (String(other._id) === String(order._id)) return false
    if (other.status === 'canceled' || other.status === 'closed') return false
    if (!rangesOverlap(range, getOrderRange(other))) return false

    const sameLocation =
      order.placeType === 'company_location' &&
      other.placeType === 'company_location' &&
      order.locationId &&
      String(order.locationId) === String(other.locationId)

    const otherStaffIds = getAssignedStaffIds(other)
    const sameStaff = [...orderStaffIds].some((id) => otherStaffIds.has(id))

    return Boolean(sameLocation || sameStaff)
  })
}

const buildFinanceSummary = (orders) =>
  orders.reduce(
    (summary, order) => {
      const contractAmount = getOrderContractAmount(order)
      const incomeAmount = getOrderTransactionTotal(order, 'income')
      const expenseAmount = getOrderTransactionTotal(order, 'expense')
      const payoutAmount = getOrderPayoutTotal(order)

      return {
        orderCount: summary.orderCount + 1,
        contractAmount: summary.contractAmount + contractAmount,
        incomeAmount: summary.incomeAmount + incomeAmount,
        expenseAmount: summary.expenseAmount + expenseAmount,
        balanceAmount:
          summary.balanceAmount + Math.max(contractAmount - incomeAmount, 0),
        payoutAmount: summary.payoutAmount + payoutAmount,
        grossMargin:
          summary.grossMargin + incomeAmount - expenseAmount - payoutAmount,
      }
    },
    {
      orderCount: 0,
      contractAmount: 0,
      incomeAmount: 0,
      expenseAmount: 0,
      balanceAmount: 0,
      payoutAmount: 0,
      grossMargin: 0,
    }
  )

const formatClosePayoutStatus = (summary = {}) => {
  if (summary.payoutStatus === 'none') return 'выплат нет'
  if (summary.unpaidPayoutCount > 0) {
    return `не выплачено ${formatMoney(summary.unpaidPayoutTotal)} (${summary.unpaidPayoutCount})`
  }
  if (summary.payoutStatus === 'paid') return 'выплачено'
  return 'требует проверки'
}

const buildClosedOrdersSummary = (closed = []) => {
  const summary = closed.reduce(
    (result, item) => {
      const itemSummary = item?.summary ?? {}
      return {
        contractAmount:
          result.contractAmount + Number(itemSummary.contractAmount || 0),
        incomeTotal: result.incomeTotal + Number(itemSummary.incomeTotal || 0),
        expenseTotal:
          result.expenseTotal + Number(itemSummary.expenseTotal || 0),
        balanceDue: result.balanceDue + Number(itemSummary.balanceDue || 0),
        payoutTotal: result.payoutTotal + Number(itemSummary.payoutTotal || 0),
        paidPayoutTotal:
          result.paidPayoutTotal + Number(itemSummary.paidPayoutTotal || 0),
        unpaidPayoutTotal:
          result.unpaidPayoutTotal + Number(itemSummary.unpaidPayoutTotal || 0),
        unpaidPayoutCount:
          result.unpaidPayoutCount + Number(itemSummary.unpaidPayoutCount || 0),
        grossMargin: result.grossMargin + Number(itemSummary.grossMargin || 0),
      }
    },
    {
      contractAmount: 0,
      incomeTotal: 0,
      expenseTotal: 0,
      balanceDue: 0,
      payoutTotal: 0,
      paidPayoutTotal: 0,
      unpaidPayoutTotal: 0,
      unpaidPayoutCount: 0,
      grossMargin: 0,
    }
  )

  return {
    ...summary,
    payoutStatus:
      summary.payoutTotal <= 0
        ? 'none'
        : summary.unpaidPayoutCount <= 0
          ? 'paid'
          : summary.paidPayoutTotal > 0
            ? 'partial'
            : 'unpaid',
  }
}

const buildClosePastOrdersAlert = ({ closed = [], skipped = [] } = {}) => {
  const lines = []
  if (closed.length > 0) {
    const summary = buildClosedOrdersSummary(closed)
    lines.push(`Закрыто заказов: ${closed.length}`)
    lines.push('Финансовый результат закрытых заказов:')
    lines.push(`Выручка: ${formatMoney(summary.incomeTotal)}`)
    lines.push(`Расходы: ${formatMoney(summary.expenseTotal)}`)
    lines.push(`Выплаты: ${formatMoney(summary.payoutTotal)}`)
    lines.push(`Маржа: ${formatMoney(summary.grossMargin)}`)
    lines.push(`Статус выплат: ${formatClosePayoutStatus(summary)}`)
  }
  if (skipped.length > 0) {
    lines.push(
      `Не закрыто заказов: ${skipped.length}. Проверьте оплату, выплаты и открытые задачи.`
    )
  }
  return lines.join('\n')
}

const buildCompanyRequestOptions = (companyId, options = {}) => ({
  ...options,
  headers: {
    ...(options.headers ?? {}),
    ...(companyId ? { 'x-partycrm-company-id': companyId } : {}),
  },
})

const isOrderPast = (order, now = new Date()) => {
  const endDate = getOrderEndDate(order)
  if (!endDate) return false
  return startOfDay(endDate).getTime() < startOfDay(now).getTime()
}

const canClosePastOrder = (order, now = new Date()) =>
  ['draft', 'active'].includes(order?.status) && isOrderPast(order, now)

const createEmptyOrderDraft = (companySettings = {}, locations = []) => ({
  ...EMPTY_ORDER,
  durationMinutes: String(
    Number(companySettings?.defaultOrderDurationMinutes || 60) || 60
  ),
  locationId:
    locations.length > 0 && EMPTY_ORDER.placeType === 'company_location'
      ? locations[0]._id
      : '',
})

const OrderFilterDropdown = ({
  orderFilters = [],
  orderFilter = 'all',
  setOrderFilter,
}) => {
  const selectedFilter =
    orderFilters.find((filter) => filter.value === orderFilter) ??
    orderFilters[0]

  if (!orderFilters.length) return null

  return (
    <DropDown
      placement="right"
      menuPadding={false}
      renderInPortal
      trigger={
        <button
          type="button"
          className="inline-flex min-h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-md border border-sky-100 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50 sm:w-auto"
          aria-label="Выбрать фильтр заказов"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <FontAwesomeIcon
              icon={faFilter}
              className="h-4 w-4 shrink-0 text-sky-600"
            />
            <span className="whitespace-nowrap">Фильтр:</span>
            <span className="min-w-0 truncate text-sky-700">
              {selectedFilter?.label || 'Все'}
            </span>
            <span className="rounded bg-sky-50 px-1.5 py-0.5 text-xs text-sky-500">
              {selectedFilter?.count ?? 0}
            </span>
          </span>
          <FontAwesomeIcon
            icon={faChevronDown}
            className="h-3.5 w-3.5 shrink-0 text-slate-400"
          />
        </button>
      }
    >
      <div className="w-72 max-w-[calc(100vw-16px)] overflow-hidden rounded-lg">
        {orderFilters.map((filter) => {
          const isActive = orderFilter === filter.value
          return (
            <button
              key={filter.value}
              type="button"
              role="menuitemradio"
              aria-checked={isActive}
              className={`flex min-h-10 w-full cursor-pointer items-center gap-3 px-3 py-2 text-left text-sm transition ${
                isActive
                  ? 'bg-sky-50 text-sky-800'
                  : 'bg-white text-slate-700 hover:bg-sky-50'
              }`}
              onClick={() => setOrderFilter(filter.value)}
            >
              <span className="flex h-4 w-4 shrink-0 items-center justify-center">
                {isActive && (
                  <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" />
                )}
              </span>
              <span className="min-w-0 flex-1 truncate font-semibold">
                {filter.label}
              </span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-semibold ${
                  isActive
                    ? 'bg-sky-100 text-sky-700'
                    : 'bg-slate-100 text-slate-500'
                }`}
              >
                {filter.count}
              </span>
            </button>
          )
        })}
      </div>
    </DropDown>
  )
}

export default function CompanyWorkspaceClient({ section = 'overview' }) {
  const setServiceGroups = useSetAtom(serviceGroupsAtom)
  const [context, setContext] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [activeCompanyId, setActiveCompanyId] = useState('')
  const [locations, setLocations] = useState([])
  const [archivedLocations, setArchivedLocations] = useState([])
  const [clients, setClients] = useState([])
  const [similarClients, setSimilarClients] = useState([])
  const [staff, setStaff] = useState([])
  const [services, setServices] = useState([])
  const [orders, setOrders] = useState([])
  const [calls, setCalls] = useState([])
  const [companySettings, setCompanySettings] = useState({})
  const [companyAccess, setCompanyAccess] = useState(null)
  const [orderDraft, setOrderDraft] = useState(() => createEmptyOrderDraft())
  const [clientDraft, setClientDraft] = useState(EMPTY_PARTY_CLIENT)
  const [staffDraft, setStaffDraft] = useState(EMPTY_STAFF)
  const [locationDraft, setLocationDraft] = useState(EMPTY_LOCATION)
  const [editingLocationId, setEditingLocationId] = useState('')
  const [editingClientId, setEditingClientId] = useState('')
  const [serviceDraft, setServiceDraft] = useState(EMPTY_PARTY_SERVICE)
  const [editingServiceId, setEditingServiceId] = useState('')
  const [serviceSaving, setServiceSaving] = useState(false)
  const [editingOrderId, setEditingOrderId] = useState('')
  const [editingStaffId, setEditingStaffId] = useState('')
  const [linkingStaffId, setLinkingStaffId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [activeModal, setActiveModal] = useState('')
  const [accessStatus, setAccessStatus] = useState('loading')
  const [orderFilter, setOrderFilter] = useState('all')
  const [orderViewMode, setOrderViewMode] = useState('list')
  const [clientSearch, setClientSearch] = useState('')
  const [financeExportFrom, setFinanceExportFrom] = useState('')
  const [financeExportTo, setFinanceExportTo] = useState('')
  const [creatingCallOrderId, setCreatingCallOrderId] = useState('')

  const hasAccess = Boolean(context?.tenantId && context?.staff)
  const canManage = ['owner', 'admin'].includes(context?.role)
  const canUseStatistics = companyAccess?.allowStatistics !== false

  // Load workspace data
  const loadWorkspace = useCallback(
    async (preferredCompanyId = '') => {
      setLoading(true)
      setError('')
      try {
        const membershipsResponse = await apiJson('/api/party/memberships', {
          cache: 'no-store',
        })
        const availableMemberships = membershipsResponse.data?.memberships ?? []
        setMemberships(availableMemberships)

        if (availableMemberships.length === 0) {
          setContext(null)
          setLocations([])
          setArchivedLocations([])
          setClients([])
          setStaff([])
          setServices([])
          setServiceGroups([])
          setOrders([])
          setCalls([])
          setCompanySettings({})
          setCompanyAccess(null)
          setActiveCompanyId('')
          setAccessStatus('not_configured')
          return
        }

        const storedCompanyId =
          typeof window !== 'undefined'
            ? window.localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY) || ''
            : ''
        const requestedCompanyId = preferredCompanyId || storedCompanyId
        const selectedMembership =
          availableMemberships.find(
            (membership) => membership.tenantId === requestedCompanyId
          ) ||
          availableMemberships.find((membership) => membership.isAdmin) ||
          availableMemberships[0]
        const selectedCompanyId = selectedMembership.tenantId

        setActiveCompanyId(selectedCompanyId)
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(
            ACTIVE_COMPANY_STORAGE_KEY,
            selectedCompanyId
          )
        }
        setContext({
          tenantId: selectedMembership.tenantId,
          role: selectedMembership.role,
          staff: selectedMembership.staff,
          company: selectedMembership.company,
        })
        setAccessStatus('ready')

        const [
          locationsResponse,
          archivedLocationsResponse,
          clientsResponse,
          staffResponse,
          servicesResponse,
          ordersResponse,
          callsResponse,
          companySettingsResponse,
          serviceGroupsResponse,
        ] = await Promise.all([
          apiJson(
            '/api/party/locations',
            buildCompanyRequestOptions(selectedCompanyId, { cache: 'no-store' })
          ),
          apiJson(
            '/api/party/locations?status=archived',
            buildCompanyRequestOptions(selectedCompanyId, { cache: 'no-store' })
          ),
          apiJson(
            '/api/party/clients',
            buildCompanyRequestOptions(selectedCompanyId, { cache: 'no-store' })
          ),
          apiJson(
            '/api/party/staff',
            buildCompanyRequestOptions(selectedCompanyId, { cache: 'no-store' })
          ),
          apiJson(
            '/api/party/services',
            buildCompanyRequestOptions(selectedCompanyId, { cache: 'no-store' })
          ),
          apiJson(
            '/api/party/orders',
            buildCompanyRequestOptions(selectedCompanyId, { cache: 'no-store' })
          ),
          apiJson(
            '/api/party/calls',
            buildCompanyRequestOptions(selectedCompanyId, { cache: 'no-store' })
          ).catch((callsError) => {
            if (callsError.status === 403) return { data: [] }
            throw callsError
          }),
          apiJson(
            '/api/party/company-settings',
            buildCompanyRequestOptions(selectedCompanyId, { cache: 'no-store' })
          ),
          apiJson(
            '/api/party/service-groups',
            buildCompanyRequestOptions(selectedCompanyId, { cache: 'no-store' })
          ),
        ])
        setLocations(locationsResponse.data ?? [])
        setArchivedLocations(archivedLocationsResponse.data ?? [])
        setClients(clientsResponse.data ?? [])
        setStaff(staffResponse.data ?? [])
        setServices(servicesResponse.data ?? [])
        setOrders(ordersResponse.data ?? [])
        setCalls(callsResponse.data ?? [])
        setServiceGroups(serviceGroupsResponse.data ?? [])
        setCompanySettings(
          companySettingsResponse.data?.settings ??
            companySettingsResponse.data ??
            {}
        )
        setCompanyAccess(companySettingsResponse.data?.access ?? null)
      } catch (loadError) {
        if (loadError.status === 401) {
          setContext(null)
          setAccessStatus('unauthenticated')
        } else if (loadError.status === 403) {
          setContext(null)
          setAccessStatus('not_configured')
        } else {
          setAccessStatus('error')
          setError('Не удалось загрузить данные')
        }
      } finally {
        setLoading(false)
      }
    },
    [setServiceGroups]
  )

  useEffect(() => {
    loadWorkspace()
  }, [loadWorkspace])

  const switchCompany = (companyId) => {
    setActiveCompanyId(companyId)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, companyId)
    }
    loadWorkspace(companyId)
  }

  const clientsById = useMemo(
    () => new Map(clients.map((client) => [String(client._id), client])),
    [clients]
  )

  const financeSummary = useMemo(() => buildFinanceSummary(orders), [orders])
  const onboardingSteps = useMemo(
    () =>
      getPartyCompanyOnboardingSteps({
        locations,
        services,
        staff,
        orders,
      }),
    [locations, services, staff, orders]
  )
  const onboardingProgress = useMemo(
    () => getPartyCompanyOnboardingProgress(onboardingSteps),
    [onboardingSteps]
  )

  const ordersScope = section === 'orders-past' ? 'past' : 'upcoming'
  const scopedOrders = useMemo(() => {
    if (section === 'overview') return orders
    return orders.filter((order) =>
      ordersScope === 'past' ? isOrderPast(order) : !isOrderPast(order)
    )
  }, [orders, ordersScope, section])

  const upcomingOrderFilters = useMemo(() => {
    const today = new Date()
    const tomorrow = addDays(today, 1)
    const sourceOrders = scopedOrders
    return [
      { value: 'all', label: 'Все', count: sourceOrders.length },
      {
        value: 'new',
        label: 'Новые',
        count: sourceOrders.filter((o) => o.status === 'draft').length,
      },
      {
        value: 'without_staff',
        label: 'Без исполнителя',
        count: sourceOrders.filter((o) => (o.assignedStaff ?? []).length === 0)
          .length,
      },
      {
        value: 'conflict',
        label: 'Конфликты',
        count: sourceOrders.filter((o) => hasOrderConflict(o, orders)).length,
      },
      {
        value: 'tasks',
        label: 'Есть задачи',
        count: sourceOrders.filter(hasOpenAdditionalEvents).length,
      },
      {
        value: 'finance_wait_prepayment',
        label: 'Ждет предоплату',
        count: sourceOrders.filter((o) =>
          matchesPartyOrderFinanceFilter(o, 'finance_wait_prepayment')
        ).length,
      },
      {
        value: 'finance_debt',
        label: 'Есть долг',
        count: sourceOrders.filter((o) =>
          matchesPartyOrderFinanceFilter(o, 'finance_debt')
        ).length,
      },
      {
        value: 'finance_unpaid_payouts',
        label: 'Невыплаты',
        count: sourceOrders.filter((o) =>
          matchesPartyOrderFinanceFilter(o, 'finance_unpaid_payouts')
        ).length,
      },
      {
        value: 'finance_negative_margin',
        label: 'Минус маржа',
        count: sourceOrders.filter((o) =>
          matchesPartyOrderFinanceFilter(o, 'finance_negative_margin')
        ).length,
      },
      {
        value: 'today',
        label: 'Сегодня',
        count: sourceOrders.filter(
          (o) => o.eventDate && isSameDay(o.eventDate, today)
        ).length,
      },
      {
        value: 'tomorrow',
        label: 'Завтра',
        count: sourceOrders.filter(
          (o) => o.eventDate && isSameDay(o.eventDate, tomorrow)
        ).length,
      },
      {
        value: 'canceled',
        label: 'Отменённые',
        count: sourceOrders.filter((o) => o.status === 'canceled').length,
      },
    ]
  }, [orders, scopedOrders])

  const pastOrderFilters = useMemo(() => {
    const sourceOrders = scopedOrders
    return [
      { value: 'all', label: 'Все', count: sourceOrders.length },
      {
        value: 'finished',
        label: 'Завершены',
        count: sourceOrders.filter(
          (o) => o.status === 'active' || o.status === 'draft'
        ).length,
      },
      {
        value: 'closed',
        label: 'Закрыты',
        count: sourceOrders.filter((o) => o.status === 'closed').length,
      },
      {
        value: 'finance_debt',
        label: 'Есть долг',
        count: sourceOrders.filter((o) =>
          matchesPartyOrderFinanceFilter(o, 'finance_debt')
        ).length,
      },
      {
        value: 'finance_unpaid_payouts',
        label: 'Невыплаты',
        count: sourceOrders.filter((o) =>
          matchesPartyOrderFinanceFilter(o, 'finance_unpaid_payouts')
        ).length,
      },
      {
        value: 'finance_negative_margin',
        label: 'Минус маржа',
        count: sourceOrders.filter((o) =>
          matchesPartyOrderFinanceFilter(o, 'finance_negative_margin')
        ).length,
      },
      {
        value: 'canceled',
        label: 'Отменены',
        count: sourceOrders.filter((o) => o.status === 'canceled').length,
      },
    ]
  }, [scopedOrders])

  const orderFilters = useMemo(
    () => (ordersScope === 'past' ? pastOrderFilters : upcomingOrderFilters),
    [ordersScope, upcomingOrderFilters, pastOrderFilters]
  )

  const filteredOrders = useMemo(() => {
    const today = new Date()
    const tomorrow = addDays(today, 1)
    const sourceOrders = scopedOrders
    switch (orderFilter) {
      case 'new':
        return sourceOrders.filter((o) => o.status === 'draft')
      case 'without_staff':
        return sourceOrders.filter((o) => (o.assignedStaff ?? []).length === 0)
      case 'conflict':
        return sourceOrders.filter((o) => hasOrderConflict(o, orders))
      case 'tasks':
        return sourceOrders.filter(hasOpenAdditionalEvents)
      case 'finance_wait_prepayment':
      case 'finance_debt':
      case 'finance_unpaid_payouts':
      case 'finance_negative_margin':
        return sourceOrders.filter((o) =>
          matchesPartyOrderFinanceFilter(o, orderFilter)
        )
      case 'today':
        return sourceOrders.filter(
          (o) => o.eventDate && isSameDay(o.eventDate, today)
        )
      case 'tomorrow':
        return sourceOrders.filter(
          (o) => o.eventDate && isSameDay(o.eventDate, tomorrow)
        )
      case 'finished':
        return sourceOrders.filter(
          (o) => o.status === 'active' || o.status === 'draft'
        )
      case 'closed':
        return sourceOrders.filter((o) => o.status === 'closed')
      case 'canceled':
        return sourceOrders.filter((o) => o.status === 'canceled')
      default:
        return sourceOrders
    }
  }, [orders, orderFilter, scopedOrders])

  const closePastCount = useMemo(
    () => orders.filter((order) => canClosePastOrder(order)).length,
    [orders]
  )

  // Order actions
  const addOrder = useCallback(
    async (options = {}) => {
      if (hasOrderConflict(orderDraft, orders)) {
        const confirmed = window.confirm(
          'Обнаружен конфликт по времени или исполнителям. Всё равно сохранить заказ?'
        )
        if (!confirmed) return
      }

      setSaving(true)
      try {
        const response = await apiJson(
          '/api/party/orders',
          buildCompanyRequestOptions(activeCompanyId, {
            method: 'POST',
            body: JSON.stringify(orderDraft),
          })
        )
        if (response.data) {
          const createdOrder = response.data
          setOrders((prev) => [...prev, createdOrder])
          if (options.keepOpen) {
            setEditingOrderId(String(createdOrder._id))
            setOrderDraft(normalizeOrderDraft(createdOrder))
            return createdOrder
          }
          setActiveModal('')
          setOrderDraft(createEmptyOrderDraft(companySettings, locations))
          return createdOrder
        }
        return null
      } finally {
        setSaving(false)
      }
    },
    [orderDraft, orders, activeCompanyId, companySettings, locations]
  )

  const editOrder = useCallback(async () => {
    if (!editingOrderId) return

    if (hasOrderConflict(orderDraft, orders)) {
      const confirmed = window.confirm(
        'Обнаружен конфликт по времени или исполнителям. Всё равно сохранить заказ?'
      )
      if (!confirmed) return
    }

    setSaving(true)
    try {
      const response = await apiJson(
        `/api/party/orders/${editingOrderId}`,
        buildCompanyRequestOptions(activeCompanyId, {
          method: 'PATCH',
          body: JSON.stringify(orderDraft),
        })
      )
      if (response.data) {
        setOrders((prev) =>
          prev.map((o) =>
            String(o._id) === editingOrderId ? response.data : o
          )
        )
        setActiveModal('')
        setEditingOrderId('')
        setOrderDraft(createEmptyOrderDraft(companySettings, locations))
      }
    } finally {
      setSaving(false)
    }
  }, [
    orderDraft,
    editingOrderId,
    orders,
    activeCompanyId,
    companySettings,
    locations,
  ])

  const updateOrder = useCallback(
    async (nextOrder) => {
      if (!nextOrder?._id) return null
      setSaving(true)
      try {
        const response = await apiJson(
          `/api/party/orders/${nextOrder._id}`,
          buildCompanyRequestOptions(activeCompanyId, {
            method: 'PATCH',
            body: JSON.stringify(nextOrder),
          })
        )
        if (response.data) {
          setOrders((prev) =>
            prev.map((o) =>
              String(o._id) === String(nextOrder._id) ? response.data : o
            )
          )
        }
        return response.data
      } finally {
        setSaving(false)
      }
    },
    [activeCompanyId]
  )

  const cancelOrder = useCallback(
    async (orderId) => {
      const confirmed = window.confirm(
        'Вы уверены, что хотите отменить этот заказ?'
      )
      if (!confirmed) return

      setSaving(true)
      try {
        await apiJson(
          `/api/party/orders/${orderId}`,
          buildCompanyRequestOptions(activeCompanyId, {
            method: 'DELETE',
          })
        )
        setOrders((prev) =>
          prev.map((o) =>
            String(o._id) === String(orderId) ? { ...o, status: 'canceled' } : o
          )
        )
      } finally {
        setSaving(false)
      }
    },
    [activeCompanyId]
  )

  const deleteOrder = useCallback(
    async (orderId) => {
      const confirmed = window.confirm(
        'Вы уверены, что хотите полностью удалить этот заказ? Это действие необратимо.'
      )
      if (!confirmed) return

      setSaving(true)
      try {
        await apiJson(
          `/api/party/orders/${orderId}?permanent=true`,
          buildCompanyRequestOptions(activeCompanyId, {
            method: 'DELETE',
          })
        )
        setOrders((prev) =>
          prev.filter((o) => String(o._id) !== String(orderId))
        )
      } finally {
        setSaving(false)
      }
    },
    [activeCompanyId]
  )

  const changeOrderStatus = useCallback(
    async (orderId, newStatus) => {
      setSaving(true)
      try {
        const response = await apiJson(
          `/api/party/orders/${orderId}`,
          buildCompanyRequestOptions(activeCompanyId, {
            method: 'PATCH',
            body: JSON.stringify({ status: newStatus }),
          })
        )
        if (response.data) {
          setOrders((prev) =>
            prev.map((o) =>
              String(o._id) === String(orderId) ? response.data : o
            )
          )
        }
      } catch (err) {
        const blockers = err?.payload?.blockers
        if (Array.isArray(blockers) && blockers.length > 0) {
          window.alert(blockers.map((blocker) => blocker.message).join('\n'))
          return
        }
        window.alert(err?.message || 'Не удалось изменить статус заказа')
      } finally {
        setSaving(false)
      }
    },
    [activeCompanyId]
  )

  const closePastOrders = useCallback(async () => {
    setSaving(true)
    try {
      const response = await apiJson(
        '/api/party/orders/close-past',
        buildCompanyRequestOptions(activeCompanyId, { method: 'POST' })
      )
      const closedIds = new Set((response.data?.closedIds ?? []).map(String))
      if (closedIds.size > 0) {
        setOrders((prev) =>
          prev.map((order) =>
            closedIds.has(String(order._id))
              ? { ...order, status: 'closed' }
              : order
          )
        )
      }
      const closed = response.data?.closed ?? []
      const skipped = response.data?.skipped ?? []
      const message = buildClosePastOrdersAlert({ closed, skipped })
      if (message) {
        window.alert(message)
      }
    } finally {
      setSaving(false)
    }
  }, [activeCompanyId])

  const createOrderFromCall = useCallback(
    async (callId) => {
      if (!callId || !activeCompanyId) return

      setCreatingCallOrderId(String(callId))
      setError('')
      try {
        const response = await apiJson(
          `/api/party/calls/${callId}/create-order`,
          buildCompanyRequestOptions(activeCompanyId, { method: 'POST' })
        )
        const createdOrder = response.data?.order
        const updatedCall = response.data?.call
        if (createdOrder) {
          setOrders((prev) => [createdOrder, ...prev])
        }
        if (updatedCall) {
          setCalls((prev) =>
            prev.map((call) =>
              String(call._id) === String(callId) ? updatedCall : call
            )
          )
        }
      } catch (createError) {
        setError(createError?.message || 'Не удалось создать заказ из звонка')
      } finally {
        setCreatingCallOrderId('')
      }
    },
    [activeCompanyId]
  )

  const reviewPerformerReport = useCallback(
    async ({ orderId, staffId, status, reviewComment = '' }) => {
      if (!activeCompanyId || !orderId || !staffId) return
      const response = await apiJson(
        `/api/party/orders/${orderId}/reports/${staffId}`,
        buildCompanyRequestOptions(activeCompanyId, {
          method: 'PATCH',
          body: JSON.stringify({ status, reviewComment }),
        })
      )
      const report = response.data?.report
      setOrders((prev) =>
        prev.map((order) =>
          String(order._id) === String(orderId)
            ? {
                ...order,
                assignedStaff: (order.assignedStaff || []).map((item) =>
                  String(item.staffId) === String(staffId)
                    ? { ...item, report }
                    : item
                ),
              }
            : order
        )
      )
      setOrderDraft((prev) =>
        String(prev?._id) === String(orderId)
          ? {
              ...prev,
              assignedStaff: (prev.assignedStaff || []).map((item) =>
                String(item.staffId) === String(staffId)
                  ? { ...item, report }
                  : item
              ),
            }
          : prev
      )
    },
    [activeCompanyId]
  )

  const downloadFinanceCsv = useCallback(async () => {
    if (!activeCompanyId) return
    const search = new URLSearchParams()
    if (financeExportFrom) search.set('from', financeExportFrom)
    if (financeExportTo) search.set('to', financeExportTo)
    const response = await fetch(
      `/api/party/finance/export${search.toString() ? `?${search}` : ''}`,
      {
        headers: {
          'x-partycrm-company-id': activeCompanyId,
        },
      }
    )
    if (!response.ok) {
      window.alert('Не удалось выгрузить финансы')
      return
    }
    const blob = await response.blob()
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    const suffix = [financeExportFrom, financeExportTo]
      .filter(Boolean)
      .join('_')
    link.href = url
    link.download = `partycrm-finance-${suffix || 'all'}.csv`
    document.body.appendChild(link)
    link.click()
    link.remove()
    window.URL.revokeObjectURL(url)
  }, [activeCompanyId, financeExportFrom, financeExportTo])

  // Client actions
  const addClient = useCallback(
    async (clientPayload = clientDraft) => {
      setSaving(true)
      try {
        const response = await apiJson(
          '/api/party/clients',
          buildCompanyRequestOptions(activeCompanyId, {
            method: 'POST',
            body: JSON.stringify(clientPayload),
          })
        )
        if (response.data) {
          setClients((prev) => [...prev, response.data])
          setActiveModal('')
          setClientDraft(EMPTY_PARTY_CLIENT)
        }
      } finally {
        setSaving(false)
      }
    },
    [clientDraft, activeCompanyId]
  )

  const editClient = useCallback(
    async (clientPayload = clientDraft) => {
      if (!editingClientId) return
      setSaving(true)
      try {
        const response = await apiJson(
          `/api/party/clients/${editingClientId}`,
          buildCompanyRequestOptions(activeCompanyId, {
            method: 'PATCH',
            body: JSON.stringify(clientPayload),
          })
        )
        if (response.data) {
          setClients((prev) =>
            prev.map((c) =>
              String(c._id) === editingClientId ? response.data : c
            )
          )
          setActiveModal('')
          setEditingClientId('')
          setClientDraft(EMPTY_PARTY_CLIENT)
        }
      } finally {
        setSaving(false)
      }
    },
    [clientDraft, editingClientId, activeCompanyId]
  )

  const archiveClient = useCallback(
    async (clientId, skipConfirm = false) => {
      if (!clientId || !activeCompanyId) return
      const confirmed =
        skipConfirm ||
        window.confirm(
          'Переместить клиента в архив? История заказов, звонков и переписок сохранится.'
        )
      if (!confirmed) return

      await apiJson(
        `/api/party/clients/${clientId}`,
        buildCompanyRequestOptions(activeCompanyId, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'archived' }),
        })
      )
      setClients((prev) =>
        prev.filter((client) => String(client._id) !== String(clientId))
      )
    },
    [activeCompanyId]
  )

  const deleteClient = useCallback(
    async (clientId) => {
      if (!clientId || !activeCompanyId) return
      const confirmed = window.confirm(
        'Удалить карточку клиента без возможности восстановления? Это можно сделать только если нет связанных заказов, звонков и переписок.'
      )
      if (!confirmed) return

      try {
        await apiJson(
          `/api/party/clients/${clientId}`,
          buildCompanyRequestOptions(activeCompanyId, { method: 'DELETE' })
        )
        setClients((prev) =>
          prev.filter((client) => String(client._id) !== String(clientId))
        )
      } catch (deleteError) {
        if (deleteError.code !== 'partycrm_client_delete_blocked') {
          throw deleteError
        }
        const archiveConfirmed = window.confirm(
          'Удалить нельзя: у клиента есть связанные заказы, звонки или переписки. Переместить карточку в архив?'
        )
        if (archiveConfirmed) {
          await archiveClient(clientId, true)
        }
      }
    },
    [activeCompanyId, archiveClient]
  )

  const mergeSimilarClient = useCallback(
    async (sourceClient) => {
      if (!editingClientId || !sourceClient?._id || !activeCompanyId) return
      const confirmed = window.confirm(
        'Объединить клиентов? Найденная карточка будет архивирована, а заказы, звонки, транзакции и переписки перейдут к текущему клиенту.'
      )
      if (!confirmed) return

      const response = await apiJson(
        `/api/party/clients/${editingClientId}/merge`,
        buildCompanyRequestOptions(activeCompanyId, {
          method: 'POST',
          body: JSON.stringify({ sourceClientId: sourceClient._id }),
        })
      )
      if (response.data?.targetClient) {
        setClients((prev) =>
          prev.filter(
            (client) => String(client._id) !== String(sourceClient._id)
          )
        )
        setSimilarClients([])
        window.alert('Карточки клиентов объединены')
      }
    },
    [activeCompanyId, editingClientId]
  )

  const loadSimilarClients = useCallback(
    async (draft) => {
      if (!activeCompanyId || !canManage) {
        setSimilarClients([])
        return
      }
      const hasContact = [
        draft?.phone,
        draft?.whatsapp,
        draft?.viber,
        draft?.email,
        draft?.telegram,
        draft?.vk,
        draft?.instagram,
      ].some((value) => String(value || '').trim())
      if (!hasContact) {
        setSimilarClients([])
        return
      }

      try {
        const response = await apiJson(
          '/api/party/clients/similar',
          buildCompanyRequestOptions(activeCompanyId, {
            method: 'POST',
            body: JSON.stringify({
              ...draft,
              excludeClientId: editingClientId,
            }),
          })
        )
        setSimilarClients(response.data ?? [])
      } catch {
        setSimilarClients([])
      }
    },
    [activeCompanyId, canManage, editingClientId]
  )

  useEffect(() => {
    if (activeModal !== 'client' && activeModal !== 'client-edit') {
      setSimilarClients([])
      return
    }
    const timeoutId = window.setTimeout(() => {
      loadSimilarClients(clientDraft)
    }, 350)

    return () => window.clearTimeout(timeoutId)
  }, [activeModal, clientDraft, loadSimilarClients])

  // Staff actions
  const addStaff = useCallback(async () => {
    setSaving(true)
    try {
      const response = await apiJson(
        '/api/party/staff',
        buildCompanyRequestOptions(activeCompanyId, {
          method: 'POST',
          body: JSON.stringify(staffDraft),
        })
      )
      if (response.data) {
        setStaff((prev) => [...prev, response.data])
        setActiveModal('')
        setStaffDraft(EMPTY_STAFF)
      }
    } finally {
      setSaving(false)
    }
  }, [staffDraft, activeCompanyId])

  const editStaff = useCallback(async () => {
    if (!editingStaffId) return
    setSaving(true)
    try {
      const response = await apiJson(
        `/api/party/staff/${editingStaffId}`,
        buildCompanyRequestOptions(activeCompanyId, {
          method: 'PATCH',
          body: JSON.stringify(staffDraft),
        })
      )
      if (response.data) {
        setStaff((prev) => {
          let updated = prev.map((s) =>
            String(s._id) === editingStaffId ? response.data : s
          )
          // Если был понижен предыдущий владелец — обновить и его
          if (response.previousOwner) {
            updated = updated.map((s) =>
              String(s._id) === String(response.previousOwner._id)
                ? { ...s, role: response.previousOwner.role }
                : s
            )
          }
          return updated
        })
        setActiveModal('')
        setEditingStaffId('')
        setStaffDraft(EMPTY_STAFF)
      }
    } finally {
      setSaving(false)
    }
  }, [staffDraft, editingStaffId, activeCompanyId])

  const requestStaffLink = useCallback(
    async (staffMember) => {
      if (!staffMember?._id) return
      setLinkingStaffId(String(staffMember._id))
      setError('')
      try {
        const response = await apiJson(
          `/api/party/staff/${staffMember._id}/link-request`,
          buildCompanyRequestOptions(activeCompanyId, { method: 'POST' })
        )
        if (response.data) {
          setStaff((prev) =>
            prev.map((person) =>
              String(person._id) === String(staffMember._id)
                ? response.data
                : person
            )
          )
        }
      } catch (linkError) {
        setError(linkError.message || 'Не удалось отправить запрос привязки')
      } finally {
        setLinkingStaffId('')
      }
    },
    [activeCompanyId]
  )

  // Location actions
  const addLocation = useCallback(async () => {
    setSaving(true)
    try {
      const response = await apiJson(
        '/api/party/locations',
        buildCompanyRequestOptions(activeCompanyId, {
          method: 'POST',
          body: JSON.stringify(locationDraft),
        })
      )
      if (response.data) {
        setLocations((prev) => [...prev, response.data])
        setActiveModal('')
        setLocationDraft(EMPTY_LOCATION)
      }
    } finally {
      setSaving(false)
    }
  }, [locationDraft, activeCompanyId])

  const editLocation = useCallback(async () => {
    if (!editingLocationId) return
    setSaving(true)
    try {
      const response = await apiJson(
        `/api/party/locations/${editingLocationId}`,
        buildCompanyRequestOptions(activeCompanyId, {
          method: 'PATCH',
          body: JSON.stringify(locationDraft),
        })
      )
      if (response.data) {
        setLocations((prev) =>
          prev.map((l) =>
            String(l._id) === editingLocationId ? response.data : l
          )
        )
        setActiveModal('')
        setEditingLocationId('')
        setLocationDraft(EMPTY_LOCATION)
      }
    } finally {
      setSaving(false)
    }
  }, [locationDraft, editingLocationId, activeCompanyId])

  // Service actions
  const addService = useCallback(async () => {
    setServiceSaving(true)
    try {
      const response = await apiJson(
        '/api/party/services',
        buildCompanyRequestOptions(activeCompanyId, {
          method: 'POST',
          body: JSON.stringify(serviceDraft),
        })
      )
      if (response.data) {
        setServices((prev) => [...prev, response.data])
        setActiveModal('')
        setServiceDraft(EMPTY_PARTY_SERVICE)
      }
    } finally {
      setServiceSaving(false)
    }
  }, [serviceDraft, activeCompanyId])

  const editService = useCallback(async () => {
    if (!editingServiceId) return
    setServiceSaving(true)
    try {
      const response = await apiJson(
        `/api/party/services/${editingServiceId}`,
        buildCompanyRequestOptions(activeCompanyId, {
          method: 'PATCH',
          body: JSON.stringify(serviceDraft),
        })
      )
      if (response.data) {
        setServices((prev) =>
          prev.map((s) =>
            String(s._id) === editingServiceId ? response.data : s
          )
        )
        setActiveModal('')
        setEditingServiceId('')
        setServiceDraft(EMPTY_PARTY_SERVICE)
      }
    } finally {
      setServiceSaving(false)
    }
  }, [serviceDraft, editingServiceId, activeCompanyId])

  const deleteService = useCallback(
    async (serviceId) => {
      if (!window.confirm('Вы уверены, что хотите удалить эту услугу?')) return
      setSaving(true)
      try {
        await apiJson(
          `/api/party/services/${serviceId}`,
          buildCompanyRequestOptions(activeCompanyId, {
            method: 'DELETE',
          })
        )
        setServices((prev) =>
          prev.filter((s) => String(s._id) !== String(serviceId))
        )
      } finally {
        setSaving(false)
      }
    },
    [activeCompanyId]
  )

  const deleteStaff = useCallback(
    async (staffId) => {
      setSaving(true)
      try {
        await apiJson(
          `/api/party/staff/${staffId}`,
          buildCompanyRequestOptions(activeCompanyId, {
            method: 'DELETE',
          })
        )
        setStaff((prev) =>
          prev.filter((s) => String(s._id) !== String(staffId))
        )
      } finally {
        setSaving(false)
      }
    },
    [activeCompanyId]
  )

  if (accessStatus === 'loading') {
    return (
      <section className="h-full min-h-full bg-white">
        <div className="flex h-64 items-center justify-center">
          <p className="text-gray-500">Загрузка...</p>
        </div>
      </section>
    )
  }

  if (accessStatus === 'unauthenticated') {
    return (
      <section className="h-full min-h-full bg-white">
        <div className="flex h-64 items-center justify-center">
          <p className="text-gray-500">Необходимо авторизоваться</p>
        </div>
      </section>
    )
  }

  if (accessStatus === 'not_configured') {
    return (
      <section className="h-full min-h-full bg-white">
        <div className="flex h-64 items-center justify-center">
          <p className="text-gray-500">Нет доступных компаний</p>
        </div>
      </section>
    )
  }

  if (accessStatus === 'error') {
    return (
      <section className="h-full min-h-full bg-white">
        <div className="flex h-64 items-center justify-center">
          <p className="text-red-500">{error || 'Ошибка загрузки'}</p>
        </div>
      </section>
    )
  }

  return (
    <section className="h-full min-h-full bg-white">
      {/* Main content */}
      <main className="mx-auto max-w-6xl px-5 py-8">
        {memberships.length > 1 && (
          <div className="mb-6 flex flex-col gap-2 rounded-lg border border-sky-100 bg-sky-50 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-sky-700 uppercase">
                Активная компания
              </p>
              {context?.staff?.isDeveloperAccess ? (
                <p className="mt-1 text-xs text-slate-500">
                  Режим разработчика: доступ как владелец компании
                </p>
              ) : null}
            </div>
            <select
              value={activeCompanyId}
              onChange={(event) => switchCompany(event.target.value)}
              className="min-h-10 w-full cursor-pointer rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-sky-500 sm:w-80"
            >
              {memberships.map((membership) => (
                <option key={membership.tenantId} value={membership.tenantId}>
                  {membership.company?.title || 'Компания без названия'}
                  {membership.isDeveloperAccess ? ' · dev' : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {error && (
          <div className="border-danger/30 bg-danger/10 text-danger mb-5 rounded-md border p-3 text-sm">
            {error}
          </div>
        )}

        {section === 'overview' && (
          <>
            {!onboardingProgress.finished && (
              <div className="mb-6 rounded-2xl border border-sky-100 bg-white p-5">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">
                      Первые шаги компании
                    </h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {onboardingProgress.completedCount} из{' '}
                      {onboardingProgress.totalCount} выполнено
                    </p>
                  </div>
                  <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700">
                    Стартовая настройка
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {onboardingSteps.map((step) => (
                    <div
                      key={step.id}
                      className={`rounded-xl border p-4 ${
                        step.completed
                          ? 'border-emerald-100 bg-emerald-50'
                          : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">
                            {step.title}
                          </div>
                          <p className="mt-1 text-xs leading-5 text-slate-500">
                            {step.description}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            step.completed
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-white text-slate-500'
                          }`}
                        >
                          {step.completed ? 'Готово' : 'Нужно'}
                        </span>
                      </div>
                      {!step.completed && canManage && (
                        <button
                          type="button"
                          className="mt-3 rounded-md bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                          onClick={() => {
                            if (step.modal === 'order') {
                              setOrderDraft(
                                createEmptyOrderDraft(
                                  companySettings,
                                  locations
                                )
                              )
                            }
                            if (step.modal === 'location') {
                              setLocationDraft(EMPTY_LOCATION)
                            }
                            if (step.modal === 'service') {
                              setServiceDraft(EMPTY_PARTY_SERVICE)
                            }
                            if (step.modal === 'staff') {
                              setStaffDraft(EMPTY_STAFF)
                            }
                            setActiveModal(step.modal)
                          }}
                        >
                          {step.action}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Finance summary */}
            {canUseStatistics ? (
              <div className="mb-6 rounded-2xl bg-sky-50 p-4">
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div>
                    <p className="text-sm text-gray-600">Заказов</p>
                    <p className="text-2xl font-bold">
                      {financeSummary.orderCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Договоры</p>
                    <p className="text-2xl font-bold">
                      {formatMoney(financeSummary.contractAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Получено</p>
                    <p className="text-2xl font-bold">
                      {formatMoney(financeSummary.incomeAmount)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Выплаты</p>
                    <p className="text-2xl font-bold">
                      {formatMoney(financeSummary.payoutAmount)}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </>
        )}

        {(section === 'orders' || section === 'orders-past') && (
          <>
            {/* Header with filters and actions (orders/past) */}
            <div className="mb-4 md:mb-6">
              <div className="flex flex-col gap-2">
                {/* Top row: title + actions */}
                <div className="flex flex-col items-center gap-2">
                  <h2 className="text-xl font-semibold">
                    {section === 'orders-past'
                      ? 'Прошедшие заказы'
                      : 'Предстоящие заказы'}
                  </h2>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <OrderFilterDropdown
                      orderFilters={orderFilters}
                      orderFilter={orderFilter}
                      setOrderFilter={setOrderFilter}
                    />
                    <button
                      type="button"
                      className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-md border border-sky-100 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-sky-200 hover:bg-sky-50"
                      onClick={() =>
                        setOrderViewMode((current) =>
                          current === 'list' ? 'month' : 'list'
                        )
                      }
                      title={
                        orderViewMode === 'list'
                          ? 'Показать календарь'
                          : 'Показать список'
                      }
                    >
                      <FontAwesomeIcon
                        icon={orderViewMode === 'list' ? faCalendarAlt : faList}
                        className="h-4 w-4 text-sky-600"
                      />
                      {/* {orderViewMode === 'list' ? 'Календарь' : 'Список'} */}
                    </button>
                    {section !== 'orders-past' && (
                      <button
                        type="button"
                        onClick={() => setActiveModal('upcoming-events')}
                        className="cursor-pointer rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-100"
                      >
                        Ближайшие
                      </button>
                    )}
                    {section !== 'orders-past' && closePastCount > 0 && (
                      <button
                        type="button"
                        onClick={closePastOrders}
                        className="cursor-pointer rounded-md border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-700 transition hover:bg-sky-50"
                      >
                        Закрыть прошедшие
                        <span className="ml-2 text-sky-400">
                          {closePastCount}
                        </span>
                      </button>
                    )}
                    {canManage && (
                      <button
                        type="button"
                        className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                        onClick={() => {
                          setOrderDraft(
                            createEmptyOrderDraft(companySettings, locations)
                          )
                          setActiveModal('order')
                        }}
                      >
                        + Новый заказ
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {orderViewMode === 'list' ? (
              <OrdersList
                orders={filteredOrders}
                filteredOrders={filteredOrders}
                clients={clients}
                clientsById={clientsById}
                staff={staff}
                locations={locations}
                hasOrderConflict={hasOrderConflict}
                canManage={canManage}
                onView={(order) => {
                  setOrderDraft(normalizeOrderDraft(order))
                  setEditingOrderId(order._id)
                  setActiveModal('order-view')
                }}
                onEdit={(order) => {
                  setOrderDraft(normalizeOrderDraft(order))
                  setEditingOrderId(order._id)
                  setActiveModal('order-edit')
                }}
                onAdditionalEvents={(order) => {
                  setOrderDraft(normalizeOrderDraft(order))
                  setEditingOrderId(order._id)
                  setActiveModal('order-additional-events')
                }}
                onCancel={cancelOrder}
                onStatusChange={changeOrderStatus}
                onDelete={deleteOrder}
              />
            ) : (
              <PartyOrdersCalendar
                orders={filteredOrders}
                locations={locations}
                onView={(order) => {
                  setOrderDraft(normalizeOrderDraft(order))
                  setEditingOrderId(order._id)
                  setActiveModal('order-view')
                }}
              />
            )}
          </>
        )}

        {section === 'calls' && (
          <>
            <div className="mb-6 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Звонки Novofon</h2>
                <p className="mt-1 text-sm text-slate-500">
                  Проверяйте AI-черновики заказов перед созданием событий.
                </p>
              </div>
              <span className="text-sm text-black/55">{calls.length}</span>
            </div>
            {companyAccess?.allowTelephony === false ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-900">
                Телефония недоступна на текущем тарифе компании. Подключите
                тариф с опцией телефонии во вкладке `Тарифы`.
              </div>
            ) : (
              <CallsList
                calls={calls}
                clientsById={clientsById}
                canManage={canManage}
                creatingCallId={creatingCallOrderId}
                onCreateOrder={createOrderFromCall}
              />
            )}
          </>
        )}

        {section === 'clients' && (
          <>
            <div className="mb-6 flex justify-end">
              <button
                type="button"
                className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                onClick={() => {
                  setClientDraft(EMPTY_PARTY_CLIENT)
                  setEditingClientId('')
                  setSimilarClients([])
                  setActiveModal('client')
                }}
              >
                Новый клиент
              </button>
            </div>
            <ClientsList
              clients={clients}
              canManage={canManage}
              onDelete={deleteClient}
              onCreateClick={() => {
                setClientDraft(EMPTY_PARTY_CLIENT)
                setEditingClientId('')
                setSimilarClients([])
                setActiveModal('client')
              }}
              clientsCount={clients.length}
              onView={(client) => {
                setClientDraft(client)
                setEditingClientId(client._id)
                setSimilarClients([])
                setActiveModal('client-view')
              }}
              onEdit={(client) => {
                setClientDraft(client)
                setEditingClientId(client._id)
                setSimilarClients([])
                setActiveModal('client-edit')
              }}
            />
          </>
        )}

        {section === 'finance' && !canUseStatistics && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-900">
            Финансы и аналитика недоступны на текущем тарифе компании.
            Подключите тариф с опцией статистики во вкладке `Тарифы`.
          </div>
        )}

        {section === 'finance' && canUseStatistics && (
          <div className="rounded-2xl bg-sky-50 p-6">
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <h2 className="text-xl font-semibold">Финансы</h2>
              <div className="flex flex-wrap items-end gap-2">
                <label className="grid gap-1 text-xs font-semibold text-slate-600">
                  С
                  <input
                    type="date"
                    value={financeExportFrom}
                    onChange={(event) =>
                      setFinanceExportFrom(event.target.value)
                    }
                    className="rounded-md border border-sky-100 bg-white px-2 py-2 text-sm font-normal text-slate-900 outline-none focus:border-sky-400"
                  />
                </label>
                <label className="grid gap-1 text-xs font-semibold text-slate-600">
                  По
                  <input
                    type="date"
                    value={financeExportTo}
                    onChange={(event) => setFinanceExportTo(event.target.value)}
                    className="rounded-md border border-sky-100 bg-white px-2 py-2 text-sm font-normal text-slate-900 outline-none focus:border-sky-400"
                  />
                </label>
                <button
                  type="button"
                  className="rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                  onClick={downloadFinanceCsv}
                >
                  Скачать CSV
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
              <div>
                <p className="text-sm text-gray-600">Заказов</p>
                <p className="text-2xl font-bold">
                  {financeSummary.orderCount}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Договорная сумма</p>
                <p className="text-2xl font-bold">
                  {formatMoney(financeSummary.contractAmount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Доходы</p>
                <p className="text-2xl font-bold">
                  {formatMoney(financeSummary.incomeAmount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Остаток по договорам</p>
                <p className="text-2xl font-bold">
                  {formatMoney(financeSummary.balanceAmount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Расходы</p>
                <p className="text-2xl font-bold">
                  {formatMoney(financeSummary.expenseAmount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Выплаты сотрудникам</p>
                <p className="text-2xl font-bold">
                  {formatMoney(financeSummary.payoutAmount)}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Маржа</p>
                <p className="text-2xl font-bold">
                  {formatMoney(financeSummary.grossMargin)}
                </p>
              </div>
            </div>
          </div>
        )}

        {section === 'locations' && (
          <>
            <div className="mb-6 flex justify-end">
              <button
                type="button"
                className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                onClick={() => {
                  setLocationDraft(EMPTY_LOCATION)
                  setActiveModal('location')
                }}
              >
                Новая точка
              </button>
            </div>
            <LocationsList
              locations={locations}
              archivedLocations={archivedLocations}
              onEdit={(location) => {
                setLocationDraft(location)
                setEditingLocationId(location._id)
                setActiveModal('location-edit')
              }}
            />
          </>
        )}

        {section === 'staff' && (
          <>
            <div className="mb-6 flex justify-end">
              <button
                type="button"
                className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                onClick={() => {
                  setStaffDraft(EMPTY_STAFF)
                  setActiveModal('staff')
                }}
              >
                Новый сотрудник
              </button>
            </div>
            <StaffList
              staff={staff}
              canManage={canManage}
              linkingStaffId={linkingStaffId}
              activeCompanyId={activeCompanyId}
              onRequestLink={requestStaffLink}
              onEdit={(staffMember) => {
                setStaffDraft(staffMember)
                setEditingStaffId(staffMember._id)
                setActiveModal('staff-edit')
              }}
              onDelete={deleteStaff}
            />
          </>
        )}

        {section === 'services' && (
          <>
            <div className="mb-6 flex justify-end">
              <button
                type="button"
                className="cursor-pointer rounded bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                onClick={() => {
                  setServiceDraft(EMPTY_PARTY_SERVICE)
                  setActiveModal('service')
                }}
              >
                Новая услуга
              </button>
            </div>
            <ServicesList
              services={services}
              canManage={canManage}
              onEdit={(service) => {
                setServiceDraft(service)
                setEditingServiceId(service._id)
                setActiveModal('service-edit')
              }}
              onDelete={deleteService}
            />
          </>
        )}
      </main>

      {/* Modals */}
      {activeModal === 'upcoming-events' && (
        <PartyUpcomingEventsModal
          open={true}
          orders={orders}
          saving={saving}
          onClose={() => setActiveModal('')}
          onOpenOrder={(order) => {
            setOrderDraft(normalizeOrderDraft(order))
            setEditingOrderId(order._id)
            setActiveModal('order-view')
          }}
          onUpdateOrder={updateOrder}
        />
      )}

      {activeModal === 'order-view' && (
        <OrderViewModal
          open={true}
          order={orderDraft}
          locations={locations}
          staff={staff}
          clientsById={clientsById}
          services={services}
          canManage={canManage}
          onClose={() => {
            setActiveModal('')
            setEditingOrderId('')
          }}
          onEdit={() => setActiveModal('order-edit')}
          onReviewReport={reviewPerformerReport}
          onUpdateOrder={(nextOrder) =>
            updateOrder(nextOrder).then((updatedOrder) => {
              if (updatedOrder) setOrderDraft(normalizeOrderDraft(updatedOrder))
              return updatedOrder
            })
          }
        />
      )}

      {activeModal === 'order-additional-events' && (
        <OrderAdditionalEventsModal
          open={true}
          order={orderDraft}
          canManage={canManage}
          saving={saving}
          onClose={() => {
            setActiveModal('')
            setEditingOrderId('')
          }}
          onUpdateOrder={(nextOrder) =>
            updateOrder(nextOrder).then((updatedOrder) => {
              if (updatedOrder) setOrderDraft(normalizeOrderDraft(updatedOrder))
              return updatedOrder
            })
          }
        />
      )}

      {activeModal === 'order' && (
        <OrderModal
          open={true}
          orderDraft={orderDraft}
          setOrderDraft={setOrderDraft}
          locations={locations}
          staff={staff}
          clients={clients}
          clientsById={clientsById}
          services={services}
          companySettings={companySettings}
          activeCompanyId={activeCompanyId}
          canManage={canManage}
          saving={saving}
          onClose={() => setActiveModal('')}
          onSubmit={orderDraft._id ? editOrder : addOrder}
          isEdit={Boolean(orderDraft._id)}
          onCompanySettingsChange={setCompanySettings}
          onServiceCreated={(newService) =>
            setServices((prev) => [...prev, newService])
          }
          onClientCreated={(newClient) =>
            setClients((prev) => [...prev, newClient])
          }
          onLocationCreated={(newLocation) =>
            setLocations((prev) => [...prev, newLocation])
          }
        />
      )}

      {activeModal === 'order-edit' && (
        <OrderModal
          open={true}
          title="Редактировать заказ"
          orderDraft={orderDraft}
          setOrderDraft={setOrderDraft}
          locations={locations}
          staff={staff}
          clients={clients}
          clientsById={clientsById}
          services={services}
          companySettings={companySettings}
          activeCompanyId={activeCompanyId}
          canManage={canManage}
          saving={saving}
          onClose={() => {
            setActiveModal('')
            setEditingOrderId('')
          }}
          onSubmit={editOrder}
          onCompanySettingsChange={setCompanySettings}
          onServiceCreated={(newService) =>
            setServices((prev) => [...prev, newService])
          }
          onClientCreated={(newClient) =>
            setClients((prev) => [...prev, newClient])
          }
          onLocationCreated={(newLocation) =>
            setLocations((prev) => [...prev, newLocation])
          }
          isEdit
        />
      )}

      {activeModal === 'staff' && (
        <StaffModal
          open={true}
          staffDraft={staffDraft}
          setStaffDraft={setStaffDraft}
          saving={saving}
          onClose={() => setActiveModal('')}
          onSubmit={addStaff}
          contextRole={context?.role}
        />
      )}

      {activeModal === 'staff-edit' && (
        <StaffModal
          open={true}
          title="Редактировать сотрудника"
          staffDraft={staffDraft}
          setStaffDraft={setStaffDraft}
          saving={saving}
          onClose={() => {
            setActiveModal('')
            setEditingStaffId('')
          }}
          onSubmit={editStaff}
          isEdit
          contextRole={context?.role}
        />
      )}

      {(activeModal === 'location' || activeModal === 'location-edit') && (
        <LocationModal
          open={true}
          title={
            activeModal === 'location-edit'
              ? 'Редактировать точку'
              : 'Новая точка'
          }
          locationDraft={locationDraft}
          setLocationDraft={setLocationDraft}
          saving={saving}
          onClose={() => {
            setActiveModal('')
            setEditingLocationId('')
          }}
          onSubmit={
            activeModal === 'location-edit' ? editLocation : addLocation
          }
          isEdit={activeModal === 'location-edit'}
        />
      )}

      {activeModal === 'client-view' && (
        <ClientViewModal
          open={true}
          client={clientDraft}
          canManage={canManage}
          onClose={() => {
            setActiveModal('')
            setEditingClientId('')
            setClientDraft(EMPTY_PARTY_CLIENT)
          }}
          onEdit={(client) => {
            setClientDraft(client)
            setEditingClientId(client._id)
            setSimilarClients([])
            setActiveModal('client-edit')
          }}
        />
      )}

      {(activeModal === 'client' || activeModal === 'client-edit') && (
        <ClientFormModal
          open={true}
          title={
            activeModal === 'client-edit'
              ? 'Редактировать клиента'
              : 'Новый клиент'
          }
          clientDraft={clientDraft}
          setClientDraft={setClientDraft}
          saving={saving}
          onClose={() => {
            setActiveModal('')
            setEditingClientId('')
            setSimilarClients([])
          }}
          onSubmit={activeModal === 'client-edit' ? editClient : addClient}
          activeCompanyId={activeCompanyId}
          companySettings={companySettings}
          onCompanySettingsChange={setCompanySettings}
          canManage={canManage}
          similarClients={similarClients}
          onSimilarClientSelect={(client) => {
            setClientDraft(client)
            setEditingClientId(client._id)
            setSimilarClients([])
            setActiveModal('client-edit')
          }}
          onMergeSimilarClient={mergeSimilarClient}
        />
      )}

      {(activeModal === 'service' || activeModal === 'service-edit') && (
        <ServiceCreateModal
          open={true}
          title={
            activeModal === 'service-edit'
              ? 'Редактировать услугу'
              : 'Новая услуга'
          }
          serviceDraft={serviceDraft}
          setServiceDraft={setServiceDraft}
          saving={serviceSaving}
          activeCompanyId={activeCompanyId}
          onClose={() => {
            setActiveModal('')
            setEditingServiceId('')
          }}
          onSubmit={activeModal === 'service-edit' ? editService : addService}
        />
      )}
    </section>
  )
}
