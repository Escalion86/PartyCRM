import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import { createCore, jsonResult } from '../_shared'
export async function POST(req) { const { context, error } = await getPartyRequestContext({ req, managementOnly: true }); if (error) return error; return jsonResult(await createCore().settings({ companyId: context.tenantId, patch: await parseJsonBody(req) })) }
