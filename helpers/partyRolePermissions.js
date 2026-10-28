import { getPartyWorkflow } from './partyWorkflow.js'

export const PARTY_ROLE_PERMISSION_GROUPS = Object.freeze([
  { key: 'orders', label: 'Заказы' },
  { key: 'contacts', label: 'Клиенты и контакты заказа' },
  { key: 'finance', label: 'Финансы' },
  { key: 'operations', label: 'Работа команды' },
  { key: 'company', label: 'Разделы компании' },
  { key: 'ticketing', label: 'Билеты и посещения' },
])

const permission = (key, label, group = 'orders', actionOnly = false, optional = false) => ({ key, label, group, actionOnly, ...(optional ? { optional: true } : {}) })
export const PARTY_ROLE_PERMISSIONS = Object.freeze([
  permission('orders', 'Список и просмотр заказов'),
  permission('orders.create', 'Создание заказа', 'orders', true),
  permission('orders.delete', 'Удаление и отмена заказа', 'orders', true),
  permission('orders.transition', 'Перевод между этапами', 'orders', true),
  permission('orders.title', 'Название'),
  permission('orders.status', 'Системный статус'),
  permission('orders.workflowStageId', 'Рабочий этап'),
  permission('orders.eventDate', 'Дата и время начала'),
  permission('orders.dateEnd', 'Дата и время окончания'),
  permission('orders.durationMinutes', 'Продолжительность'),
  permission('orders.placeType', 'Тип места проведения'),
  permission('orders.locationId', 'Площадка'),
  permission('orders.customAddress', 'Адрес выезда'),
  permission('orders.clientAddress', 'Подробности адреса'),
  permission('orders.servicesIds', 'Услуги'),
  permission('orders.serviceTitle', 'Название услуги'),
  permission('orders.eventBrief', 'Бриф'),
  permission('orders.preparation', 'Подготовка'),
  permission('orders.responsibleStaffId', 'Ответственный менеджер'),
  permission('orders.adminComment', 'Внутренний комментарий'),
  permission('orders.performerComment', 'Комментарий для команды'),
  permission('orders.leadSource', 'Источник заявки'),
  permission('orders.clientId', 'Клиент', 'contacts'),
  permission('orders.client.name', 'Имя клиента', 'contacts'),
  permission('orders.client.phone', 'Телефон клиента', 'contacts'),
  permission('orders.client.email', 'Email клиента', 'contacts'),
  permission('orders.contactRoles', 'Роли контактов и правила связи', 'contacts'),
  permission('orders.otherContacts', 'Дополнительные контакты', 'contacts'),
  permission('finance.clientAmount', 'Стоимость для клиента', 'finance'),
  permission('finance.payments', 'Поступления от клиента', 'finance'),
  permission('finance.payouts', 'Выплаты исполнителям', 'finance'),
  permission('finance.ownPayout', 'Собственный гонорар исполнителя', 'finance'),
  permission('finance.expenses', 'Расходы', 'finance'),
  permission('finance.margin', 'Маржа', 'finance'),
  permission('orders.assignedStaff', 'Команда заказа', 'operations'),
  permission('orders.ownAssignment', 'Собственное назначение исполнителя', 'operations'),
  permission('orders.reportCoordinatorStaffId', 'Координатор отчётов', 'operations'),
  permission('inventory', 'Реквизит и склад', 'operations'),
  permission('inventory.catalog', 'Справочник реквизита и нормы услуг', 'operations'),
  permission('inventory.stock', 'Остатки и доступное количество реквизита', 'operations'),
  permission('inventory.reservations', 'Резервы реквизита заказов', 'operations'),
  permission('inventory.movements', 'Выдача и возврат реквизита', 'operations', true),
  permission('reports', 'Отчёты', 'operations'),
  permission('reports.general', 'Отчёты: общие вопросы', 'operations'),
  permission('reports.creative', 'Отчёты: творческая часть', 'operations'),
  permission('reports.inventory', 'Отчёты: реквизит', 'operations'),
  permission('reports.finance', 'Отчёты: финансовая часть', 'operations'),
  permission('reports.review', 'Проверка отчётов', 'operations', true),
  permission('tasks', 'Задачи', 'operations'),
  ...['create', 'edit', 'assign', 'complete', 'cancel'].map((action, index) => permission(`tasks.${action}`, ['Создание задач', 'Изменение задач', 'Назначение задач', 'Выполнение задач', 'Отмена задач'][index], 'operations', true)),
  permission('clients', 'Справочник клиентов', 'company'),
  permission('clients.create', 'Создание клиента', 'company', true),
  permission('staff', 'Сотрудники', 'company'),
  permission('staff.phone', 'Контакты сотрудников команды', 'company'),
  permission('locations', 'Площадки', 'company'),
  permission('services', 'Услуги', 'company'),
  permission('inbox', 'Входящие и переписка', 'company'),
  permission('documents', 'Документы', 'company'),
  permission('history', 'История действий', 'company'),
  permission('roles.manage', 'Управление должностями', 'company', true),
  permission('brief.manage', 'Настройка формы брифа', 'company', true),
  permission('orders.fulfillment', 'Проведение мероприятия', 'orders', false, true),
  permission('tickets', 'Просмотр билетов и посещений', 'ticketing', false, true),
  permission('tickets.manage', 'Настройка программ и сеансов', 'ticketing', true, true),
  permission('tickets.sell', 'Продажа и бронирование билетов', 'ticketing', true, true),
  permission('tickets.payments', 'Запись оплаты билетов', 'ticketing', true, true),
  permission('tickets.refund', 'Возвраты билетов', 'ticketing', true, true),
  permission('tickets.checkin', 'Регистрация посещений', 'ticketing', true, true),
  permission('tickets.contacts', 'Контакты покупателей билетов', 'ticketing', false, true),
  permission('tickets.finance', 'Финансовая история и аналитика билетов', 'ticketing', false, true),
  permission('tickets.discounts', 'Ручные скидки на билеты', 'ticketing', true, true),
])

