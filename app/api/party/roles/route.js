import { createPartyRole, listPartyRoles, partyRoleResponse, partyRoleRoute } from '@server/partyRoles'
import { parseJsonBody } from '@server/partyApi'
import { canPartyAccess } from '@helpers/partyRolePermissions'

export const GET = partyRoleRoute(async (req, context) => partyRoleResponse(await listPartyRoles(context), 200, { canManage: canPartyAccess(context, { resource: 'roles.manage', action: 'edit' }) }))
export const POST = partyRoleRoute(async (req, context) => partyRoleResponse(await createPartyRole(context, await parseJsonBody(req)), 201), { write: true })
