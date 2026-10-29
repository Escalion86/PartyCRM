import {
  withPreparationTemplateContext,
  savePartyPreparationTemplate,
  readPreparationTemplateBody,
} from '@server/partyPreparationTemplates'

export const PATCH = withPreparationTemplateContext(
  async (req, context, route) =>
    savePartyPreparationTemplate(
      context,
      await readPreparationTemplateBody(req),
      (await route.params).id
    ),
  true
)
