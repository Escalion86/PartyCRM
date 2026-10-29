'use client'

import dynamic from 'next/dynamic'
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { apiJson } from '@helpers/apiClient'
import usePartyUnsavedChanges, {
  requestPartyLeave,
} from '@components/party/navigation/usePartyUnsavedChanges'
import { formatPhoneNumber, normalizePhoneNumber } from '@helpers/phoneInput'
import {
  PARTY_ACTIVE_COMPANY_EVENT,
  PARTY_ACTIVE_COMPANY_STORAGE_KEY,
  readPartyActiveCompanyId,
  publishPartyActiveCompanyId,
} from '@helpers/partyActiveCompany'
import {
  canPartyAccess,
  isPartyRestrictedManagementContext,
} from '@helpers/partyRolePermissions'
import {
  DEFAULT_PARTY_WORKFLOW,
  findPartyWorkflowTransition,
  getPartyOrderStage,
} from '@helpers/partyWorkflow'
import {
  buildPartyRoleOrderPatch,
  createPartyRoleOrderDraft,
  partyOrderDateInput,
  PARTY_ROLE_ORDER_FIELD_RESOURCES,
} from '@helpers/partyRoleOrderForm'
import {
  PartyOrderContactRolesEditor,
  PartyOrderContactRolesView,
} from './PartyOrderContactRoles'
import { PartyEventBriefEditor, PartyEventBriefView } from './PartyEventBrief'
import PartyRoleOrderClientEditor from './PartyRoleOrderClientEditor'
import PartyRoleNewClient from './PartyRoleNewClient'
import PartyRoleOrderPayments from './PartyRoleOrderPayments'
import PartyOrderFulfillment from './PartyOrderFulfillment'
import usePartyOrderCalendar from './usePartyOrderCalendar'
import usePartyOrderList from './usePartyOrderList'
import usePartyOrderBoard from './usePartyOrderBoard'
import {
  getPartyOrderBoardStages,
  getPartyOrderBoardTransitions,
  resolvePartyOrderDeepLink,
} from '@helpers/partyOrderBoard'
import {
  readPartyOrderViewPreference,
  writePartyOrderViewPreference,
} from '@helpers/partyOrderViewPreference'
import { canPartyResourceCalendarAccess } from '@helpers/partyResourceCalendar'

const PartyRoleOrdersCalendar = dynamic(
  () => import('./PartyRoleOrdersCalendar')
)
const PartyRoleOrdersBoard = dynamic(() => import('./PartyRoleOrdersBoard'))

const PartyTasks = dynamic(() => import('@components/party/tasks/PartyTasks'))
const PartyPreparationTemplateApply = dynamic(() => import('@components/party/preparation/PartyPreparationTemplateApply'))
const PartyOrderReports = dynamic(
  () => import('@components/party/reports/PartyOrderReports')
)
const OrderInventoryPanel = dynamic(
  () => import('@components/party/inventory/OrderInventoryPanel')
)
const InventoryMovementsPanel = dynamic(
  () => import('@components/party/inventory/InventoryMovementsPanel')
)
const PartyOrderPreparationPanel = dynamic(
  () => import('./PartyOrderPreparationPanel')
)
const control =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-600'
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 transition hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50'
const statuses = {
  draft: 'Заявка',
  active: 'Подтверждён',
  canceled: 'Отменён',
  closed: 'Закрыт',
}
const emptyOptions = {
  clients: [],
  staff: [],
  services: [],
  locations: [],
  context: null,
}
const money = (value) => Number(value || 0).toLocaleString('ru-RU') + ' ₽'
const dateText = (value) =>
  value && Number.isFinite(+new Date(value))
    ? new Date(value).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Дата не указана'
const nameOf = (person) =>
  person?.name ||
  [person?.firstName, person?.secondName].filter(Boolean).join(' ') ||
  'Сотрудник'

function OrderField({ label, children }) {
  return (
    <label className="block min-w-0 text-sm font-medium text-slate-700">
      {label}
      {children}
    </label>
  )
}

