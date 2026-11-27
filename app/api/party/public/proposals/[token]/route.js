import { NextResponse } from 'next/server'
import { parseJsonBody, partyError } from '@server/partyApi'
import { answerPublicPartyProposal } from '@server/partyProposalPublications'

export async function POST(req, { params }) {
  try {
    const { token } = await params
    const data = await answerPublicPartyProposal(token, await parseJsonBody(req))
    if (!data) return partyError(404, 'partycrm_proposal_link_not_found', 'Ссылка на предложение недоступна')
    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (cause) {
    return partyError(cause.status || 500, cause.code && cause.status ? cause.code : 'partycrm_proposal_answer_failed',
      cause.status ? cause.message : 'Не удалось сохранить ответ')
  }
}
