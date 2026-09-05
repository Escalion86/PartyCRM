const asArray = (value) => Array.isArray(value) ? value : []
const id = (value) => String(value || '')
const iso = (value) => value && Number.isFinite(new Date(value).getTime()) ? new Date(value).toISOString() : null

export const getPartyOrderPreparationReadiness = (order = {}) => {
  const preparation = order.preparation || {}
  const enabled = preparation.enabled === true
  const items = asArray(preparation.items)
  const pendingItems = items.filter((item) => item?.status !== 'done')
  const clientCheckComplete = ['message_received', 'call_completed', 'not_required'].includes(preparation.clientCheck?.status)
  const assemblyReady = preparation.assembly?.status === 'ready'
  const assignedIds = new Set(asArray(order.assignedStaff).map((item) => id(item?.staffId)).filter(Boolean))
  const acknowledgedIds = new Set(asArray(preparation.addressChange?.acknowledgements).map((item) => id(item?.staffId)))
  const addressChanged = Boolean(preparation.addressChange?.before || preparation.addressChange?.after)
  const missingAddressAcknowledgementCount = addressChanged ? [...assignedIds].filter((staffId) => !acknowledgedIds.has(staffId)).length : 0
  const blockers = []
  if (enabled && pendingItems.length) blockers.push({ code: 'preparation_checklist', message: `Незавершённые пункты подготовки: ${pendingItems.length}` })
  if (enabled && !clientCheckComplete) blockers.push({ code: 'client_check_pending', message: 'Не завершена сверка с клиентом накануне' })
  if (enabled && !assemblyReady) blockers.push({ code: 'assembly_not_ready', message: 'Сборка заказа не отмечена готовой' })
  if (enabled && missingAddressAcknowledgementCount) blockers.push({ code: 'address_acknowledgement_pending', message: `Не ознакомились с изменением адреса: ${missingAddressAcknowledgementCount}` })
  const assignedAcknowledgementCount = [...assignedIds].filter((staffId) => acknowledgedIds.has(staffId)).length
  return { enabled, ok: blockers.length === 0, blockers, summary: { totalItems: items.length, pendingItems: pendingItems.length, clientCheckStatus: preparation.clientCheck?.status || 'waiting', clientCheckComplete, assemblyStatus: preparation.assembly?.status || 'not_started', assemblyReady, addressChanged, assignedAcknowledgementCount, missingAddressAcknowledgementCount } }
}

export const serializePartyOrderPreparation = (order = {}, { includeNotes = true } = {}) => {
  const source = order.preparation || {}
  const cleanNote = (value) => includeNotes && typeof value === 'string' ? value : ''
  return {
    enabled: source.enabled === true, revision: Number(source.revision || 0),
    items: asArray(source.items).map((item) => ({ _id: id(item?._id), title: String(item?.title || ''), status: item?.status === 'done' ? 'done' : 'pending', responsibleStaffId: item?.responsibleStaffId ? id(item.responsibleStaffId) : null, dueAt: iso(item?.dueAt), completedAt: iso(item?.completedAt), completedByStaffId: item?.completedByStaffId ? id(item.completedByStaffId) : null, note: cleanNote(item?.note) })),
    clientCheck: { status: source.clientCheck?.status || 'waiting', checkedAt: iso(source.clientCheck?.checkedAt), checkedByStaffId: source.clientCheck?.checkedByStaffId ? id(source.clientCheck.checkedByStaffId) : null, note: cleanNote(source.clientCheck?.note) },
    assembly: { status: source.assembly?.status || 'not_started', plannedAt: iso(source.assembly?.plannedAt), completedAt: iso(source.assembly?.completedAt), completedByStaffId: source.assembly?.completedByStaffId ? id(source.assembly.completedByStaffId) : null, note: cleanNote(source.assembly?.note) },
    addressChange: { before: String(source.addressChange?.before || ''), after: String(source.addressChange?.after || ''), changedAt: iso(source.addressChange?.changedAt), changedByStaffId: source.addressChange?.changedByStaffId ? id(source.addressChange.changedByStaffId) : null, acknowledgements: asArray(source.addressChange?.acknowledgements).map((item) => ({ staffId: id(item?.staffId), acknowledgedAt: iso(item?.acknowledgedAt) })) },
    updatedAt: iso(source.updatedAt), updatedByStaffId: source.updatedByStaffId ? id(source.updatedByStaffId) : null,
    readiness: getPartyOrderPreparationReadiness(order),
  }
}

export const buildPartyOpenPreparationFilter = () => ({
  'preparation.enabled': true,
  $or: [
    { 'preparation.items': { $elemMatch: { status: { $ne: 'done' } } } },
    { 'preparation.clientCheck.status': 'waiting' },
    { 'preparation.assembly.status': { $ne: 'ready' } },
    { $and: [{ 'preparation.addressChange.before': { $nin: ['', null] } }, { 'preparation.addressChange.after': { $nin: ['', null] } }, { $expr: { $gt: [{ $size: { $setDifference: [{ $map: { input: { $ifNull: ['$assignedStaff', []] }, as: 'assignment', in: '$$assignment.staffId' } }, { $map: { input: { $ifNull: ['$preparation.addressChange.acknowledgements', []] }, as: 'ack', in: '$$ack.staffId' } }] } }, 0] } }] },
  ],
})
