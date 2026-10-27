import { listPartyOrderTeam, partyOrderTeamRoute } from '@server/partyOrderTeam'

export const GET = partyOrderTeamRoute((req, context) => listPartyOrderTeam({ tenantId: context.tenantId, context, cursor: req.nextUrl.searchParams.get('cursor') || '' }))
