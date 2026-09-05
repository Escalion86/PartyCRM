import { serializePartyOrderPreparation } from '../helpers/partyOrderPreparation.js'

const fail = (message, status = 400) => Object.assign(new Error(message), { status })
const isValidObjectId = (value) => /^[a-f\d]{24}$/i.test(String(value || ''))
const text = (value, max) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const date = (value, label) => {
  if (!value) return null
  const parsed = new Date(value)
  if (!Number.isFinite(parsed.getTime())) throw fail(`Некорректная дата: ${label}`)
  return parsed
}

export const normalizePartyOrderPreparation = async ({ tenantId, staffId, current = {}, input, dependencies = {} }) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('Некорректная подготовка заказа')
  const allowed = new Set(['enabled', 'items', 'clientCheck', 'assembly', 'addressChange'])
  if (Object.keys(input).some((key) => !allowed.has(key))) throw fail('Недопустимое поле подготовки')
  if (!Array.isArray(input.items) || input.items.length > 100) throw fail('Чеклист должен содержать не более 100 пунктов')
  const seen = new Set()
  const now = new Date()
  const items = input.items.map((item) => {
    const itemId = isValidObjectId(item?._id) ? String(item._id) : undefined
    if (itemId && seen.has(itemId)) throw fail('Пункты чеклиста не должны повторяться')
    if (itemId) seen.add(itemId)
    const title = text(item?.title, 240)
    if (!title) throw fail('Укажите название пункта чеклиста')
    const responsibleStaffId = item?.responsibleStaffId ? String(item.responsibleStaffId) : null
    if (responsibleStaffId && !isValidObjectId(responsibleStaffId)) throw fail('Некорректный ответственный')
    const previous = (current.items || []).find((value) => String(value?._id) === itemId)
    const status = item?.status === 'done' ? 'done' : 'pending'
    return { ...(itemId ? { _id: itemId } : {}), title, responsibleStaffId, status, dueAt: date(item?.dueAt, 'срок пункта'), note: text(item?.note, 1000), completedAt: status === 'done' ? previous?.completedAt || now : null, completedByStaffId: status === 'done' ? previous?.completedByStaffId || staffId : null }
  })
  const clientStatus = String(input.clientCheck?.status || 'waiting')
  if (!['waiting', 'message_received', 'call_completed', 'not_required'].includes(clientStatus)) throw fail('Некорректный статус сверки с клиентом')
  const assemblyStatus = String(input.assembly?.status || 'not_started')
  if (!['not_started', 'planned', 'in_progress', 'ready'].includes(assemblyStatus)) throw fail('Некорректный статус сборки')
  const before = text(input.addressChange?.before, 1000)
  const after = text(input.addressChange?.after, 1000)
  if (Boolean(before) !== Boolean(after)) throw fail('Для изменения адреса укажите значения «было» и «стало»')
  const addressUnchanged = before === text(current.addressChange?.before, 1000) && after === text(current.addressChange?.after, 1000)
  const responsibleIds = [...new Set(items.map((item) => item.responsibleStaffId).filter(Boolean))]
  if (responsibleIds.length) {
    const Staff =
      dependencies.Staff ||
      (await (await import('./partyModels.js')).getPartyStaffModel())
    if (await Staff.countDocuments({ _id: { $in: responsibleIds }, tenantId, status: { $ne: 'archived' } }) !== responsibleIds.length) throw fail('Ответственный сотрудник не найден в компании')
  }
  const clientComplete = clientStatus !== 'waiting'
  const assemblyReady = assemblyStatus === 'ready'
  return {
    enabled: input.enabled === true, revision: Number(current.revision || 0) + 1, items,
    clientCheck: { status: clientStatus, checkedAt: clientComplete ? current.clientCheck?.checkedAt || now : null, checkedByStaffId: clientComplete ? current.clientCheck?.checkedByStaffId || staffId : null, note: text(input.clientCheck?.note, 1000) },
    assembly: { status: assemblyStatus, plannedAt: date(input.assembly?.plannedAt, 'сборка'), completedAt: assemblyReady ? current.assembly?.completedAt || now : null, completedByStaffId: assemblyReady ? current.assembly?.completedByStaffId || staffId : null, note: text(input.assembly?.note, 1000) },
    addressChange: { before, after, changedAt: before ? (addressUnchanged ? current.addressChange?.changedAt || now : now) : null, changedByStaffId: before ? (addressUnchanged ? current.addressChange?.changedByStaffId || staffId : staffId) : null, acknowledgements: addressUnchanged ? current.addressChange?.acknowledgements || [] : [] },
    updatedAt: now, updatedByStaffId: staffId,
  }
}

export const buildPerformerPreparationView = (order, staffId) => {
  const preparation = serializePartyOrderPreparation(order)
  const assigned = (order.assignedStaff || []).some((item) => String(item.staffId) === String(staffId))
  const responsible = preparation.items.some((item) => item.responsibleStaffId === String(staffId))
  if (!assigned && !responsible) throw fail('Нет доступа к подготовке этого заказа', 404)
  return { orderId: String(order._id), preparation, permissions: { itemIds: preparation.items.filter((item) => item.responsibleStaffId === String(staffId)).map((item) => item._id), canAcknowledgeAddress: assigned && preparation.readiness.summary.addressChanged } }
}

export const preparationError = fail