const keys = new Set(PARTY_ROLE_PERMISSIONS.map(({ key }) => key))
const legacyPermissionKeys = new Set(PARTY_ROLE_PERMISSIONS.filter(({ optional }) => !optional).map(({ key }) => key))
const levels = new Set(['hidden', 'read', 'edit'])
const manager = (context) => context?.role === 'owner' || (context?.role === 'admin' && !context?.position)
const id = (value) => value == null ? '' : String(value)

export const getPartyDefaultRolePermissions = (role = 'performer') => {
  const output = Object.fromEntries(PARTY_ROLE_PERMISSIONS.map(({ key }) => [key, ['owner', 'admin'].includes(role) ? 'edit' : 'hidden']))
  output.tasks = 'read'
  output['tasks.create'] = 'edit'
  output['tasks.complete'] = 'edit'
  if (role === 'performer') {
    for (const key of ['orders', 'orders.title', 'orders.eventDate', 'orders.dateEnd', 'orders.durationMinutes', 'orders.placeType', 'orders.locationId', 'orders.customAddress', 'orders.clientAddress', 'orders.serviceTitle', 'orders.servicesIds', 'orders.performerComment', 'orders.client.name', 'orders.client.phone', 'reports']) output[key] = 'read'
    output['orders.assignedStaff'] = 'read'
    output['staff.phone'] = 'read'
    output['reports.general'] = 'edit'
    output['reports.creative'] = 'edit'
    output['orders.ownAssignment'] = 'edit'
    output['finance.ownPayout'] = 'read'
  }
  return output
}

export const normalizePartyRolePermissions = (value) => Object.fromEntries(
  Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {}).filter(([key, level]) => keys.has(key) && levels.has(level))
)

export const isPartyRestrictedManagementContext = (context) => {
  if (context?.role !== 'admin' || !context.position) return false
  const baseline = getPartyDefaultRolePermissions('admin')
  const rank = { hidden: 0, read: 1, edit: 2 }
  if (Object.entries(baseline).some(([key, level]) => {
    if (!legacyPermissionKeys.has(key)) return false
    const granted = context.position.permissions?.[key]
    return (levels.has(granted) ? rank[granted] : 0) < rank[level]
  })) return true
  const scope = context.position.orderScope || {}
  return Boolean(scope.stageIds?.length || scope.statuses?.length || scope.locationIds?.length || scope.assignedOnly || scope.includeUnlocated === false)
}

