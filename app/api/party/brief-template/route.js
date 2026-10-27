import { partyBriefTemplateRoute, publishPartyBriefTemplate, readPartyBriefTemplate } from '@server/partyBriefTemplates'
import { parseJsonBody } from '@server/partyApi'

export const GET = partyBriefTemplateRoute(readPartyBriefTemplate)
export const PATCH = partyBriefTemplateRoute(async (req, context) => publishPartyBriefTemplate({ context, body: await parseJsonBody(req) }), true)
