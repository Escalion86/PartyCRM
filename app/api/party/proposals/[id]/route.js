import { NextResponse } from 'next/server'
import { getPartyProposalModel } from '@server/partyModels'
import {
  getPartyRequestContext,
  isValidObjectId,
  parseJsonBody,
  partyError,
} from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { PARTY_PROPOSAL_STATUSES } from '@helpers/partyProposalCore'

const getId = async (params) => {
  const resolved = await params
  return String(resolved?.id || '')
}

export async function PATCH(req, { params }) {
  const { context, error } = await getPartyRequestContext({
    req,
    managementOnly: true,
  })
  if (error) return error

  const { access } = await getPartyCompanyTariffAccessState(context.company)
  if (!access.allowDocuments) {
    return partyError(
      403,
      'partycrm_documents_tariff_required',
      'Коммерческие предложения недоступны на текущем тарифе',
      'permission'
    )
  }

  const id = await getId(params)
  if (!isValidObjectId(id)) {
    return partyError(
      400,
      'partycrm_invalid_proposal_id',
      'Некорректный id коммерческого предложения',
      'validation'
    )
  }

  const body = await parseJsonBody(req)
  const status = String(body.status || '')
  if (!PARTY_PROPOSAL_STATUSES.includes(status)) {
    return partyError(
      400,
      'partycrm_invalid_proposal_status',
      'Некорректный статус коммерческого предложения',
      'validation'
    )
  }

  const now = new Date()
  const statusDates = {
    ...(status === 'sent' ? { sentAt: now } : {}),
    ...(status === 'accepted' ? { acceptedAt: now } : {}),
    ...(status === 'rejected' ? { rejectedAt: now } : {}),
  }
  const PartyProposals = await getPartyProposalModel()
  const proposal = await PartyProposals.findOneAndUpdate(
    { _id: id, tenantId: context.tenantId },
    { $set: { status, ...statusDates } },
    { returnDocument: 'after' }
  ).lean()

  if (!proposal) {
    return partyError(
      404,
      'partycrm_proposal_not_found',
      'Коммерческое предложение не найдено'
    )
  }

  return NextResponse.json({ success: true, data: proposal })
}