export const getPartyOrderStageId = (order, context) => id(order?.workflowStageId || order?.stageId || getPartyWorkflow(context?.company).initialStageId)

export const isPartyOrderInScope = (context, order) => {
  if (!order || !context?.tenantId || (order.tenantId && id(order.tenantId) !== id(context.tenantId))) return false
  if (manager(context)) return true
  const scope = context.position?.orderScope || {}
  if (scope.statuses?.length && !scope.statuses.includes(order.status)) return false
  if (scope.stageIds?.length && !scope.stageIds.map(id).includes(getPartyOrderStageId(order, context))) return false
  const locationId = id(order.locationId)
  if (!locationId && scope.includeUnlocated === false) return false
  if (locationId && scope.locationIds?.length && !scope.locationIds.map(id).includes(locationId)) return false
  if (context.role === 'location_owner' && !(context.staff?.locationIds || []).map(id).includes(locationId)) return false
  const assignedOnly = scope.assignedOnly ?? (context.role === 'performer' && !context.position)
  if (assignedOnly && !(order.assignedStaff || []).some((staff) => id(staff.staffId) === id(context.staff?._id)) && id(order.responsibleStaffId) !== id(context.staff?._id)) return false
  return true
}

export const canPartyAccess = (context, { resource, action = 'read', field, order } = {}) => {
  const staff = context?.staff
  if (!context?.tenantId || !staff || staff.status !== 'active' || id(staff.tenantId) !== id(context.tenantId) || context.role !== staff.role) return false
  if ((staff.positionId && !context.position) || context.position?.active === false || (context.position?.tenantId && id(context.position.tenantId) !== id(context.tenantId))) return false
  if (order && !isPartyOrderInScope(context, order)) return false
  let key = field ? `${resource}.${field}` : resource
  if (resource === 'tasks' && ['create', 'edit', 'assign', 'complete', 'cancel'].includes(action)) key = `tasks.${action}`
  if (resource === 'orders' && ['create', 'delete', 'transition'].includes(action)) key = `orders.${action}`
  if (!keys.has(key)) return false
  if (key === 'roles.manage' && !['owner', 'admin'].includes(context.role)) return false
  if (manager(context)) return true
  const permissions = context.position?.permissions || getPartyDefaultRolePermissions(context.role)
  const level = permissions[key] || 'hidden'
  return ['read', 'view', 'list'].includes(action) ? ['read', 'edit'].includes(level) : level === 'edit'
}

export const buildPartyOrderAccessFilter = (context) => {
  const tenantId = context?.tenantId
  if (!canPartyAccess(context, { resource: 'orders' })) return { tenantId, _id: { $in: [] } }
  if (manager(context)) return { tenantId }
  const scope = context.position?.orderScope || {}
  const clauses = []
  if (scope.statuses?.length) clauses.push({ status: { $in: scope.statuses } })
  if (scope.stageIds?.length) {
    const initialStageId = getPartyWorkflow(context.company).initialStageId
    clauses.push(scope.stageIds.includes(initialStageId)
      ? { $or: [{ workflowStageId: { $in: scope.stageIds } }, { workflowStageId: null }, { workflowStageId: '' }] }
      : { workflowStageId: { $in: scope.stageIds } })
  }
  const locationIds = context.role === 'location_owner'
    ? (context.staff?.locationIds || []).filter((value) => !scope.locationIds?.length || scope.locationIds.map(id).includes(id(value)))
    : scope.locationIds
  if (locationIds?.length) clauses.push(scope.includeUnlocated === false || context.role === 'location_owner' ? { locationId: { $in: locationIds } } : { $or: [{ locationId: { $in: locationIds } }, { locationId: null }] })
  else if (context.role === 'location_owner') clauses.push({ _id: { $in: [] } })
  else if (scope.includeUnlocated === false) clauses.push({ locationId: { $ne: null } })
  if (scope.assignedOnly ?? (context.role === 'performer' && !context.position)) clauses.push({ $or: [{ 'assignedStaff.staffId': context.staff._id }, { responsibleStaffId: context.staff._id }] })
  return { tenantId, ...(clauses.length ? { $and: clauses } : {}) }
}

