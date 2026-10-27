import { NextResponse } from 'next/server'
import { canPartyAccess, getPartyDefaultRolePermissions, normalizePartyRolePermissions, PARTY_ROLE_PERMISSIONS } from '@helpers/partyRolePermissions'
import { getPartyRequestContext, isValidObjectId, partyError } from './partyApi'
import { getPartyRoleModel, getPartyStaffModel, getPartyLocationModel } from './partyModels'
import { getPartyAuditActor } from './partyAuditLogCore'
import { getPartyAuditLogModel } from './partyModels'

const fail = (status, code, message) => { throw Object.assign(new Error(message), { status, code }) }
const builtins = [
  ['owner', 'Владелец'], ['admin', 'Администратор'], ['performer', 'Исполнитель'], ['location_owner', 'Владелец площадки'],
]

export const ensurePartyBuiltinRoles = async (tenantId) => {
  const Roles = await getPartyRoleModel()
  for (const [systemKey, title] of builtins) {
    try {
      await Roles.updateOne({ tenantId, systemKey }, { $setOnInsert: {
        tenantId, systemKey, title, baseRole: systemKey,
        permissions: getPartyDefaultRolePermissions(systemKey),
        orderScope: { stageIds: [], statuses: [], locationIds: [], includeUnlocated: systemKey !== 'location_owner', assignedOnly: systemKey === 'performer' },
        revision: 0, active: true,
      } }, { upsert: true })
    } catch (error) { if (error?.code !== 11000) throw error }
  }
  return Roles
}

export const buildPartyPositionStaffFilter = (position) => position?.systemKey
  ? { $or: [{ positionId: position._id }, { positionId: null, role: position.systemKey }] }
  : { positionId: position?._id }

export const getPartyStaffPositionPatch = async ({ context, positionId, targetStaff = null }) => {
  if (!['owner', 'admin'].includes(context.role) || !canPartyAccess(context, { resource: 'staff', action: 'edit' })) fail(403, 'partycrm_forbidden', 'Недостаточно прав для изменения должности')
  if (positionId === null || positionId === '') return { positionId: null }
  if (!isValidObjectId(positionId)) fail(400, 'partycrm_invalid_position', 'Выберите должность')
  const Roles = await getPartyRoleModel()
  const position = await Roles.findOne({ _id: positionId, tenantId: context.tenantId, active: true }).lean()
  if (!position) fail(400, 'partycrm_invalid_position', 'Должность недоступна в этой компании')
  if (position.baseRole === 'owner' && context.role !== 'owner') fail(403, 'partycrm_only_owner_can_transfer', 'Только владелец может передать права владельца')
  if (context.role !== 'owner') {
    if (targetStaff && String(targetStaff._id) === String(context.staff._id)) fail(403, 'partycrm_self_position_change', 'Свою должность может изменить только владелец')
    if (targetStaff?.role === 'owner' || position.baseRole === 'owner') fail(403, 'partycrm_position_assignment_forbidden', 'Эту должность может назначить только владелец')
    assertDelegatedPermissions(context, position.permissions)
  }
  return { positionId: position._id, role: position.baseRole }
}

const assertDelegatedPermissions = (context, permissions) => {
  for (const [resource, level] of Object.entries(permissions)) {
    if (level !== 'hidden' && !canPartyAccess(context, { resource, action: level === 'read' ? 'read' : 'edit' })) fail(403, 'partycrm_role_escalation', 'Нельзя предоставить полномочия, которых нет у вашей должности')
  }
}

