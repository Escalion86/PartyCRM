import { NextResponse } from 'next/server'
import { getPartyRequestContext, isValidObjectId, partyError } from '@server/partyApi'
import { partyInboxSources } from '@server/partyInbox'
import { getPartyInboxStateModel } from '@server/partyInboxModels'
import { getPartyStaffModel } from '@server/partyModels'
import { changePartyInboxHandoff, serializePartyInboxWorkflow } from '@server/partyInboxHandoff'

const target = async (params) => {
  const [channel, sourceId, extra] = String((await params)?.id || '').split(':')
  return Object.hasOwn(partyInboxSources, channel) && isValidObjectId(sourceId) && !extra ? { channel, sourceId } : null
}

const contextAndTarget = async (req, params) => {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return { error }
  const value = await target(params)
  if (!value) return { error: partyError(400, 'invalid_inbox_id', 'Некорректное обращение', 'validation') }
  const Source = await partyInboxSources[value.channel].source()
  if (!await Source.exists({ _id: value.sourceId, tenantId: context.tenantId, ...(value.channel === 'novofon' ? { provider: 'novofon' } : {}) })) return { error: partyError(404, 'inbox_not_found', 'Обращение не найдено') }
  return { context, ...value }
}

export async function GET(req, { params }) {
  const access = await contextAndTarget(req, params)
  if (access.error) return access.error
  const State = await getPartyInboxStateModel()
  const state = await State.findOne({ tenantId: access.context.tenantId, channel: access.channel, sourceId: access.sourceId }).lean()
  return NextResponse.json({ success: true, data: serializePartyInboxWorkflow(state) }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(req, { params }) {
  const access = await contextAndTarget(req, params)
  if (access.error) return access.error
  let body
  try { body = await req.json() } catch { return partyError(400, 'invalid_handoff', 'Некорректные данные', 'validation') }
  const allowed = body?.action === 'propose' ? ['action', 'expectedRevision', 'targetStaffId'] : ['action', 'expectedRevision']
  if (!body || Object.keys(body).some((field) => !allowed.includes(field))) return partyError(400, 'invalid_handoff', 'Некорректные данные', 'validation')
  if (body.action === 'propose') {
    if (!isValidObjectId(body.targetStaffId)) return partyError(400, 'invalid_handoff_staff', 'Некорректный менеджер', 'validation')
    const Staff = await getPartyStaffModel()
    if (!await Staff.exists({ _id: body.targetStaffId, tenantId: access.context.tenantId, status: 'active', role: { $in: ['owner', 'admin'] } })) return partyError(400, 'invalid_handoff_staff', 'Активный менеджер не найден в компании', 'validation')
  }
  try {
    const data = await changePartyInboxHandoff({ context: access.context, channel: access.channel, sourceId: access.sourceId, body })
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) { return partyError(error.status || 500, error.status === 409 ? 'inbox_handoff_conflict' : 'invalid_handoff', error.status ? error.message : 'Не удалось передать диалог', error.status === 403 ? 'permission' : 'validation') }
}
