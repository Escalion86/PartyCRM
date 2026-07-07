import { NextResponse } from 'next/server'
import {
  getPartyRequestContext,
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import { mergePartyClients } from '@server/partyClientMerge'

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

  return NextResponse.json({ success: true, data: result })
}
