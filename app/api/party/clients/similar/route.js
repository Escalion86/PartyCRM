import { NextResponse } from 'next/server'
import { getPartyClientModel } from '@server/partyModels'
import {
  getPartyRequestContext,
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import {
  buildPartyClientSimilarMongoFilter,
  findSimilarPartyClients,
} from '@server/partyClientDedupe'

export async function POST(req) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const body = await parseJsonBody(req)
  const excludeClientId = body.excludeClientId || body._id || ''
  if (excludeClientId && !isValidObjectId(excludeClientId)) {
    return partyError(400, 'partycrm_invalid_client_id', 'Некорректный id')
  }

  const filter = buildPartyClientSimilarMongoFilter({
    tenantId: context.tenantId,
    input: body,
    excludeClientId,
  })
  if (!filter) {
    return NextResponse.json({ success: true, data: [] })
  }

  const PartyClients = await getPartyClientModel()
  const clients = await PartyClients.find(filter)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(20)
    .lean()

  const data = findSimilarPartyClients({
    tenantId: context.tenantId,
    input: body,
    clients,
    excludeClientId,
    limit: 5,
  })

  return NextResponse.json({ success: true, data })
}
