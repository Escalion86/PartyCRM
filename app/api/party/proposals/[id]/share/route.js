import { NextResponse } from 'next/server'
import { getPartyRequestContext, isValidObjectId, parseJsonBody, partyError } from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { changePartyProposalPublication } from '@server/partyProposalPublications'

const changePublication = async (req, { params }, publish) => {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error

  const { access } = await getPartyCompanyTariffAccessState(context.company)
  if (!access.allowDocuments) {
    return partyError(403, 'partycrm_documents_tariff_required', 'Коммерческие предложения недоступны на текущем тарифе', 'permission')
  }

  const proposalId = String((await params)?.id || '').toLowerCase()
  if (!isValidObjectId(proposalId)) {
    return partyError(400, 'partycrm_invalid_proposal_id', 'Некорректный id коммерческого предложения', 'validation')
  }

  try {
    const { variantIds: requestedIds } = publish ? await parseJsonBody(req) : {}
    const data = await changePartyProposalPublication({
      tenantId: context.tenantId,
      proposalId,
      requestedIds,
      publish,
      companyTimeZone: context.company.settings?.timeZone || context.company.timeZone,
    })
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (cause) {
    return partyError(cause.status || 500, cause.code && cause.status ? cause.code : 'partycrm_proposal_publish_failed',
      cause.status ? cause.message : 'Не удалось изменить публикацию КП')
  }
}

export const POST = (req, params) => changePublication(req, params, true)
export const DELETE = (req, params) => changePublication(req, params, false)
