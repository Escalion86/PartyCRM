import {
  withPreparationTemplateContext,
  listPartyPreparationTemplates,
  savePartyPreparationTemplate,
  readPreparationTemplateBody,
} from '@server/partyPreparationTemplates'

export const dynamic = 'force-dynamic'
export const GET = withPreparationTemplateContext(listPartyPreparationTemplates)
export const POST = withPreparationTemplateContext(
  async (req, context) =>
    savePartyPreparationTemplate(
      context,
      await readPreparationTemplateBody(req)
    ),
  true
)