function RoleOrderEditor({
  companyId,
  order,
  options,
  workflow,
  onSaved,
  onClose,
  onDirtyChange,
  legacyAdvancedPath,
}) {
  const context = options.context
  const existing = Boolean(order._id)
  const [draft, setDraft] = useState(() => createPartyRoleOrderDraft(order))
  const [tab, setTab] = useState('main')
  const [visited, setVisited] = useState(['main'])
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [reportDirty, setReportDirty] = useState({})
  const [taskDirty, setTaskDirty] = useState(false)
  const [tasksRefreshKey, setTasksRefreshKey] = useState(0)
  const [newClientDirty, setNewClientDirty] = useState(false)
  const [createdClients, setCreatedClients] = useState([])
  const [initialPayment, setInitialPayment] = useState({
    amount: '',
    paymentMethod: 'transfer',
  })
  const [initialPaymentInvalid, setInitialPaymentInvalid] = useState(false)
  const initialPaymentInput = useRef(null)
  const [contractAmountInvalid, setContractAmountInvalid] = useState(false)
  const contractAmountInput = useRef(null)
  const [unresolvedCreate, setUnresolvedCreate] = useState(false)
  const createAttempt = useRef(null)
  const saving = useRef(false)
  const childDirty =
    taskDirty || newClientDirty || Object.values(reportDirty).some(Boolean)
  const clientOptions = [
    ...options.clients,
    ...createdClients.filter(
      (client) =>
        !options.clients.some(
          (existingClient) => String(existingClient._id) === String(client._id)
        )
    ),
  ]
  const tabId = useId()
  const can = (resource, action = 'read') =>
    canPartyAccess(context, { resource, action })
  const editable = (field) =>
    !unresolvedCreate &&
    !reportDirty.client &&
    !reportDirty.payments &&
    !['closed', 'canceled'].includes(order.status) &&
    can(PARTY_ROLE_ORDER_FIELD_RESOURCES[field], 'edit')
  const visible = (field) =>
    can(PARTY_ROLE_ORDER_FIELD_RESOURCES[field]) &&
    (!existing || Object.hasOwn(order, field))
  const change = (field, value) => {
    setDraft((previous) => ({ ...previous, [field]: value }))
    setError('')
  }
  const changes = buildPartyRoleOrderPatch({ order, draft, context })
  const initialPaymentDirty =
    !existing && (initialPayment.amount !== '' || initialPaymentInvalid)
  const dirty =
    changes.dirty ||
    contractAmountInvalid ||
    childDirty ||
    initialPaymentDirty ||
    unresolvedCreate
  usePartyUnsavedChanges(dirty, {
    label: 'заказ',
    scope: companyId,
    pending: busy,
  })
  const dirtyReport = useCallback(
    (id, value) =>
      setReportDirty((previous) =>
        previous[id] === value ? previous : { ...previous, [id]: value }
      ),
    []
  )
  const dirtyTask = useCallback((value) => setTaskDirty(value), [])
  const templatePending = useCallback((value) => setReportDirty((previous) => previous.template === value ? previous : { ...previous, template: value }), [])
  const dirtyClient = useCallback(
    (value) =>
      setReportDirty((previous) =>
        previous.client === value ? previous : { ...previous, client: value }
      ),
    []
  )
  const dirtyInventory = useCallback(
    (value) =>
      setReportDirty((previous) =>
        previous.inventory === value
          ? previous
          : { ...previous, inventory: value }
      ),
    []
  )
  const dirtyPayments = useCallback(
    (value) =>
      setReportDirty((previous) =>
        previous.payments === value
          ? previous
          : { ...previous, payments: value }
      ),
    []
  )
  const dirtyPreparation = useCallback(
    (value) =>
      setReportDirty((previous) =>
        previous.preparation === value
          ? previous
          : { ...previous, preparation: value }
      ),
    []
  )
  useEffect(() => {
    onDirtyChange(dirty)
    return () => onDirtyChange(false)
  }, [dirty, onDirtyChange])
  const save = async () => {
    if (busy || saving.current) return
    if (childDirty) {
      setError('Сначала сохраните или отмените изменения во вложенном разделе.')
      return
    }
    if (changes.forbiddenFields.length) {
      setError(
        'Права на некоторые изменённые поля недоступны. Обновите заказ и проверьте изменения.'
      )
      return
    }
    if (
      !unresolvedCreate &&
      (contractAmountInvalid ||
        (Object.hasOwn(changes.patch, 'contractAmount') &&
          contractAmountInput.current?.validity.valid === false))
    ) {
      setError(
        'Укажите неотрицательную стоимость с точностью до копеек или очистите поле.'
      )
      return
    }
    if (!changes.dirty && !initialPaymentDirty && !unresolvedCreate) return
    let requestBody = {
      ...changes.patch,
      ...(existing
        ? { commercialRevision: order.commercialRevision || 0 }
        : {}),
      ...(initialPaymentDirty ? { initialPayment } : {}),
    }
    if (
      initialPaymentDirty &&
      !unresolvedCreate &&
      (initialPaymentInput.current?.validity.valid === false ||
        !Number.isFinite(Number(initialPayment.amount)) ||
        Number(initialPayment.amount) <= 0)
    ) {
      setError(
        'Укажите положительную сумму полученного аванса с точностью до копеек или очистите поле.'
      )
      return
    }
    if (!existing && initialPaymentDirty && !createAttempt.current)
      createAttempt.current = { key: crypto.randomUUID(), body: requestBody }
    if (unresolvedCreate) requestBody = createAttempt.current.body
    saving.current = true
    setBusy(true)
    setError('')
    try {
      const result = await apiJson(
        existing ? `/api/party/orders/${order._id}` : '/api/party/orders',
        {
          method: existing ? 'PATCH' : 'POST',
          headers: {
            'x-partycrm-company-id': companyId,
            ...(!existing && createAttempt.current
              ? { 'Idempotency-Key': createAttempt.current.key }
              : {}),
          },
          body: JSON.stringify(requestBody),
        }
      )
      onSaved(result.data, result.accessChanged || !result.data)
    } catch (cause) {
      const knownAbort = ['partycrm_initial_payment_transaction_required', 'partycrm_venue_transaction_required', 'partycrm_venue_topology_unavailable', 'partycrm_venue_lock_required'].includes(cause.payload?.error?.code)
      if (
        !existing &&
        createAttempt.current &&
        !knownAbort &&
        (!cause.status || cause.status >= 500)
      )
        setUnresolvedCreate(true)
      else if (!unresolvedCreate) createAttempt.current = null
      setError(cause.message || 'Не удалось сохранить заказ')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }
  const transition = async (stageId) => {
    if (busy || dirty) return
    setBusy(true)
    setError('')
    try {
      const result = await apiJson(`/api/party/orders/${order._id}/stage`, {
        method: 'PATCH',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify({
          toStageId: stageId,
          expectedUpdatedAt: new Date(order.updatedAt).toISOString(),
        }),
      })
      onSaved(result.data, result.accessChanged || !result.data)
    } catch (cause) {
      setError(cause.message || 'Не удалось передать заказ')
    } finally {
      setBusy(false)
    }
  }
  const tabs = [
    { id: 'main', title: 'Основное', show: true },
    { id: 'brief', title: 'Бриф', show: visible('eventBrief') },
    {
      id: 'contacts',
      title: 'Контакты',
      show: visible('contactRoles') || visible('otherContacts'),
    },
    { id: 'team', title: 'Команда', show: visible('assignedStaff') },
    { id: 'inventory', title: 'Реквизит', show: existing && can('inventory') },
    {
      id: 'preparation',
      title: 'Подготовка',
      show: existing && can('orders.preparation'),
    },
    {
      id: 'finance',
      title: 'Финансы',
      show:
        visible('contractAmount') ||
        can('finance.payments') ||
        can('finance.expenses') ||
        can('finance.payouts'),
    },
    { id: 'tasks', title: 'Задачи', show: existing && can('tasks') },
    { id: 'reports', title: 'Отчёты', show: existing && can('reports') },
  ].filter((item) => item.show)
  const chooseTab = (id) => {
    if (reportDirty.template) return
    setTab(id)
    requestAnimationFrame(() =>
      document
        .getElementById(tabId + '-tab-' + id)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    )
    setVisited((previous) =>
      previous.includes(id) ? previous : [...previous, id]
    )
  }
  const clientsById = new Map(
    clientOptions.map((client) => [String(client._id), client])
  )
  const client = clientsById.get(String(draft.clientId || order.clientId || ''))
  const displayClient =
    draft.clientId && String(draft.clientId) !== String(order.clientId || '')
      ? client
      : { ...client, ...order.client }
  const assignments = draft.assignedStaff || []
  const patchAssignment = (index, patch) =>
    change(
      'assignedStaff',
      assignments.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item
      )
    )
  const currentStage = getPartyOrderStage(order, workflow)
  const nextStages =
    existing &&
    !['closed', 'canceled'].includes(order.status) &&
    can('orders', 'transition')
      ? workflow.stages.filter((stage) =>
          findPartyWorkflowTransition({
            workflow,
            order,
            toStageId: stage.id,
            context,
          })
        )
      : []
  const textField = (field, label, type = 'text') =>
    visible(field) ? (
      <OrderField label={label} key={field}>
        <input
          {...(field === 'contractAmount'
            ? {
                ref: contractAmountInput,
                min: 0,
                step: 0.01,
                inputMode: 'decimal',
                'aria-invalid': contractAmountInvalid || undefined,
                onInput: (event) => {
                  contractAmountInput.current = event.currentTarget
                  setContractAmountInvalid(!event.currentTarget.validity.valid)
                  setError('')
                },
              }
            : {})}
          aria-label={label}
          type={type}
          disabled={busy || !editable(field)}
          className={control}
          value={
            type === 'datetime-local'
              ? partyOrderDateInput(draft[field])
              : (draft[field] ?? '')
          }
          onChange={(event) => change(field, event.target.value)}
        />
      </OrderField>
    ) : null
  const clientPicker = visible('clientId') ? (
    <OrderField label="Клиент">
      <select
        aria-label="Клиент"
        disabled={busy || !editable('clientId')}
        className={control + ' cursor-pointer'}
        value={draft.clientId || ''}
        onChange={(event) => change('clientId', event.target.value || null)}
      >
        <option value="">Выберите клиента</option>
        {draft.clientId && !clientsById.has(String(draft.clientId)) ? (
          <option value={draft.clientId}>
            {order.client?.name || 'Выбранный клиент'}
          </option>
        ) : null}
        {clientOptions.map((person) => (
          <option key={person._id} value={person._id}>
            {person.name || 'Контакт'}
          </option>
        ))}
      </select>
    </OrderField>
  ) : null

  return (
    <section
      className="min-w-0 rounded-2xl border border-sky-100 bg-white"
      aria-label={existing ? 'Заказ' : 'Новый заказ'}
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-3 sm:p-4">
        <div className="min-w-0">
          <h2
            id={`party-role-editor-heading-${companyId}`}
            tabIndex={-1}
            className="rounded text-lg font-bold break-words text-sky-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
          >
            {existing ? order.title || 'Заказ' : 'Новый заказ'}
          </h2>
          {existing &&
          can('orders.status') &&
          Object.hasOwn(order, 'status') ? (
            <p className="mt-1 text-xs text-slate-500">
              {statuses[order.status] || order.status}
            </p>
          ) : null}
          {existing && can('orders.workflowStageId') ? (
            <p className="mt-1 text-sm text-sky-700">
              {workflow.stages.find((stage) => stage.id === currentStage)
                ?.title || 'Рабочий этап'}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className={button}
          disabled={busy || reportDirty.template}
          onClick={onClose}
        >
          К списку
        </button>
      </div>
      {existing &&
      legacyAdvancedPath &&
      ['owner', 'admin'].includes(context.role) &&
      !isPartyRestrictedManagementContext(context) ? (
        <div className="border-b border-slate-100 px-3 pb-2 text-right sm:px-4">
          <a
            className="inline-flex min-h-10 cursor-pointer items-center text-xs font-semibold text-sky-700 underline underline-offset-2"
            href={`${legacyAdvancedPath}?order=${encodeURIComponent(order._id)}&company=${encodeURIComponent(companyId)}`}
          >
            Расширенные действия
          </a>
        </div>
      ) : null}
      <div className="flex min-w-0 border-b border-slate-100">
        <div
          role="tablist"
          aria-label="Разделы заказа"
          className="flex min-w-0 flex-1 [scrollbar-width:none] gap-1 overflow-x-auto p-2 [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              disabled={reportDirty.template}
              tabIndex={tab === item.id ? 0 : -1}
              aria-controls={tabId + '-' + item.id}
              id={tabId + '-tab-' + item.id}
              className={
                button +
                ' shrink-0 whitespace-nowrap' +
                (tab === item.id ? ' bg-sky-50' : ' border-transparent')
              }
              onClick={() => chooseTab(item.id)}
              onKeyDown={(event) => {
                let target
                if (event.key === 'ArrowRight')
                  target = (index + 1) % tabs.length
                else if (event.key === 'ArrowLeft')
                  target = (index + tabs.length - 1) % tabs.length
                else if (event.key === 'Home') target = 0
                else if (event.key === 'End') target = tabs.length - 1
                if (target === undefined) return
                event.preventDefault()
                chooseTab(tabs[target].id)
                document
                  .getElementById(tabId + '-tab-' + tabs[target].id)
                  ?.focus()
              }}
            >
              {item.title}
            </button>
          ))}
        </div>
        {tabs.length > 3 ? (
          <select
            aria-label="Все разделы заказа"
            value=""
            onChange={(event) => chooseTab(event.target.value)}
            className="my-2 mr-2 min-h-11 w-20 shrink-0 cursor-pointer rounded-lg border border-slate-200 bg-white px-2 text-sm font-semibold text-sky-800 sm:hidden"
          >
            <option value="" disabled>
              Ещё
            </option>
            {tabs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {tabs
        .filter((item) => visited.includes(item.id))
        .map((item) => (
          <div
            key={item.id}
            role="tabpanel"
            id={tabId + '-' + item.id}
            aria-labelledby={tabId + '-tab-' + item.id}
            hidden={tab !== item.id}
            className="p-3 sm:p-4"
          >
            {item.id === 'main' ? (
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                {existing && can('orders.fulfillment') ? (
                  <PartyOrderFulfillment
                    order={order}
                    context={context}
                    companyId={companyId}
                    disabled={busy || dirty}
                    onSaved={onSaved}
                  />
                ) : null}
                {textField('title', 'Название заказа')}
                {!existing && can('finance.payments', 'edit') ? (
                  <fieldset
                    className="space-y-3 rounded-lg border border-slate-200 p-3 sm:col-span-2"
                    disabled={busy || unresolvedCreate}
                  >
                    <legend className="px-1 text-sm font-semibold text-slate-800">
                      Стоимость и полученный аванс
                    </legend>
                    <div className="grid gap-3 sm:grid-cols-3">
                      {textField(
                        'contractAmount',
                        'Стоимость для клиента, ₽',
                        'number'
                      )}
                      <OrderField label="Аванс при создании, ₽">
                        <input
                          ref={initialPaymentInput}
                          aria-label="Аванс при создании, ₽"
                          aria-invalid={initialPaymentInvalid || undefined}
                          type="number"
                          min="0.01"
                          step="0.01"
                          inputMode="decimal"
                          className={control}
                          value={initialPayment.amount}
                          onInput={(event) => {
                            setInitialPaymentInvalid(
                              !event.currentTarget.validity.valid
                            )
                            setError('')
                          }}
                          onChange={(event) =>
                            setInitialPayment((previous) => ({
                              ...previous,
                              amount: event.target.value,
                            }))
                          }
                        />
                      </OrderField>
                      <OrderField label="Как получен аванс">
                        <select
                          className={control}
                          value={initialPayment.paymentMethod}
                          onChange={(event) =>
                            setInitialPayment((previous) => ({
                              ...previous,
                              paymentMethod: event.target.value,
                            }))
                          }
                        >
                          <option value="transfer">Перевод</option>
                          <option value="cash">Наличные</option>
                          <option value="account">На расчётный счёт</option>
                        </select>
                      </OrderField>
                    </div>
                    <p className="text-xs text-slate-500">
                      Заполняйте аванс, только если деньги уже получены. Заказ,
                      бронь и ручная запись оплаты сохранятся вместе. Поле можно
                      оставить пустым.
                    </p>
                  </fieldset>
                ) : null}
                {clientPicker ? (
                  <div className="min-w-0 space-y-1">
                    {clientPicker}
                    {editable('clientId') ? (
                      <PartyRoleNewClient
                        context={context}
                        companyId={companyId}
                        disabled={busy}
                        onDirtyChange={setNewClientDirty}
                        onCreated={(person) => {
                          setCreatedClients((previous) => [...previous, person])
                          change('clientId', person._id)
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}
                {can('orders.client.name') &&
                (!clientPicker || !draft.clientId) &&
                (order.client?.name || client?.name) ? (
                  <OrderField label="Имя клиента">
                    <input
                      className={control}
                      aria-label="Имя клиента"
                      disabled
                      value={order.client?.name || client?.name || ''}
                    />
                  </OrderField>
                ) : null}
                {can('orders.client.phone') && displayClient?.phone ? (
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-slate-700">
                      Телефон клиента
                    </p>
                    <a
                      className="mt-1 inline-flex min-h-11 cursor-pointer flex-wrap items-center gap-x-3 rounded-lg border border-sky-200 px-3 text-sky-700 hover:bg-sky-50"
                      href={
                        'tel:+' +
                        String(
                          normalizePhoneNumber(displayClient.phone) ||
                            displayClient.phone
                        ).replace(/\D/g, '')
                      }
                    >
                      {formatPhoneNumber(displayClient.phone) ||
                        displayClient.phone}
                      <span className="text-xs font-semibold">Позвонить</span>
                    </a>
                  </div>
                ) : null}
                {can('orders.client.email') && displayClient?.email ? (
                  <div className="min-w-0 text-sm">
                    <p className="font-medium text-slate-700">Email клиента</p>
                    <a
                      className="inline-flex min-h-11 cursor-pointer items-center break-all text-sky-700"
                      href={'mailto:' + displayClient.email}
                    >
                      {displayClient.email}
                    </a>
                  </div>
                ) : null}
                <PartyRoleOrderClientEditor
                  companyId={companyId}
                  order={order}
                  client={client}
                  context={context}
                  disabled={
                    busy ||
                    changes.dirty ||
                    contractAmountInvalid ||
                    taskDirty ||
                    Object.entries(reportDirty).some(
                      ([key, value]) => key !== 'client' && value
                    )
                  }
                  onSaved={onSaved}
                  onDirtyChange={dirtyClient}
                />
                {textField('eventDate', 'Начало', 'datetime-local')}
                {textField('dateEnd', 'Окончание', 'datetime-local')}
                {visible('placeType') ? (
                  <OrderField label="Где проводится">
                    <select
                      aria-label="Где проводится"
                      disabled={busy || !editable('placeType')}
                      className={control + ' cursor-pointer'}
                      value={draft.placeType || 'company_location'}
                      onChange={(event) =>
                        change('placeType', event.target.value)
                      }
                    >
                      <option value="company_location">На площадке</option>
                      <option value="client_address">На выезде</option>
                    </select>
                  </OrderField>
                ) : null}
                {visible('locationId') &&
                (draft.placeType || order.placeType) !== 'client_address' ? (
                  <OrderField label="Площадка">
                    <select
                      aria-label="Площадка"
                      className={control + ' cursor-pointer'}
                      disabled={busy || !editable('locationId')}
                      value={draft.locationId || ''}
                      onChange={(event) =>
                        change('locationId', event.target.value || null)
                      }
                    >
                      <option value="">Не выбрана</option>
                      {options.locations.map((location) => (
                        <option key={location._id} value={location._id}>
                          {location.title}
                        </option>
                      ))}
                    </select>
                  </OrderField>
                ) : null}
                {!visible('placeType') ||
                (draft.placeType || order.placeType) === 'client_address' ||
                Boolean(draft.customAddress || order.customAddress)
                  ? textField('customAddress', 'Адрес выезда')
                  : null}
                {!options.services.length
                  ? textField('serviceTitle', 'Описание услуги')
                  : null}
                {visible('servicesIds') ? (
                  <fieldset
                    disabled={busy || !editable('servicesIds')}
                    className="min-w-0 rounded-lg border border-slate-200 p-3 sm:col-span-2"
                  >
                    <legend className="px-1 text-sm font-medium text-slate-700">
                      Услуги
                    </legend>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {options.services.map((service) => (
                        <label
                          key={service._id}
                          className="flex min-h-10 cursor-pointer items-center gap-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={(draft.servicesIds || [])
                              .map(String)
                              .includes(String(service._id))}
                            onChange={(event) =>
                              change(
                                'servicesIds',
                                event.target.checked
                                  ? [...(draft.servicesIds || []), service._id]
                                  : (draft.servicesIds || []).filter(
                                      (id) => String(id) !== String(service._id)
                                    )
                              )
                            }
                          />
                          {service.title}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : null}
                {[
                  'durationMinutes',
                  'responsibleStaffId',
                  'adminComment',
                  ...(options.services.length ? ['serviceTitle'] : []),
                ].some(visible) ? (
                  <details
                    open={detailsOpen}
                    onToggle={(event) =>
                      setDetailsOpen(event.currentTarget.open)
                    }
                    className="min-w-0 rounded-xl border border-slate-200 sm:col-span-2"
                  >
                    <summary className="min-h-11 cursor-pointer px-3 py-3 text-sm font-semibold text-slate-700">
                      Дополнительные поля{' '}
                      <span className="font-normal text-slate-500">
                        ·{' '}
                        {
                          [
                            'durationMinutes',
                            'responsibleStaffId',
                            'adminComment',
                            ...(options.services.length
                              ? ['serviceTitle']
                              : []),
                          ].filter(visible).length
                        }
                      </span>
                    </summary>
                    <div className="grid gap-4 border-t border-slate-100 p-3 sm:grid-cols-2">
                      {textField(
                        'durationMinutes',
                        'Продолжительность, мин.',
                        'number'
                      )}
                      {options.services.length
                        ? textField('serviceTitle', 'Описание услуги')
                        : null}
                      {visible('responsibleStaffId') ? (
                        <OrderField label="Ответственный менеджер">
                          <select
                            aria-label="Ответственный менеджер"
                            className={control + ' cursor-pointer'}
                            disabled={busy || !editable('responsibleStaffId')}
                            value={draft.responsibleStaffId || ''}
                            onChange={(event) =>
                              change(
                                'responsibleStaffId',
                                event.target.value || null
                              )
                            }
                          >
                            <option value="">Не назначен</option>
                            {options.staff
                              .filter(
                                (person) =>
                                  !person.status ||
                                  person.status === 'active' ||
                                  String(person._id) ===
                                    String(draft.responsibleStaffId || '')
                              )
                              .map((person) => (
                                <option key={person._id} value={person._id}>
                                  {nameOf(person)}
                                </option>
                              ))}
                          </select>
                        </OrderField>
                      ) : null}
                      {['adminComment'].filter(visible).map((field) => (
                        <div key={field} className="sm:col-span-2">
                          <OrderField
                            label={
                              field === 'adminComment'
                                ? 'Внутренний комментарий'
                                : 'Комментарий для команды'
                            }
                          >
                            <textarea
                              className={control}
                              rows={3}
                              disabled={busy || !editable(field)}
                              value={draft[field] || ''}
                              onChange={(event) =>
                                change(field, event.target.value)
                              }
                            />
                          </OrderField>
                        </div>
                      ))}
                    </div>
                  </details>
                ) : null}
                {visible('performerComment') ? (
                  <div className="sm:col-span-2">
                    <OrderField label="Комментарий для команды">
                      <textarea
                        className={control}
                        rows={3}
                        disabled={busy || !editable('performerComment')}
                        value={draft.performerComment || ''}
                        onChange={(event) =>
                          change('performerComment', event.target.value)
                        }
                      />
                    </OrderField>
                  </div>
                ) : null}
              </div>
            ) : null}
            {item.id === 'brief' ? (
              editable('eventBrief') ? (
                <PartyEventBriefEditor
                  companyId={companyId}
                  orderId={order._id}
                  orderStatus={order.status || 'draft'}
                  value={draft.eventBrief || {}}
                  servicesIds={
                    can('orders.servicesIds') ? draft.servicesIds : undefined
                  }
                  disabled={busy}
                  onChange={(value) => change('eventBrief', value)}
                />
              ) : (
                <PartyEventBriefView
                  companyId={companyId}
                  orderId={order._id}
                  orderStatus={order.status || 'draft'}
                  value={order.eventBrief || {}}
                  servicesIds={order.servicesIds}
                />
              )
            ) : null}
            {item.id === 'contacts' ? (
              editable('contactRoles') || editable('otherContacts') ? (
                <PartyOrderContactRolesEditor
                  value={draft.contactRoles || {}}
                  clients={options.clients}
                  primaryClientId={draft.clientId || order.clientId}
                  otherContacts={draft.otherContacts || []}
                  onChangeContactRoles={(value) =>
                    change('contactRoles', value)
                  }
                  onChangeOtherContacts={(value) =>
                    change('otherContacts', value)
                  }
                  canEdit={!busy}
                  canEditOtherContacts={editable('otherContacts')}
                  canEditSettings={editable('contactRoles')}
                  showSettings={can('orders.contactRoles')}
                  renderPrimaryClient={clientPicker}
                />
              ) : (
                <PartyOrderContactRolesView
                  value={order.contactRoles || {}}
                  clientsById={clientsById}
                  primaryClientId={order.clientId}
                  otherContacts={order.otherContacts || []}
                  showSettings={can('orders.contactRoles')}
                />
              )
            ) : null}
            {item.id === 'team' ? (
              <div className="space-y-3">
                {assignments.map((assignment, index) => (
                  <div
                    key={assignment.staffId}
                    className="space-y-3 rounded-xl border border-slate-200 p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">
                        {nameOf(
                          options.staff.find(
                            (person) =>
                              String(person._id) === String(assignment.staffId)
                          )
                        )}
                      </p>
                      {options.staff.find(
                        (person) =>
                          String(person._id) === String(assignment.staffId)
                      )?.phone ? (
                        <a
                          className="inline-flex min-h-11 cursor-pointer items-center text-sm text-sky-700"
                          href={
                            'tel:+' +
                            String(
                              options.staff.find(
                                (person) =>
                                  String(person._id) ===
                                  String(assignment.staffId)
                              ).phone
                            ).replace(/\D/g, '')
                          }
                        >
                          Позвонить сотруднику
                        </a>
                      ) : null}
                      {editable('assignedStaff') ? (
                        <button
                          type="button"
                          className={button}
                          disabled={busy}
                          onClick={() =>
                            change(
                              'assignedStaff',
                              assignments.filter(
                                (_, position) => position !== index
                              )
                            )
                          }
                        >
                          Убрать из команды
                        </button>
                      ) : null}
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <OrderField label="Функция в заказе">
                        <select
                          className={control + ' cursor-pointer'}
                          disabled={busy || !editable('assignedStaff')}
                          value={assignment.role || 'performer'}
                          onChange={(event) =>
                            patchAssignment(index, { role: event.target.value })
                          }
                        >
                          <option value="performer">Исполнитель</option>
                          <option value="admin">Администратор</option>
                          <option value="assistant">Помощник</option>
                        </select>
                      </OrderField>
                      {can('finance.payouts') ? (
                        <OrderField label="Оплата исполнителю, ₽">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className={control}
                            disabled={
                              busy ||
                              !can('finance.payouts', 'edit') ||
                              ['closed', 'canceled'].includes(order.status)
                            }
                            value={assignment.payoutAmount ?? 0}
                            onChange={(event) =>
                              patchAssignment(index, {
                                payoutAmount: Number(event.target.value),
                              })
                            }
                          />
                        </OrderField>
                      ) : null}
                    </div>
                    {assignment.confirmationStatus ? (
                      <p className="text-xs text-slate-500">
                        Участие:{' '}
                        {{
                          pending: 'ожидает подтверждения',
                          confirmed: 'подтверждено',
                          declined: 'отказ',
                          done: 'выполнено',
                        }[assignment.confirmationStatus] ||
                          assignment.confirmationStatus}
                      </p>
                    ) : null}
                  </div>
                ))}
                {!assignments.length ? (
                  <p className="text-sm text-slate-500">
                    Команда пока не назначена.
                  </p>
                ) : null}
                {editable('assignedStaff') ? (
                  <OrderField label="Добавить сотрудника">
                    <select
                      className={control + ' cursor-pointer'}
                      disabled={busy}
                      value=""
                      onChange={(event) => {
                        if (event.target.value)
                          change('assignedStaff', [
                            ...assignments,
                            { staffId: event.target.value, role: 'performer' },
                          ])
                      }}
                    >
                      <option value="">Выберите сотрудника</option>
                      {options.staff
                        .filter(
                          (person) =>
                            (!person.status || person.status === 'active') &&
                            !assignments.some(
                              (assignment) =>
                                String(assignment.staffId) ===
                                String(person._id)
                            )
                        )
                        .map((person) => (
                          <option key={person._id} value={person._id}>
                            {nameOf(person)}
                          </option>
                        ))}
                    </select>
                  </OrderField>
                ) : null}
              </div>
            ) : null}
            {item.id === 'finance' ? (
              <div className="space-y-4">
                <PartyRoleOrderPayments
                  companyId={companyId}
                  order={order}
                  context={context}
                  staff={options.staff}
                  disabled={
                    busy ||
                    changes.dirty ||
                    contractAmountInvalid ||
                    taskDirty ||
                    newClientDirty ||
                    Object.entries(reportDirty).some(
                      ([key, value]) => key !== 'payments' && value
                    )
                  }
                  onSaved={onSaved}
                  onDirtyChange={dirtyPayments}
                />
                {textField(
                  'contractAmount',
                  'Стоимость для клиента, ₽',
                  'number'
                )}
                {can('finance.payments') && order.clientPayment ? (
                  <div className="rounded-lg bg-slate-50 p-3 text-sm">
                    <p>
                      Статус оплаты:{' '}
                      {{
                        none: 'Не оплачено',
                        wait_prepayment: 'Ожидается задаток',
                        prepaid: 'Задаток внесён',
                        paid: 'Оплачено',
                      }[order.clientPayment.status] || 'Не указан'}
                    </p>
                    {order.clientPayment.prepaidAmount != null ? (
                      <p>Задаток: {money(order.clientPayment.prepaidAmount)}</p>
                    ) : null}
                  </div>
                ) : null}
                {order.transactions?.length ? (
                  <ul className="space-y-2">
                    {order.transactions.map((transaction, index) => (
                      <li
                        key={transaction._id || index}
                        className="rounded-lg border border-slate-100 p-3 text-sm"
                      >
                        <span>
                          {transaction.type === 'income'
                            ? 'Поступление'
                            : 'Расход'}
                          : {money(transaction.amount)}
                        </span>
                        {transaction.comment ? (
                          <p className="break-words text-slate-500">
                            {transaction.comment}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
            {item.id === 'tasks' ? (
              <>
                {can('tasks.create', 'edit') && can('tasks.assign', 'edit') && !['closed', 'canceled'].includes(order.status) ? <PartyPreparationTemplateApply
                  companyId={companyId}
                  orderId={order._id}
                  disabled={busy || changes.dirty || contractAmountInvalid || taskDirty || Object.entries(reportDirty).some(([key, value]) => key !== 'template' && value)}
                  onPendingChange={templatePending}
                  onApplied={async () => {
                    setTasksRefreshKey((value) => value + 1)
                    const result = await apiJson(`/api/party/orders/${order._id}`, { cache: 'no-store', headers: { 'x-partycrm-company-id': companyId } })
                    onSaved(result.data, result.accessChanged || !result.data)
                  }}
                /> : null}
                <fieldset disabled={reportDirty.template} className="min-w-0 border-0 p-0">
                  <PartyTasks
                    companyId={companyId}
                    orderId={order._id}
                    compact
                    refreshKey={tasksRefreshKey}
                    onDirtyChange={dirtyTask}
                  />
                </fieldset>
              </>
            ) : null}
            {item.id === 'reports' ? (
              <PartyOrderReports
                companyId={companyId}
                orderId={order._id}
                staff={options.staff}
                onDirtyChange={dirtyReport}
                manager={context.role === 'owner' || context.role === 'admin'}
              />
            ) : null}
            {item.id === 'inventory' ? (
              can('inventory.catalog') ? (
                <OrderInventoryPanel
                  activeCompanyId={companyId}
                  orderId={order._id}
                  services={options.services}
                  serviceItems={order.orderItems || []}
                  eventDate={order.eventDate}
                  dateEnd={order.dateEnd}
                  canViewReservations={can('inventory.reservations')}
                  canEditReservations={can('inventory.reservations', 'edit')}
                  canViewMovements={can('inventory.movements')}
                  canEditMovements={can('inventory.movements', 'edit')}
                  onDirtyChange={dirtyInventory}
                />
              ) : can('inventory.movements') ? (
                <InventoryMovementsPanel
                  activeCompanyId={companyId}
                  orderId={order._id}
                  canEdit={can('inventory.movements', 'edit')}
                />
              ) : (
                <p className="text-sm text-slate-500">
                  Просмотр справочника реквизита недоступен для вашей должности.
                </p>
              )
            ) : null}
            {item.id === 'preparation' ? (
              <fieldset disabled={!can('orders.preparation', 'edit')}>
                <PartyOrderPreparationPanel
                  companyId={companyId}
                  orderId={order._id}
                  staffId={context.staff?._id}
                  staff={options.staff}
                  manager
                  onDirtyChange={dirtyPreparation}
                  onOpenTasks={
                    can('tasks') ? () => chooseTab('tasks') : undefined
                  }
                />
              </fieldset>
            ) : null}
          </div>
        ))}
      <>
        {nextStages.length ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 p-3 sm:px-4">
            <span className="text-xs text-slate-500">Передать на этап:</span>
            {nextStages.map((stage) => (
              <button
                type="button"
                key={stage.id}
                className={button}
                disabled={busy || dirty}
                onClick={() => transition(stage.id)}
              >
                {stage.title}
              </button>
            ))}
            {dirty ? (
              <span className="text-xs text-slate-500">
                Сначала сохраните изменения.
              </span>
            ) : null}
          </div>
        ) : null}
        <div
          role="region"
          aria-label="Сохранение заказа"
          className={
            (childDirty || (existing && !changes.dirty && !contractAmountInvalid)
              ? ''
              : 'sticky bottom-[calc(var(--party-mobile-nav-height,0px)+env(safe-area-inset-bottom))] z-20 md:bottom-0 ') +
            'flex flex-wrap items-center justify-end gap-2 rounded-b-2xl border-t border-sky-100 bg-white p-3 shadow-[0_-4px_14px_rgb(15_23_42_/_0.04)] sm:p-4'
          }
        >
          {error ? (
            <p
              role="alert"
              className="w-full rounded-lg bg-red-50 p-3 text-sm text-red-800"
            >
              {error}
            </p>
          ) : null}
          {unresolvedCreate ? (
            <p
              role="status"
              className="w-full rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
            >
              Связь прервалась: заказ мог сохраниться. Повторите проверку этой
              же операции. Данные временно заблокированы, чтобы не записать
              второй заказ или аванс.
            </p>
          ) : null}
          <span role="status" className="mr-auto text-xs text-slate-500">
            {busy
              ? 'Сохранение…'
              : changes.dirty || contractAmountInvalid
                ? 'Есть несохранённые изменения заказа'
                : childDirty
                  ? 'Есть несохранённые изменения в разделе'
                  : existing
                    ? 'Изменения сохранены'
                    : 'Заполните клиента или услугу, затем создайте заказ'}
          </span>
          {changes.dirty || contractAmountInvalid || !existing ? (
            <button
              type="button"
              className={button + ' bg-sky-600 text-white hover:bg-sky-700'}
              disabled={
                busy ||
                (!changes.dirty &&
                  !contractAmountInvalid &&
                  !initialPaymentDirty &&
                  !unresolvedCreate) ||
                childDirty
              }
              onClick={save}
            >
              {existing
                ? 'Сохранить заказ'
                : unresolvedCreate
                  ? 'Проверить и повторить сохранение'
                  : initialPaymentDirty
                    ? 'Создать заказ и записать аванс'
                    : 'Создать заказ'}
            </button>
          ) : null}
        </div>
      </>
    </section>
  )
}

function CompanyRoleOrders({ companyId, legacyAdvancedPath, initialOrderId = '' }) {
  const [data, setData] = useState({
    options: emptyOptions,
    workflow: DEFAULT_PARTY_WORKFLOW,
  })
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [selected, setSelected] = useState(null)
  const [selectedOptions, setSelectedOptions] = useState(null)
  const [editorRevision, setEditorRevision] = useState(0)
  const [openingId, setOpeningId] = useState('')
  const [view, setView] = useState('list')
  const [overviewVisible, setOverviewVisible] = useState(false)
  const [calendarEnabled, setCalendarEnabled] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [calendarView, setCalendarView] = useState('month')
  const [calendarRevision, setCalendarRevision] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [quickFilter, setQuickFilter] = useState('all')
  const [boardPending, setBoardPending] = useState('')
  const [transitionHelpOrder, setTransitionHelpOrder] = useState(null)
  const transitionGeneration = useRef(0)
  const requestedOrder = useRef('')
  const pendingCreate = useRef(false)
  const generation = useRef(0)
  const openingGeneration = useRef(0)
  const selectedId = useRef('')
  const dirtyRef = useRef(false)
  const opener = useRef(null)
  const focusRequested = useRef(false)
  const returnFocusRequested = useRef(false)
  const focusEditor = useCallback(() => {
    focusRequested.current = true
  }, [])
  useLayoutEffect(() => {
    if (focusRequested.current && selected && !openingId && !busy) {
      const heading = document.getElementById(
        `party-role-editor-heading-${companyId}`
      )
      if (!heading) return
      heading.focus({ preventScroll: true })
      heading.scrollIntoView({ block: 'start' })
      focusRequested.current = false
    } else if (returnFocusRequested.current && !selected) {
      const previous = opener.current
      const target =
        previous?.isConnected &&
        previous !== document.body &&
        previous.getClientRects().length
          ? previous
          : document.getElementById(`party-role-search-${companyId}`) ||
            document.getElementById(`party-role-overview-heading-${companyId}`)
      target?.focus({ preventScroll: true })
      target?.scrollIntoView({ block: 'nearest' })
      returnFocusRequested.current = false
    }
  }, [selected, openingId, busy, editorRevision, companyId])
  const dirtyChanged = useCallback((value) => {
    dirtyRef.current = value
    setDirty(value)
  }, [])
  const load = useCallback(
    async ({ refreshSelection = false } = {}) => {
      const current = ++generation.current
      const selectedAtStart = selectedId.current
      setBusy(true)
      setError('')
      try {
        const headers = { 'x-partycrm-company-id': companyId }
        const [options, workflow] = await Promise.all([
          apiJson('/api/party/order-options', { headers, cache: 'no-store' }),
          apiJson('/api/party/workflow', { headers, cache: 'no-store' }),
        ])
        if (current !== generation.current) return
        setData({
          options: { ...emptyOptions, ...options.data },
          workflow: workflow.data || DEFAULT_PARTY_WORKFLOW,
        })
        if (refreshSelection && selectedAtStart) {
          try {
            const [record, contextualOptions] = await Promise.all([
              apiJson(`/api/party/orders/${selectedAtStart}`, {
                headers,
                cache: 'no-store',
              }),
              apiJson(
                `/api/party/order-options?orderId=${encodeURIComponent(selectedAtStart)}`,
                { headers, cache: 'no-store' }
              ),
            ])
            if (
              current === generation.current &&
              selectedId.current === selectedAtStart &&
              !dirtyRef.current
            ) {
              setSelected(record.data)
              setSelectedOptions({ ...emptyOptions, ...contextualOptions.data })
              setEditorRevision((value) => value + 1)
            }
          } catch (cause) {
            if (
              current === generation.current &&
              selectedId.current === selectedAtStart &&
              !dirtyRef.current
            ) {
              if ([403, 404].includes(cause.status)) {
                selectedId.current = ''
                setSelected(null)
                setSelectedOptions(null)
                setNotice('Заказ больше не доступен вашей должности.')
              } else
                setError(cause.message || 'Не удалось обновить открытый заказ')
            }
          }
        }
      } catch (cause) {
        if (current === generation.current) {
          setError(cause.message || 'Не удалось загрузить справочники заказов')
        }
      } finally {
        if (current === generation.current) setBusy(false)
      }
    },
    [companyId]
  )
  useEffect(() => {
    load()
    return () => {
      generation.current += 1
      openingGeneration.current += 1
      transitionGeneration.current += 1
    }
  }, [load])
  const context = data.options.context
  const preferenceStaffId = context?.staff?._id ? String(context.staff._id) : ''
  useEffect(() => {
    if (!preferenceStaffId) return
    const saved = readPartyOrderViewPreference(companyId, preferenceStaffId)
    setView(saved.view)
    setCalendarView(saved.calendarView)
    if (saved.view === 'calendar') setCalendarEnabled(true)
  }, [companyId, preferenceStaffId])
  const can = (resource, action = 'read') =>
    canPartyAccess(context, { resource, action })
  const canCalendar = can('orders.eventDate')
  const canBoard = can('orders.workflowStageId')
  const effectiveView = view === 'calendar' && canCalendar ? 'calendar' : view === 'board' && canBoard ? 'board' : 'list'
  const accessKey = `${context?.role || ''}:${context?.staff?._id || ''}:${context?.position?._id || ''}:${context?.position?.revision || 0}`
  const effectiveQuickFilter =
    (quickFilter === 'tasks' && !can('tasks')) ||
    (['today', 'undated'].includes(quickFilter) && !canCalendar)
      ? 'all'
      : quickFilter
  const effectiveStageFilter =
    can('orders.workflowStageId') &&
    data.workflow.stages.some((stage) => stage.id === stageFilter)
      ? stageFilter
      : ''
  const searchable = [
    'orders.title',
    'orders.client.name',
    'orders.serviceTitle',
  ].some((resource) => can(resource))
  const effectiveSearch = searchable ? search : ''
  const now = new Date()
  const list = usePartyOrderList({
    companyId,
    enabled: Boolean(context) && can('orders') && effectiveView !== 'board',
    accessKey,
    search: effectiveSearch,
    stageId: effectiveStageFilter,
    quick: effectiveQuickFilter,
    todayFrom: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).toISOString(),
    todayTo: new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1
    ).toISOString(),
    refreshKey: calendarRevision,
  })
  const boardStages = useMemo(
    () => getPartyOrderBoardStages(context, data.workflow, effectiveStageFilter),
    [context, data.workflow, effectiveStageFilter]
  )
  const board = usePartyOrderBoard({
    companyId,
    enabled: Boolean(context) && can('orders') && effectiveView === 'board',
    accessKey,
    stageIds: boardStages.map((stage) => stage.id),
    search: effectiveSearch,
    quick: effectiveQuickFilter,
    todayFrom: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
    todayTo: new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString(),
    refreshKey: calendarRevision,
  })
  usePartyUnsavedChanges(false, { label: 'передача заказа', scope: companyId, pending: Boolean(boardPending) })
  const calendar = usePartyOrderCalendar({
    companyId,
    enabled: calendarEnabled && canCalendar,
    month: calendarMonth,
    view: calendarView,
    accessKey,
    refreshKey: calendarRevision,
    ticketsEnabled: can('tickets'),
  })
  const calendarAccess = useMemo(
    () => ({
      title: canPartyAccess(context, { resource: 'orders.title' }),
      service: canPartyAccess(context, { resource: 'orders.serviceTitle' }),
      clientName: canPartyAccess(context, { resource: 'orders.client.name' }),
      status: canPartyAccess(context, { resource: 'orders.status' }),
      end: canPartyAccess(context, { resource: 'orders.dateEnd' }),
      tickets: canPartyAccess(context, { resource: 'tickets' }),
    }),
    [context]
  )
  useEffect(() => {
    const requestCreate = () => {
      if (!context) {
        pendingCreate.current = true
        return
      }
      pendingCreate.current = false
      if (!canPartyAccess(context, { resource: 'orders', action: 'create' }))
        return
      if (!requestPartyLeave({ kind: 'record', target: 'new' })) return
      opener.current = document.activeElement
      dirtyChanged(false)
      openingGeneration.current += 1
      setOpeningId('')
      selectedId.current = ''
      setSelectedOptions(data.options)
      setSelected({})
      setEditorRevision((value) => value + 1)
      setOverviewVisible(false)
      setNotice('')
      focusEditor()
    }
    window.addEventListener('partycrm:create-order', requestCreate)
    const url = new URL(window.location.href)
    if (context && url.searchParams.get('create') === 'order') {
      url.searchParams.delete('create')
      window.history.replaceState(window.history.state, '', url)
      requestCreate()
    } else if (context && pendingCreate.current) requestCreate()
    return () =>
      window.removeEventListener('partycrm:create-order', requestCreate)
  }, [context, data.options, dirtyChanged, focusEditor])
  const leave = useCallback((target) => requestPartyLeave({ kind: 'record', target }), [])
  const open = useCallback(async (order) => {
    if (busy || openingId || boardPending) return
    setTransitionHelpOrder(null)
    if (order.calendarEntityType === 'ticket_session') {
      const href = `${window.location.pathname.startsWith('/performer') ? '/performer' : '/company'}/ticketing?${new URLSearchParams({ sessionId: order.ticketSessionId, companyId })}`
      if (!requestPartyLeave({ kind: 'route', target: href })) return
      window.location.assign(href)
      return
    }
    if (!leave(String(order._id || 'new'))) return
    opener.current = document.activeElement
    const current = ++openingGeneration.current
    if (!order._id) {
      selectedId.current = ''
      dirtyChanged(false)
      setSelectedOptions(data.options)
      setSelected(order)
      setEditorRevision((value) => value + 1)
      setOverviewVisible(false)
      focusEditor()
      return
    }
    setOpeningId(String(order._id))
    setError('')
    try {
      const headers = { 'x-partycrm-company-id': companyId }
      const [record, options] = await Promise.all([
        apiJson(`/api/party/orders/${order._id}`, {
          headers,
          cache: 'no-store',
        }),
        apiJson(
          `/api/party/order-options?orderId=${encodeURIComponent(order._id)}`,
          { headers, cache: 'no-store' }
        ),
      ])
      if (current !== openingGeneration.current) return
      selectedId.current = String(order._id)
      dirtyChanged(false)
      setSelectedOptions({ ...emptyOptions, ...options.data })
      setSelected(record.data)
      setEditorRevision((value) => value + 1)
      setOverviewVisible(false)
      setNotice('')
      focusEditor()
    } catch (cause) {
      if (current === openingGeneration.current)
        setError(cause.message || 'Не удалось открыть заказ')
    } finally {
      if (current === openingGeneration.current) setOpeningId('')
    }
  }, [busy, openingId, boardPending, companyId, data.options, dirtyChanged, focusEditor, leave])
  useEffect(() => {
    if (!initialOrderId || !context || busy || openingId || requestedOrder.current === initialOrderId) return
    requestedOrder.current = initialOrderId
    const url = new URL(window.location.href)
    if (url.searchParams.get('orderId') === initialOrderId) {
      url.searchParams.delete('orderId')
      url.searchParams.delete('companyId')
      window.history.replaceState(window.history.state, '', url)
    }
    open({ _id: initialOrderId })
  }, [initialOrderId, context, busy, openingId, open])
  const close = () => {
    if (!leave('list')) return
    returnFocusRequested.current = true
    dirtyChanged(false)
    selectedId.current = ''
    openingGeneration.current += 1
    setOpeningId('')
    setSelected(null)
    setSelectedOptions(null)
    setOverviewVisible(false)
  }
  const saved = (order, accessChanged) => {
    dirtyChanged(false)
    if (accessChanged) {
      selectedId.current = ''
      setSelected(null)
      setNotice(
        'Заказ передан. На текущем этапе он доступен другим сотрудникам.'
      )
    } else {
      selectedId.current = String(order._id)
      setSelected(order)
      setNotice('Заказ сохранён.')
    }
    setCalendarRevision((value) => value + 1)
    load({ refreshSelection: !accessChanged })
  }
  const moveOrder = async (order, stageId) => {
    if (busy || boardPending || dirtyRef.current || !getPartyOrderBoardTransitions(context, data.workflow, order).some((stage) => stage.id === stageId)) return
    const current = ++transitionGeneration.current
    setBoardPending(String(order._id))
    setTransitionHelpOrder(null)
    setError('')
    try {
      const result = await apiJson(`/api/party/orders/${order._id}/stage`, {
        method: 'PATCH',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify({ toStageId: stageId, expectedUpdatedAt: new Date(order.updatedAt).toISOString() }),
      })
      if (current !== transitionGeneration.current) return
      const accessChanged = result.accessChanged || !result.data
      if (selectedId.current === String(order._id)) {
        if (accessChanged) {
          selectedId.current = ''
          setSelected(null)
          setSelectedOptions(null)
        } else {
          setSelected(result.data)
          setEditorRevision((value) => value + 1)
        }
      }
      setNotice(accessChanged ? 'Заказ передан. На новом этапе он доступен другим сотрудникам.' : 'Рабочий этап заказа изменён.')
      setCalendarRevision((value) => value + 1)
      load({ refreshSelection: true })
    } catch (cause) {
      if (current !== transitionGeneration.current) return
      if (cause.payload?.error?.code === 'partycrm_brief_required') setTransitionHelpOrder(order)
      else if ([403, 404, 409].includes(cause.status)) {
        setCalendarRevision((value) => value + 1)
        await load({ refreshSelection: true })
      }
      if (current === transitionGeneration.current) setError(cause.message || 'Не удалось передать заказ')
    } finally {
      if (current === transitionGeneration.current) setBoardPending('')
    }
  }
  const today = new Date().toDateString()
  const matchesQuickFilter = (order) =>
    effectiveQuickFilter === 'all' ||
    (effectiveQuickFilter === 'today' &&
      order.eventDate &&
      new Date(order.eventDate).toDateString() === today) ||
    (effectiveQuickFilter === 'tasks' &&
      Number(order.taskSummary?.openCount || 0) > 0) ||
    (effectiveQuickFilter === 'undated' &&
      (!order.eventDate || !Number.isFinite(+new Date(order.eventDate))))
  const orders =
    effectiveView === 'list'
      ? list.orders
      : calendar.orders.filter((order) => {
          if (order.calendarEntityType === 'ticket_session')
            return (
              !effectiveStageFilter &&
              effectiveQuickFilter !== 'tasks' &&
              (!effectiveSearch.trim() ||
                String(order.title || '')
                  .toLowerCase()
                  .includes(effectiveSearch.trim().toLowerCase())) &&
              (effectiveQuickFilter !== 'today' ||
                new Date(order.eventDate).toDateString() === today)
            )
          if (!matchesQuickFilter(order)) return false
          if (
            effectiveStageFilter &&
            getPartyOrderStage(order, data.workflow) !== effectiveStageFilter
          )
            return false
          const haystack = [
            can('orders.title') && order.title,
            can('orders.client.name') && order.client?.name,
            can('orders.serviceTitle') && order.serviceTitle,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          return (
            !effectiveSearch.trim() ||
            haystack.includes(effectiveSearch.trim().toLowerCase())
          )
        })
  const chooseView = (next) => {
    setView(next)
    if (next === 'calendar') setCalendarEnabled(true)
    writePartyOrderViewPreference(companyId, preferenceStaffId, { view: next, calendarView })
    setOverviewVisible(true)
    requestAnimationFrame(() =>
      document
        .getElementById(`party-role-overview-${companyId}`)
        ?.scrollIntoView({ block: 'start' })
    )
  }
  const chooseCalendarView = (next) => {
    if (!['month', 'week', 'day'].includes(next)) return
    setCalendarView(next)
    writePartyOrderViewPreference(companyId, preferenceStaffId, { view, calendarView: next })
  }
  return (
    <div className="space-y-4">
      <div
        className={
          (selected ? 'hidden lg:flex' : 'flex') +
          ' flex-wrap items-center justify-between gap-3'
        }
      >
        <h1
          id={`party-role-overview-heading-${companyId}`}
          tabIndex={-1}
          className="rounded text-xl font-bold text-sky-950 focus-visible:outline-2 focus-visible:outline-sky-600"
        >
          Заказы
        </h1>
        <div className="flex flex-wrap gap-2">
          {can('orders', 'create') ? (
            <button
              type="button"
              className={button + ' bg-sky-600 text-white hover:bg-sky-700'}
              disabled={busy || Boolean(boardPending)}
              onClick={() => open({})}
            >
              + Заказ
            </button>
          ) : null}
          <button
            type="button"
            className={button}
            disabled={busy || dirty || Boolean(boardPending)}
            onClick={() => {
              load({ refreshSelection: true })
              setCalendarRevision((value) => value + 1)
            }}
          >
            Обновить
          </button>
        </div>
      </div>
      {context && can('orders') && (canCalendar || canBoard) ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div
            role="group"
            aria-label="Представление заказов"
            className="inline-flex rounded-xl border border-sky-200 bg-white p-1"
          >
            {[
              ['list', 'Список'],
              ...(canBoard ? [['board', 'Доска']] : []),
              ...(canCalendar ? [['calendar', 'Календарь']] : []),
            ].map(([id, label]) => (
              <button
                type="button"
                key={id}
                aria-pressed={effectiveView === id}
                disabled={Boolean(boardPending)}
                className={
                  'min-h-11 cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold ' +
                  (effectiveView === id
                    ? 'bg-sky-600 text-white'
                    : 'text-sky-800 hover:bg-sky-50')
                }
                onClick={() => chooseView(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {selected && overviewVisible ? (
            <button
              type="button"
              className={button}
              onClick={() => {
                setOverviewVisible(false)
                requestAnimationFrame(() =>
                  document
                    .getElementById(`party-role-editor-${companyId}`)
                    ?.scrollIntoView({ block: 'start' })
                )
              }}
            >
              Продолжить редактирование
            </button>
          ) : null}
          {canPartyResourceCalendarAccess(context) ? <a className={button} href={`/performer/resources?companyId=${encodeURIComponent(companyId)}`}>Ресурсы</a> : null}
        </div>
      ) : null}
      {boardPending ? <p role="status" className="rounded-lg bg-sky-50 p-3 text-sm text-sky-800">Передаём заказ на другой рабочий этап…</p> : null}
      {openingId ? (
        <p
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-sky-50 p-3 text-sm text-sky-800"
        >
          Открываем заказ…
          <button
            type="button"
            className="min-h-10 cursor-pointer underline"
            onClick={() => {
              openingGeneration.current += 1
              setOpeningId('')
            }}
          >
            Отменить открытие
          </button>
        </p>
      ) : null}
      {error ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
          {transitionHelpOrder ? <button type="button" className={button + ' ml-2'} disabled={busy || Boolean(boardPending)} onClick={() => open(transitionHelpOrder)}>Открыть заказ и заполнить бриф</button> : null}
          {!context ? (
            <button
              type="button"
              className={button + ' ml-2'}
              onClick={() => load()}
              disabled={busy}
            >
              Повторить загрузку
            </button>
          ) : null}
        </p>
      ) : null}
      {notice ? (
        <p
          role="status"
          className="rounded-lg bg-sky-50 p-3 text-sm text-sky-800"
        >
          {notice}
        </p>
      ) : null}
      {busy && !context ? (
        <p role="status" className="p-3 text-sm text-slate-500">
          Загрузка заказов…
        </p>
      ) : null}
      {!busy && context && !can('orders') ? (
        <p>У вашей должности нет доступа к заказам.</p>
      ) : null}
      {context && can('orders') ? (
        <div
          className={
            selected && effectiveView === 'list' && !overviewVisible
              ? 'grid min-w-0 gap-4 lg:grid-cols-[minmax(250px,320px)_minmax(0,1fr)]'
              : 'min-w-0'
          }
        >
          <div
            id={`party-role-overview-${companyId}`}
            className={
              selected && !overviewVisible
                ? effectiveView !== 'list'
                  ? 'hidden min-w-0 space-y-3'
                  : 'hidden min-w-0 space-y-3 lg:block'
                : 'min-w-0 space-y-3'
            }
          >
            {searchable ? (
              <label className="block text-sm text-slate-600">
                Поиск заказов
                <input
                  id={`party-role-search-${companyId}`}
                  type="search"
                  placeholder={[
                    can('orders.title') && 'Название',
                    can('orders.client.name') && 'Клиент',
                    can('orders.serviceTitle') && 'Услуга',
                  ]
                    .filter(Boolean)
                    .join(', ')}
                  maxLength={160}
                  className={control}
                  value={search}
                  disabled={Boolean(boardPending)}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
            ) : null}
            <div
              className="flex flex-wrap gap-2"
              role="group"
              aria-label="Быстрые фильтры заказов"
            >
              {[
                { id: 'all', title: 'Все' },
                ...(can('orders.eventDate')
                  ? [
                      {
                        id: 'today',
                        title: 'Сегодня',
                      },
                    ]
                  : []),
                ...(can('tasks')
                  ? [
                      {
                        id: 'tasks',
                        title: 'С задачами',
                      },
                    ]
                  : []),
                ...(canCalendar && effectiveView !== 'calendar'
                  ? [
                      {
                        id: 'undated',
                        title: 'Без даты',
                      },
                    ]
                  : []),
              ].map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={effectiveQuickFilter === item.id}
                  disabled={Boolean(boardPending)}
                  onClick={() => setQuickFilter(item.id)}
                  className={
                    'min-h-10 cursor-pointer rounded-lg border px-3 py-2 text-sm ' +
                    (effectiveQuickFilter === item.id
                      ? 'border-sky-300 bg-sky-50 font-semibold text-sky-800'
                      : 'border-slate-200 bg-white text-slate-600')
                  }
                >
                  {item.title}
                </button>
              ))}
            </div>
            {can('orders.workflowStageId') ? (
              <label className="block text-sm text-slate-600">
                Рабочий этап
                <select
                  className={control + ' cursor-pointer'}
                  value={effectiveStageFilter}
                  disabled={Boolean(boardPending)}
                  onChange={(event) => setStageFilter(event.target.value)}
                >
                  <option value="">Все доступные этапы</option>
                  {data.workflow.stages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {search || stageFilter || quickFilter !== 'all' ? (
              <button
                type="button"
                className={button}
                disabled={Boolean(boardPending)}
                onClick={() => {
                  setSearch('')
                  setStageFilter('')
                  setQuickFilter('all')
                }}
              >
                Сбросить фильтры
              </button>
            ) : null}
            {effectiveView === 'board' ? <>
              {dirty ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Сохраните или отмените изменения открытого заказа перед передачей карточек.</p> : null}
              <PartyRoleOrdersBoard context={context} workflow={data.workflow} stages={boardStages} board={board} disabled={busy || dirty || Boolean(boardPending) || Boolean(openingId)} selectedId={selected?._id ? String(selected._id) : ''} onOpen={open} onTransition={moveOrder} />
            </> : null}
            {effectiveView === 'list' ? (
              <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
                <span>Сначала новые</span>
                {!list.busy && !list.error ? (
                  <span>Загружено: {list.orders.length}</span>
                ) : null}
              </div>
            ) : null}
            {effectiveView === 'list' && list.busy ? (
              <p role="status" className="p-3 text-sm text-slate-500">
                Ищем заказы…
              </p>
            ) : null}
            {effectiveView === 'list' && list.error ? (
              <p
                role="alert"
                className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
              >
                {list.error}{' '}
                <button type="button" className={button} onClick={list.reload}>
                  Повторить поиск
                </button>
              </p>
            ) : null}
            {!list.busy &&
            !list.error &&
            !list.orders.length &&
            !list.nextCursor &&
            effectiveView === 'list' ? (
              <div className="space-y-2 rounded-xl border border-dashed border-slate-200 p-4 text-sm text-slate-500">
                <p>
                  {search || stageFilter || quickFilter !== 'all'
                    ? 'По выбранным условиям заказов нет.'
                    : 'Доступных заказов пока нет.'}
                </p>
              </div>
            ) : null}
            <div
              style={{ display: effectiveView === 'list' ? undefined : 'none' }}
              className={
                selected
                  ? 'space-y-2'
                  : 'grid gap-3 md:grid-cols-2 xl:grid-cols-3'
              }
            >
              {list.orders.map((order) => (
                <button
                  type="button"
                  key={order._id}
                  className={
                    'min-w-0 cursor-pointer space-y-2 rounded-xl border p-4 text-left transition hover:border-sky-300 hover:shadow-sm ' +
                    (selected?._id === order._id
                      ? 'border-sky-400 bg-sky-50'
                      : 'border-sky-100 bg-white')
                  }
                  onClick={() => open(order)}
                >
                  <p className="font-semibold break-words text-sky-950">
                    {order.title || order.serviceTitle || 'Заказ'}
                  </p>
                  {can('orders.eventDate') ? (
                    <p className="text-sm text-slate-600">
                      {dateText(order.eventDate)}
                    </p>
                  ) : null}
                  {can('orders.client.name') && order.client?.name ? (
                    <p className="text-sm break-words text-slate-600">
                      {order.client.name}
                    </p>
                  ) : null}
                  {can('tasks') && order.taskSummary?.openCount > 0 ? (
                    <p
                      className={
                        'text-xs font-medium ' +
                        (order.taskSummary.overdueCount > 0
                          ? 'text-red-700'
                          : 'text-sky-700')
                      }
                    >
                      {order.taskSummary.overdueCount > 0
                        ? `Просрочено задач: ${order.taskSummary.overdueCount}`
                        : `Открытых задач: ${order.taskSummary.openCount}`}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                    {can('orders.workflowStageId') ? (
                      <span>
                        {
                          data.workflow.stages.find(
                            (stage) =>
                              stage.id ===
                              getPartyOrderStage(order, data.workflow)
                          )?.title
                        }
                      </span>
                    ) : null}
                    {can('orders.status') && Object.hasOwn(order, 'status') ? (
                      <span>{statuses[order.status] || order.status}</span>
                    ) : null}
                    {can('finance.clientAmount') &&
                    Object.hasOwn(order, 'contractAmount') ? (
                      <span>{money(order.contractAmount)}</span>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
            {calendarEnabled && canCalendar ? (
              <div hidden={effectiveView !== 'calendar'}>
                <PartyRoleOrdersCalendar
                  orders={orders}
                  month={calendarMonth}
                  view={calendarView}
                  onViewChange={chooseCalendarView}
                  onMonthChange={setCalendarMonth}
                  access={calendarAccess}
                  onOpen={open}
                  busy={calendar.busy}
                  error={calendar.error}
                  onReload={calendar.reload}
                  onOpenUndated={() => {
                    setQuickFilter('undated')
                    chooseView('list')
                  }}
                />
              </div>
            ) : null}
            {effectiveView === 'list' && !list.busy && list.nextCursor ? (
              <div className="space-y-2 rounded-lg border border-slate-200 p-3">
                {!list.orders.length && !list.errorMore ? (
                  <p className="text-sm text-slate-600">
                    Совпадений пока нет. Можно проверить следующие заказы.
                  </p>
                ) : null}
                {list.errorMore ? (
                  <p role="alert" className="text-sm text-red-800">
                    {list.errorMore}
                  </p>
                ) : null}
                <button
                  type="button"
                  className={button + ' w-full'}
                  disabled={list.busyMore}
                  onClick={list.loadMore}
                >
                  {list.busyMore
                    ? 'Загружаем…'
                    : list.errorMore
                      ? 'Повторить загрузку'
                      : list.orders.length
                        ? 'Показать ещё'
                        : 'Продолжить поиск'}
                </button>
              </div>
            ) : null}
          </div>
          {selected ? (
            <div
              id={`party-role-editor-${companyId}`}
              inert={Boolean(openingId) || busy || Boolean(boardPending)}
            >
              <RoleOrderEditor
                key={
                  (selected._id || 'new') +
                  ':' +
                  (selected.updatedAt || '') +
                  ':' +
                  editorRevision
                }
                companyId={companyId}
                order={selected}
                options={selectedOptions || data.options}
                workflow={data.workflow}
                onSaved={saved}
                onClose={close}
                onDirtyChange={dirtyChanged}
                legacyAdvancedPath={legacyAdvancedPath}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default function PartyRoleOrdersWorkspace({
  companies = [],
  companyId: fixedCompanyId = '',
  legacyAdvancedPath = '/company/orders',
}) {
  const [companyId, setCompanyId] = useState(
    fixedCompanyId || companies[0]?.id || ''
  )
  const [companyReady, setCompanyReady] = useState(Boolean(fixedCompanyId))
  const companyInitialized = useRef(false)
  const currentCompanyId = useRef(fixedCompanyId || companies[0]?.id || '')
  const [companyNotice, setCompanyNotice] = useState('')
  const [deepOrder, setDeepOrder] = useState({ companyId: '', orderId: '' })
  const chooseCompany = useCallback(
    (id, { external = false } = {}) => {
      if (fixedCompanyId || id === currentCompanyId.current) return
      if (!companies.some((company) => String(company.id) === String(id))) {
        setCompanyNotice(
          'У вашей должности нет доступа к заказам выбранной компании.'
        )
        const previousId = currentCompanyId.current
        queueMicrotask(() => {
          if (currentCompanyId.current === previousId)
            publishPartyActiveCompanyId(previousId, {
              skipGuard: true,
              persist: false,
            })
        })
        return
      }
      if (!requestPartyLeave({ kind: 'company', target: id })) {
        const previousId = currentCompanyId.current
        queueMicrotask(() => {
          if (currentCompanyId.current === previousId)
            publishPartyActiveCompanyId(previousId, {
              skipGuard: true,
              persist: false,
            })
        })
        return
      }
      if (!external && !publishPartyActiveCompanyId(id)) return
      currentCompanyId.current = String(id)
      setCompanyNotice('')
      setDeepOrder({ companyId: '', orderId: '' })
      setCompanyId(String(id))
    },
    [companies, fixedCompanyId]
  )
  useEffect(() => {
    if (companyInitialized.current) return
    // Read browser preference after hydration; the server renders the first allowed company.
    const frame = requestAnimationFrame(() => {
      companyInitialized.current = true
      const fallbackCompanyId = fixedCompanyId || readPartyActiveCompanyId(companies)
      const link = resolvePartyOrderDeepLink(new URL(window.location.href).searchParams, { companies, fixedCompanyId, fallbackCompanyId })
      const id = link.companyId
      currentCompanyId.current = id
      setCompanyId(id)
      setDeepOrder({ companyId: id, orderId: link.orderId })
      if (link.error) setCompanyNotice(link.error)
      setCompanyReady(true)
      if (id) publishPartyActiveCompanyId(id, { skipGuard: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [companies, fixedCompanyId])
  useEffect(() => {
    if (fixedCompanyId) return
    const onCompany = (event) =>
      chooseCompany(event.detail?.companyId, { external: true })
    const onStorage = (event) => {
      if (event.key === PARTY_ACTIVE_COMPANY_STORAGE_KEY && event.newValue)
        chooseCompany(event.newValue, { external: true })
    }
    window.addEventListener(PARTY_ACTIVE_COMPANY_EVENT, onCompany)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(PARTY_ACTIVE_COMPANY_EVENT, onCompany)
      window.removeEventListener('storage', onStorage)
    }
  }, [chooseCompany, fixedCompanyId])
  const activeId = fixedCompanyId || companyId
  return (
    <div
      data-company-id={activeId}
      className="mx-auto w-full max-w-7xl space-y-4 p-3 sm:p-5"
    >
      {companyNotice ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          {companyNotice}
        </p>
      ) : null}
      {!fixedCompanyId && companies.length > 1 ? (
        <label className="block text-sm text-slate-600">
          Компания
          <select
            className={control + ' cursor-pointer'}
            value={companyId}
            disabled={!companyReady}
            onChange={(event) => chooseCompany(event.target.value)}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {!companyReady ? (
        <p role="status" className="p-3 text-sm text-slate-500">
          Загрузка компании…
        </p>
      ) : activeId ? (
        <CompanyRoleOrders
          key={activeId}
          companyId={activeId}
          initialOrderId={deepOrder.companyId === activeId ? deepOrder.orderId : ''}
          legacyAdvancedPath={legacyAdvancedPath}
        />
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm">
          Нет компаний с доступом к заказам.
        </p>
      )}
    </div>
  )
}
