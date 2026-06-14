import { getPartyRequestContext, parseJsonBody } from '@server/partyApi'
import { createCore, jsonResult } from '../_shared'
export async function POST(req) { const { context, error } = await getPartyRequestContext({ req, managementOnly: true }); if (error) return error; const body = await parseJsonBody(req); return jsonResult(await createCore().select({ companyId: context.tenantId, calendarId: body.calendarId })) }