const orderFieldResource = (field) => {
  if (field === 'reportSummary') return 'reports'
  if (field === 'taskSummary') return 'tasks'
  if (field === 'payoutRecipients') return 'finance.payouts'
  if (['contractAmount', 'orderItems', 'agreedProposal', 'clientPayment.totalAmount'].includes(field)) return 'finance.clientAmount'
  if (field.startsWith('clientPayment') || field === 'transactions') return 'finance.payments'
  if (field.startsWith('assignedStaff.') && /payout/.test(field)) return 'finance.payouts'
  if (field.startsWith('assignedStaff')) return 'orders.assignedStaff'
  if (field.startsWith('additionalEvents')) return 'tasks'
  if (field.startsWith('inventory')) return 'inventory'
  if (field === 'leadSourceLabel' || field === 'leadMeta') return 'orders.leadSource'
  if (field.startsWith('client.')) return `orders.${field}`
  return `orders.${field.split('.')[0]}`
}

const operationalFields = ['_id', 'tenantId', 'createdAt', 'updatedAt', '__v', 'commercialRevision', 'reportCoordinatorRevision', 'sharedLocationRevision']
export const filterPartyOrderForAccess = (context, order) => {
  if (!canPartyAccess(context, { resource: 'orders', order })) return null
  const internalFields = ['createRequestKey', 'createRequestActorId', 'createRequestFingerprint']
  if (manager(context)) return Object.fromEntries(Object.entries(order).filter(([field]) => !internalFields.includes(field)))
  const output = {}
  for (const [field, value] of Object.entries(order)) {
    if (internalFields.includes(field)) continue
    if (field === 'fulfillment') {
      if (canPartyAccess(context, { resource: 'orders.fulfillment', order }))
        output.fulfillment = value ? { performedAt: value.performedAt, recordedAt: value.recordedAt, ...(canPartyAccess(context, { resource: 'finance.clientAmount', order }) ? { amountKopecks: value.amountKopecks } : {}) } : null
      continue
    }
    if (field === 'additionalEvents') continue // Canonical task API/summaries enforce each task's assignments.
    if (field === 'assignedStaff' && !canPartyAccess(context, { resource: 'orders.assignedStaff', order }) && canPartyAccess(context, { resource: 'finance.payouts', order })) {
      output.payoutRecipients = (value || []).map((assignment) => ({ staffId: assignment.staffId, payoutAmount: assignment.payoutAmount, payoutStatus: assignment.payoutStatus }))
      continue
    }
    if (operationalFields.includes(field)) { output[field] = value; continue }
    if (field === 'client') {
      const client = Object.fromEntries(Object.entries(value || {}).filter(([key]) => canPartyAccess(context, { resource: orderFieldResource(`client.${key}`), order })))
      if (Object.keys(client).length) output.client = client
      continue
    }
    if (field === 'clientPayment') {
      const safe = {}
      if (canPartyAccess(context, { resource: 'finance.payments', order })) Object.assign(safe, { prepaidAmount: value?.prepaidAmount, status: value?.status })
      if (canPartyAccess(context, { resource: 'finance.clientAmount', order })) safe.totalAmount = value?.totalAmount
      if (Object.keys(safe).length) output.clientPayment = safe
      continue
    }
    if (field === 'transactions') {
      const transactions = (value || []).filter((transaction) => canPartyAccess(context, { resource: transaction.category === 'payout' || (transaction.staffId && !transaction.category && transaction.type === 'expense') ? 'finance.payouts' : transaction.type === 'expense' ? 'finance.expenses' : 'finance.payments', order }))
      if (transactions.length || canPartyAccess(context, { resource: 'finance.payments', order }) || canPartyAccess(context, { resource: 'finance.expenses', order })) output.transactions = transactions
      continue
    }
    if (!canPartyAccess(context, { resource: orderFieldResource(field), order })) continue
    if (field === 'eventBrief' && value && !canPartyAccess(context, { resource: 'orders.servicesIds', order })) {
      const snapshot = value.templateSnapshot
      const withoutConditions = (fields) => Array.isArray(fields) ? fields.map(({ serviceIds: _serviceIds, ...question }) => question) : fields
      output.eventBrief = { ...value, ...(snapshot ? { templateSnapshot: { ...snapshot, fields: withoutConditions(snapshot.fields), retiredFields: withoutConditions(snapshot.retiredFields) } } : {}), ...(Array.isArray(value.archivedAnswers) ? { archivedAnswers: value.archivedAnswers.map((answer) => ({ ...answer, ...(answer.field ? { field: withoutConditions([answer.field])[0] } : {}) })) } : {}) }
      continue
    }
    if (field === 'assignedStaff') {
      output.assignedStaff = (value || []).map((assignment) => {
        const safe = { staffId: assignment.staffId, role: assignment.role, confirmationStatus: assignment.confirmationStatus }
        if (canPartyAccess(context, { resource: 'finance.payouts', order })) Object.assign(safe, { payoutAmount: assignment.payoutAmount, payoutStatus: assignment.payoutStatus })
        return safe
      })
    } else output[field] = value
  }
  // A projected order may hide its system status. Expose only the capability
  // needed by stage controls, calculated from canonical server data each time.
  if (canPartyAccess(context, { resource: 'orders.workflowStageId', order }) && canPartyAccess(context, { resource: 'orders', action: 'transition', order })) {
    output.workflowTransitionAvailable = ['draft', 'active'].includes(order.status)
  }
  return output
}

