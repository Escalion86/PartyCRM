import { parseJsonBody } from '@server/partyApi'
import { getPartyOrderTeam, partyOrderTeamRoute, updatePartyOrderTeam } from '@server/partyOrderTeam'

export const GET = partyOrderTeamRoute(async (_req, context, { params }) => getPartyOrderTeam({ tenantId: context.tenantId, orderId: (await params).id }))
export const PATCH = partyOrderTeamRoute(async (req, context, { params }) => updatePartyOrderTeam({ context, orderId: (await params).id, body: await parseJsonBody(req) }))
