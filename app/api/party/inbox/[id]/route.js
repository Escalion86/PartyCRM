import { NextResponse } from 'next/server'
import { getPartyRequestContext, isValidObjectId, partyError } from '@server/partyApi'
import { mapPartyInboxItem, partyInboxSources } from '@server/partyInbox'
import { getPartyInboxStateModel } from '@server/partyInboxModels'
import { getPartyClientModel, getPartyOrderModel, getPartyStaffModel } from '@server/partyModels'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { parsePartyInboxPatch, buildPartyInboxWorkflowUpdate } from '@helpers/partyInboxCore'

const safeUrl = (value) => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : '' } catch { return '' }
}
const inboxSourceFields = '_id direction clientId orderId linkedClientId linkedOrderId clientName lastMessageText lastMessageAt startedAt phone aiSummary createdAt'
const latestIncomingToken = async (Messages, tenantId, sourceId) => {
  const latest = await Messages.findOne({ tenantId, conversationId: sourceId, direction: 'incoming' }).select('_id').sort({ sentAt: -1, _id: -1 }).lean()
  return latest ? String(latest._id) : ''
}

export async function GET(req, { params }) {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error
  const [channel, sourceId, extra] = String((await params)?.id || '').split(':')
  if (!Object.hasOwn(partyInboxSources, channel) || !isValidObjectId(sourceId) || extra) return partyError(400, 'invalid_inbox_id', 'Некорректное обращение', 'validation')
  try {
    if (channel === 'telegram') {
      const tariff = await getPartyCompanyTariffAccessState(context.tenantId)
      if (!tariff.access?.allowTelegramIntegration) return partyError(403, 'telegram_tariff_required', 'Telegram недоступен на текущем тарифе', 'tariff')
    }
    const Source = await partyInboxSources[channel].source()
    const source = await Source.findOne({ _id: sourceId, tenantId: context.tenantId, ...(channel === 'novofon' ? { provider: 'novofon' } : {}) })
      .select(`${inboxSourceFields} transcript recordingUrl lastIncomingAt`).lean()
    if (!source) return partyError(404, 'inbox_not_found', 'Обращение не найдено')
    const State = await getPartyInboxStateModel()
    const state = await State.findOne({ tenantId: context.tenantId, channel, sourceId }).lean()
    const salesHistory = (state?.history || []).filter((entry) => entry.type === 'sales_stage_changed').map(({ at, byStaffId, fromSalesStage, toSalesStage, lostReason }) => ({ at, byStaffId, fromSalesStage, toSalesStage, lostReason }))
    if (channel === 'novofon') return NextResponse.json({ success: true, data: { item: mapPartyInboxItem({ row: source, state, channel }), salesHistory, messages: [], transcript: source.transcript || source.aiSummary || '', recordingUrl: safeUrl(source.recordingUrl), canReply: false } }, { headers: { 'Cache-Control': 'private, no-store' } })
    const Messages = await partyInboxSources[channel].messages()
    const [messages, resolvedIncomingToken] = await Promise.all([
      Messages.find({ tenantId: context.tenantId, conversationId: sourceId }).select('_id text direction sentAt status attachments').sort({ sentAt: -1, _id: -1 }).limit(201).lean(),
      latestIncomingToken(Messages, context.tenantId, sourceId),
    ])
    const canReply = channel !== 'telegram' || Boolean(source.lastIncomingAt && Date.now() - new Date(source.lastIncomingAt).getTime() < 86400000)
    return NextResponse.json({ success: true, data: {
      item: mapPartyInboxItem({ row: source, state, channel, resolvedIncomingToken }), salesHistory, canReply, truncated: messages.length > 200,
      messages: messages.slice(0, 200).reverse().map((message) => ({
        id: String(message._id), text: message.text, direction: message.direction, sentAt: message.sentAt, status: message.status,
        attachments: (message.attachments || []).flatMap((attachment) => {
          const url = safeUrl(attachment.photoUrl || attachment.audioUrl || attachment.videoUrl || attachment.fileUrl)
          return url ? [{ url, title: attachment.title || attachment.fileName || 'Открыть вложение' }] : []
        }),
      })),
    } }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch { return partyError(500, 'inbox_details_failed', 'Не удалось загрузить обращение') }
}

export async function PATCH(req, { params }) {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error
  const [channel, sourceId, extra] = String((await params)?.id || '').split(':')
  if (!Object.hasOwn(partyInboxSources, channel) || !isValidObjectId(sourceId) || extra) return partyError(400, 'invalid_inbox_id', 'Некорректное обращение', 'validation')
  let patch, expectedIncomingToken
  try {
    const body = await req.json()
    patch = parsePartyInboxPatch(body)
    expectedIncomingToken = body.expectedIncomingToken
    if (expectedIncomingToken !== undefined && expectedIncomingToken !== '' && (typeof expectedIncomingToken !== 'string' || !isValidObjectId(expectedIncomingToken))) {
      throw new Error('Обновите обращение и повторите сохранение')
    }
  } catch (validationError) {
    return partyError(400, 'invalid_inbox_state', validationError.message, 'validation')
  }
  try {
    if (channel === 'telegram') {
      const tariff = await getPartyCompanyTariffAccessState(context.tenantId)
      if (!tariff.access?.allowTelegramIntegration) return partyError(403, 'telegram_tariff_required', 'Telegram недоступен на текущем тарифе', 'tariff')
    }
    const Source = await partyInboxSources[channel].source()
    const source = await Source.findOne({ _id: sourceId, tenantId: context.tenantId, ...(channel === 'novofon' ? { provider: 'novofon' } : {}) }).select(inboxSourceFields).lean()
    if (!source) return partyError(404, 'inbox_not_found', 'Обращение не найдено')
    const checks = [
      ['clientId', getPartyClientModel, {}],
      ['orderId', getPartyOrderModel, {}],
      ['assigneeStaffId', getPartyStaffModel, { status: 'active', role: { $in: ['owner', 'admin'] } }],
    ]
    const valid = await Promise.all(checks.map(async ([field, accessor, filter]) => {
      if (!patch[field]) return true
      const Model = await accessor()
      return Boolean(await Model.exists({ _id: patch[field], tenantId: context.tenantId, ...filter }))
    }))
    if (valid.some((value) => !value)) return partyError(400, 'invalid_inbox_reference', 'Клиент, заказ или ответственный недоступен в этой компании', 'validation')
    const State = await getPartyInboxStateModel()
    const current = await State.findOne({ tenantId: context.tenantId, channel, sourceId }).lean()
    if (Number(current?.revision || 0) !== patch.expectedRevision) return partyError(409, 'inbox_state_conflict', 'Диалог уже изменён. Нажмите «Обновить обращение».', 'conflict')
    if ((patch.salesStage || current?.salesStage) === 'won' && !patch.orderId) return partyError(400, 'invalid_inbox_state', 'Свяжите забронированную заявку с заказом', 'validation')
    if (current?.assigneeStaffId && String(current.assigneeStaffId) !== String(patch.assigneeStaffId || '')) return partyError(409, 'inbox_handoff_required', 'Передайте диалог новому менеджеру через подтверждение', 'conflict')
    let authoritativeIncomingToken = channel === 'novofon' && source.direction === 'incoming' ? sourceId : ''
    if (partyInboxSources[channel].messages) {
      const Messages = await partyInboxSources[channel].messages()
      authoritativeIncomingToken = await latestIncomingToken(Messages, context.tenantId, sourceId)
    }
    if (expectedIncomingToken !== undefined && expectedIncomingToken !== authoritativeIncomingToken) return partyError(409, 'inbox_state_conflict', 'Поступило новое сообщение. Нажмите «Обновить обращение».', 'conflict')
    const { expectedRevision } = patch
    const actorStaffId = isValidObjectId(context.staff?._id) ? context.staff._id : null
    const { fields: safePatch, events } = buildPartyInboxWorkflowUpdate({ patch, current, channel, actorStaffId })
    const revisionFilter = expectedRevision === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision: expectedRevision }
    const data = await State.findOneAndUpdate(
      { tenantId: context.tenantId, channel, sourceId, ...revisionFilter },
      { $set: { ...safePatch, acknowledgedIncomingToken: authoritativeIncomingToken, updatedByStaffId: actorStaffId }, $inc: { revision: 1 }, ...(events.length ? { $push: { history: { $each: events, $slice: -200 } } } : {}) },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
    ).lean()
    if (!data) return partyError(409, 'inbox_state_conflict', 'Диалог уже изменён. Нажмите «Обновить обращение».', 'conflict')
    return NextResponse.json({ success: true, data: { ...data, inboxItem: mapPartyInboxItem({ row: source, state: data, channel, resolvedIncomingToken: authoritativeIncomingToken }) } })
  } catch (saveError) {
    if (saveError?.code === 11000) return partyError(409, 'inbox_state_conflict', 'Диалог уже изменён. Нажмите «Обновить обращение».', 'conflict')
    return partyError(500, 'inbox_save_failed', 'Не удалось сохранить обращение')
  }
}
