import { getPartyRequestContext } from '@server/partyApi'
import { createCore, jsonResult } from '../_shared'
export async function POST(req) { const { context, error } = await getPartyRequestContext({ req, managementOnly: true }); if (error) return error; return jsonResult(await createCore().disconnect({ companyId: context.tenantId })) }
