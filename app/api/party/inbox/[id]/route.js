import { NextResponse } from 'next/server'
import { getPartyRequestContext, isValidObjectId, partyError } from '@server/partyApi'
import { partyInboxSources } from '@server/partyInbox'
import { getPartyInboxStateModel } from '@server/partyInboxModels'
import { getPartyClientModel, getPartyOrderModel, getPartyStaffModel } from '@server/partyModels'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { parsePartyInboxPatch } from '@helpers/partyInboxCore'

const safeUrl = (value) => {
  try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : '' } catch { return '' }
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
      .select('_id transcript recordingUrl aiSummary lastIncomingAt').lean()
    if (!source) return partyError(404, 'inbox_not_found', 'Обращение не найдено')
    if (channel === 'novofon') return NextResponse.json({ success: true, data: { messages: [], transcript: source.transcript || source.aiSummary || '', recordingUrl: safeUrl(source.recordingUrl), canReply: false } }, { headers: { 'Cache-Control': 'private, no-store' } })
    const Messages = await partyInboxSources[channel].messages()
    const messages = await Messages.find({ tenantId: context.tenantId, conversationId: sourceId }).select('_id text direction sentAt status attachments').sort({ sentAt: -1, _id: -1 }).limit(201).lean()
    const canReply = channel !== 'telegram' || Boolean(source.lastIncomingAt && Date.now() - new Date(source.lastIncomingAt).getTime() < 86400000)
    return NextResponse.json({ success: true, data: {
      canReply, truncated: messages.length > 200,
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
  let patch
  try { patch = parsePartyInboxPatch(await req.json()) } catch (validationError) {
    return partyError(400, 'invalid_inbox_state', validationError.message, 'validation')
  }
  try {
    if (channel === 'telegram') {
      const tariff = await getPartyCompanyTariffAccessState(context.tenantId)
      if (!tariff.access?.allowTelegramIntegration) return partyError(403, 'telegram_tariff_required', 'Telegram недоступен на текущем тарифе', 'tariff')
    }
    const Source = await partyInboxSources[channel].source()
    const source = await Source.findOne({ _id: sourceId, tenantId: context.tenantId, ...(channel === 'novofon' ? { provider: 'novofon' } : {}) }).select('_id direction').lean()
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
    if (Number(current?.revision || 0) !== patch.expectedRevision) return partyError(409, 'inbox_state_conflict', 'Диалог уже изменён. Обновите список.', 'conflict')
    if (current?.assigneeStaffId && String(current.assigneeStaffId) !== String(patch.assigneeStaffId || '')) return partyError(409, 'inbox_handoff_required', 'Передайте диалог новому менеджеру через подтверждение', 'conflict')
    let authoritativeIncomingToken = channel === 'novofon' && source.direction === 'incoming' ? sourceId : ''
    if (partyInboxSources[channel].messages) {
      const Messages = await partyInboxSources[channel].messages()
      const latestIncoming = await Messages.findOne({ tenantId: context.tenantId, conversationId: sourceId, direction: 'incoming' }).select('_id').sort({ sentAt: -1, _id: -1 }).lean()
      authoritativeIncomingToken = latestIncoming ? String(latestIncoming._id) : ''
    }
    const { expectedRevision, ...safePatch } = patch
    const revisionFilter = expectedRevision === 0 ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] } : { revision: expectedRevision }
    const data = await State.findOneAndUpdate(
      { tenantId: context.tenantId, channel, sourceId, ...revisionFilter },
      { $set: { ...safePatch, acknowledgedIncomingToken: authoritativeIncomingToken, updatedByStaffId: isValidObjectId(context.staff?._id) ? context.staff._id : null }, $inc: { revision: 1 } },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
    ).lean()
    if (!data) return partyError(409, 'inbox_state_conflict', 'Диалог уже изменён. Обновите список.', 'conflict')
    return NextResponse.json({ success: true, data })
  } catch (saveError) {
    if (saveError?.code === 11000) return partyError(409, 'inbox_state_conflict', 'Диалог уже изменён. Обновите список.', 'conflict')
    return partyError(500, 'inbox_save_failed', 'Не удалось сохранить обращение')
  }
}