const parseRoleBody = async (body, context, previous = null) => {
  if (!body || Array.isArray(body) || Object.keys(body).some((key) => !['title', 'description', 'permissions', 'orderScope', 'active', 'expectedRevision'].includes(key))) fail(400, 'partycrm_invalid_role', 'Некорректные настройки должности')
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title || title.length > 100 || typeof body.description !== 'string' || body.description.length > 1000) fail(400, 'partycrm_invalid_role', 'Укажите название до 100 символов и описание до 1000 символов')
  const permissions = normalizePartyRolePermissions(body.permissions)
  if (!body.permissions || Array.isArray(body.permissions) || Object.keys(permissions).length !== Object.keys(body.permissions).length) fail(400, 'partycrm_invalid_permissions', 'Проверьте права должности')
  const scope = body.orderScope
  if (!scope || Array.isArray(scope) || Object.keys(scope).some((key) => !['stageIds', 'statuses', 'locationIds', 'includeUnlocated', 'assignedOnly'].includes(key)) || !['stageIds', 'statuses', 'locationIds'].every((key) => Array.isArray(scope[key]) && scope[key].length <= 100) || typeof scope.includeUnlocated !== 'boolean' || typeof scope.assignedOnly !== 'boolean') fail(400, 'partycrm_invalid_scope', 'Проверьте область доступа к заказам')
  if (scope.stageIds.some((value) => typeof value !== 'string' || !value || value.length > 80) || scope.statuses.some((value) => !['draft', 'active', 'canceled', 'closed'].includes(value)) || scope.locationIds.some((value) => !isValidObjectId(value))) fail(400, 'partycrm_invalid_scope', 'Некорректный этап, статус или площадка')
  if (scope.locationIds.length) {
    const Locations = await getPartyLocationModel()
    const count = await Locations.countDocuments({ _id: { $in: scope.locationIds }, tenantId: context.tenantId, status: { $ne: 'archived' } })
    if (count !== new Set(scope.locationIds).size) fail(400, 'partycrm_invalid_scope', 'Площадка недоступна в этой компании')
  }
  if (context.role !== 'owner') {
    if (previous?.systemKey || String(context.position?._id) === String(previous?._id)) fail(403, 'partycrm_role_escalation', 'Системную или собственную должность может менять только владелец')
    assertDelegatedPermissions(context, permissions)
    const ownScope = context.position?.orderScope
    if (ownScope?.stageIds?.length && (!scope.stageIds.length || scope.stageIds.some((value) => !ownScope.stageIds.includes(value)))) fail(403, 'partycrm_role_escalation', 'Нельзя расширить доступ за пределы своих этапов')
    if (ownScope?.statuses?.length && (!scope.statuses.length || scope.statuses.some((value) => !ownScope.statuses.includes(value)))) fail(403, 'partycrm_role_escalation', 'Нельзя расширить доступ за пределы своих статусов')
    if (ownScope?.locationIds?.length && (!scope.locationIds.length || scope.locationIds.some((value) => !ownScope.locationIds.map(String).includes(value)))) fail(403, 'partycrm_role_escalation', 'Нельзя расширить доступ за пределы своих площадок')
    if (ownScope?.assignedOnly && !scope.assignedOnly || ownScope?.includeUnlocated === false && scope.includeUnlocated) fail(403, 'partycrm_role_escalation', 'Нельзя расширить свою область доступа')
  }
  return { title, description: body.description.trim(), permissions, orderScope: { ...scope, stageIds: [...new Set(scope.stageIds)], statuses: [...new Set(scope.statuses)], locationIds: [...new Set(scope.locationIds)] }, active: body.active !== false }
}

const auditRole = async (context, role, action) => {
  const Audit = await getPartyAuditLogModel()
  await Audit.create({ tenantId: context.tenantId, ...getPartyAuditActor(context), action: role.revision ? 'role_updated' : 'role_created', entityType: 'role', entityId: role._id, entityTitle: role.title, summary: action, metadata: { positionId: String(role._id), revision: role.revision } })
}

export const partyRoleRoute = (handler, { write = false } = {}) => async (req, route) => {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true, permissionAware: true })
  if (error) return error
  if (write && !canPartyAccess(context, { resource: 'roles.manage', action: 'edit' })) return partyError(403, 'partycrm_forbidden', 'Управление должностями доступно руководителю', 'permission')
  try { return await handler(req, context, route) }
  catch (error) { return partyError(error.status || 500, error.status ? error.code : 'partycrm_role_failed', error.status ? error.message : 'Не удалось сохранить настройки должности', error.status === 403 ? 'permission' : 'validation') }
}

export const listPartyRoles = async (context) => {
  const Roles = await ensurePartyBuiltinRoles(context.tenantId)
  return Roles.find({ tenantId: context.tenantId }).sort({ systemKey: -1, title: 1 }).lean()
}

export const createPartyRole = async (context, body) => {
  const payload = await parseRoleBody(body, context)
  const Roles = await getPartyRoleModel()
  const role = await Roles.create({ ...payload, tenantId: context.tenantId, systemKey: null, baseRole: 'performer' })
  await auditRole(context, role, 'Создал должность')
  return role
}

export const updatePartyRole = async (context, roleId, body) => {
  if (!isValidObjectId(roleId)) fail(400, 'partycrm_invalid_role_id', 'Некорректная должность')
  if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0) fail(400, 'partycrm_role_revision_required', 'Обновите должность перед сохранением')
  const Roles = await getPartyRoleModel()
  const previous = await Roles.findOne({ _id: roleId, tenantId: context.tenantId }).lean()
  if (!previous) fail(404, 'partycrm_role_not_found', 'Должность не найдена')
  if (previous.systemKey === 'owner') fail(403, 'partycrm_owner_role_protected', 'Системные полномочия владельца нельзя ограничить')
  const payload = await parseRoleBody(body, context, previous)
  if (!payload.active) {
    if (previous.systemKey) fail(400, 'partycrm_builtin_role_protected', 'Системную должность нельзя отключить')
    const Staff = await getPartyStaffModel()
    if (await Staff.exists({ tenantId: context.tenantId, status: { $ne: 'archived' }, ...buildPartyPositionStaffFilter(previous) })) fail(409, 'partycrm_role_in_use', 'Сначала назначьте сотрудникам другую должность')
  }
  const role = await Roles.findOneAndUpdate({ _id: roleId, tenantId: context.tenantId, revision: body.expectedRevision }, { $set: payload, $inc: { revision: 1 } }, { returnDocument: 'after', runValidators: true }).lean()
  if (!role) fail(409, 'partycrm_role_revision_conflict', 'Должность уже изменена. Обновите настройки.')
  await auditRole(context, role, 'Изменил права должности')
  return role
}

export const partyRoleResponse = (data, status = 200, extra = {}) => NextResponse.json({ success: true, data, registry: PARTY_ROLE_PERMISSIONS, ...extra }, { status })
