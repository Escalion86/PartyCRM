import { NextResponse } from 'next/server'
import {
  getPartyRequestContext,
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import { mergePartyClients } from '@server/partyClientMerge'
import { getPartyAuditLogModel } from '@server/partyModels'
import { getPartyAuditActor } from '@server/partyAuditLogCore'

const getId = async (params) => {
  const resolved = await params
  return resolved?.id
}

export async function POST(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const targetClientId = await getId(params)
  const body = await parseJsonBody(req)
  const sourceClientId = String(body.sourceClientId || '').trim()

  if (!isValidObjectId(targetClientId) || !isValidObjectId(sourceClientId)) {
    return partyError(400, 'partycrm_invalid_client_id', 'Некорректный id')
  }
  if (String(targetClientId) === String(sourceClientId)) {
    return partyError(
      400,
      'partycrm_same_client_merge',
      'Нельзя объединить клиента с самим собой',
      'validation'
    )
  }

  const result = await mergePartyClients({
    tenantId: context.tenantId,
    targetClientId,
    sourceClientId,
  })

  if (!result.ok) {
    return partyError(404, 'partycrm_client_not_found', 'Клиент не найден')
  }

  let auditRecorded = false
  try {
    const AuditLogs = await getPartyAuditLogModel()
    await AuditLogs.create({ tenantId: context.tenantId, ...getPartyAuditActor(context), action: 'clients_merged', entityType: 'client', entityId: targetClientId, entityTitle: [result.targetClient.firstName, result.targetClient.secondName].filter(Boolean).join(' ') || 'Клиент', summary: 'Объединил карточки клиентов', changes: [], metadata: { sourceClientId, targetClientId, counts: result.counts } })
    auditRecorded = true
  } catch {} // The merge is already committed; a failed audit must not invite a duplicate merge.
  return NextResponse.json({ success: true, data: result, ...(!auditRecorded ? { warnings: ['Клиенты объединены, но запись истории не подтверждена. Сообщите администратору.'] } : {}) })
}
