import { getPartyRequestContext } from '@server/partyApi'
import { createCore, jsonResult } from '../_shared'
export async function GET(req) { const { context, error } = await getPartyRequestContext({ req, managementOnly: true }); if (error) return error; return jsonResult(await createCore().calendars({ companyId: context.tenantId })) }