const leaves = (value, prefix = '') => Object.entries(value || {}).flatMap(([key, entry]) => {
  const path = prefix ? `${prefix}.${key}` : key
  if (entry && typeof entry === 'object' && !Array.isArray(entry) && !(entry instanceof Date)) return leaves(entry, path)
  return [path]
})

export const guardPartyOrderPatch = (context, patch, order) => {
  if (!canPartyAccess(context, { resource: 'orders', action: 'read', order })) return { ok: false, forbiddenFields: ['orders'] }
  const forbiddenFields = leaves(patch).filter((field) => {
    if (['_id', 'tenantId', 'commercialRevision', 'expectedVersion', 'expectedRevision'].includes(field)) return false
    if (field === 'workflowStageId' && !canPartyAccess(context, { resource: 'orders', action: 'transition', order })) return true
    if (field === 'assignedStaff') {
      const changesServerFields = (patch.assignedStaff || []).some((assignment) => {
        const previous = (order?.assignedStaff || []).find((item) => id(item.staffId) === id(assignment.staffId))
        return Object.keys(assignment).some((key) => !['staffId', 'role', 'payoutAmount', 'payoutStatus'].includes(key) && JSON.stringify(assignment[key]) !== JSON.stringify(previous?.[key]))
      })
      if (changesServerFields) return true
      const payoutsChanged = (patch.assignedStaff || []).some((assignment) => {
        const previous = (order?.assignedStaff || []).find((item) => id(item.staffId) === id(assignment.staffId))
        return ['payoutAmount', 'payoutStatus'].some((key) => Object.hasOwn(assignment, key) && assignment[key] !== previous?.[key])
      })
      if (payoutsChanged && !canPartyAccess(context, { resource: 'finance.payouts', action: 'edit', order })) return true
      const teamChanged = (patch.assignedStaff || []).length !== (order?.assignedStaff || []).length || (patch.assignedStaff || []).some((assignment) => {
        const previous = (order?.assignedStaff || []).find((item) => id(item.staffId) === id(assignment.staffId))
        return !previous || (Object.hasOwn(assignment, 'role') && assignment.role !== previous.role)
      })
      if (!teamChanged) return false
    }
    return !canPartyAccess(context, { resource: orderFieldResource(field), action: 'edit', order })
  })
  return { ok: forbiddenFields.length === 0, forbiddenFields }
}
