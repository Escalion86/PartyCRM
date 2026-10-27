import { canPartyAccess } from './partyRolePermissions.js'
import { getPartyWorkflow } from './partyWorkflow.js'

export const PARTY_ORDER_LIST_PAGE_SIZE = 40
export const PARTY_ORDER_LIST_SCAN_LIMIT = 400
export const PARTY_ORDER_LIST_BATCH_SIZE = 100

const invalid = () => {
  throw Object.assign(new Error('Проверьте фильтры списка заказов и курсор страницы.'), { status: 400, code: 'partycrm_invalid_order_list_query' })
}
const forbidden = () => {
  throw Object.assign(new Error('Нет права использовать этот фильтр заказов.'), { status: 403, code: 'partycrm_order_list_filter_forbidden' })
}
const isoDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.exec(value || '')
  if (!match) invalid()
  const [, year, month, day, hour, minute, second] = match.map(Number)
  const lastDay = new Date(0)
  lastDay.setUTCFullYear(year, month, 0)
  if (month < 1 || month > 12 || day < 1 || day > lastDay.getUTCDate() || hour > 23 || minute > 59 || second > 59) invalid()
  const parsed = new Date(value)
  if (!Number.isFinite(+parsed)) invalid()
  return parsed
}
const searchFields = ['title', 'client.name', 'serviceTitle']
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const parsePartyOrderListQuery = (params, context) => {
  if (['dateFrom', 'dateTo', 'calendarCursor', 'preparation'].some((key) => params.has(key))) invalid()
  if (['view', 'q', 'stageId', 'quick', 'todayFrom', 'todayTo', 'listCursor'].some((key) => params.getAll(key).length > 1)) invalid()
  const q = (params.get('q') || '').trim()
  const stageId = params.get('stageId') || ''
  const quick = params.get('quick') || 'all'
  const cursor = params.get('listCursor') || ''
  if (q.length > 160 || stageId && !/^[a-z][a-z\d_-]{0,63}$/.test(stageId) || !['all', 'today', 'tasks', 'undated'].includes(quick) || cursor && !/^[a-f\d]{24}$/i.test(cursor)) invalid()
  const searchable = searchFields.filter((field) => canPartyAccess(context, { resource: `orders.${field}` }))
  if (q && !searchable.length || stageId && !canPartyAccess(context, { resource: 'orders.workflowStageId' }) || ['today', 'undated'].includes(quick) && !canPartyAccess(context, { resource: 'orders.eventDate' }) || quick === 'tasks' && !canPartyAccess(context, { resource: 'tasks' })) forbidden()
  const clauses = []
  if (q) clauses.push({ $or: searchable.map((field) => ({ [field]: { $regex: escapeRegex(q), $options: 'i' } })) })
  if (stageId) clauses.push(stageId === getPartyWorkflow(context.company).initialStageId
    ? { $or: [{ workflowStageId: stageId }, { workflowStageId: null }, { workflowStageId: '' }] }
    : { workflowStageId: stageId })
  if (quick === 'today') {
    const from = isoDate(params.get('todayFrom')), to = isoDate(params.get('todayTo'))
    if (+to <= +from || +to - +from > 26 * 3600000) invalid()
    clauses.push({ eventDate: { $gte: from, $lt: to } })
  } else if (params.has('todayFrom') || params.has('todayTo')) invalid()
  if (quick === 'undated') clauses.push({ eventDate: null })
  return { quick, cursor: cursor.toLowerCase(), clauses }
}
