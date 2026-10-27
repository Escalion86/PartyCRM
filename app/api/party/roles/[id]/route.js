import { partyRoleResponse, partyRoleRoute, updatePartyRole } from '@server/partyRoles'
import { parseJsonBody } from '@server/partyApi'

export const PATCH = partyRoleRoute(async (req, context, { params }) => partyRoleResponse(await updatePartyRole(context, (await params).id, await parseJsonBody(req))), { write: true })
