import {
  withPreparationTemplateContext,
  applyPartyPreparationTemplate,
  readPreparationTemplateBody,
} from '@server/partyPreparationTemplates'

export const POST = withPreparationTemplateContext(
  async (req, context, route) =>
    applyPartyPreparationTemplate(
      context,
      (await route.params).id,
      await readPreparationTemplateBody(req)
    )
)
