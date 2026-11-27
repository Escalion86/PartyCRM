import { NextResponse } from 'next/server'
import {
  PARTY_BUILT_IN_CONTRACT_TEMPLATES,
  buildPartyBuiltInContractTemplateBuffer,
} from '@helpers/partyBuiltInContractTemplates'
import { getPartyRequestContext, isValidObjectId, partyError } from '@server/partyApi'
import getPartyCompanyTariffAccessState from '@server/getPartyCompanyTariffAccess'
import { getPartyContractTemplateModel } from '@server/partyContractTemplateModels'
import {
  PartyContractTemplateError,
  normalizePartyContractDocxFileName,
} from '@server/partyContractTemplateFiles'

export const builtinContractTemplate = (id) => PARTY_BUILT_IN_CONTRACT_TEMPLATES.find((template) => template.id === id)

export const legacyContractTemplate = (company) => {
  const documents = company?.settings?.documents
  const templateBase64 = documents?.contractDocxTemplateBase64
  if (typeof templateBase64 !== 'string' || !templateBase64.trim()) return null
  return {
    id: 'legacy',
    name: 'Прежний шаблон компании',
    fileName: normalizePartyContractDocxFileName(documents.contractDocxTemplateFileName),
    templateBase64,
  }
}

export const contractTemplateMetadata = ({ _id, name, source, builtInId, fileName, updatedAt }) => ({
  id: String(_id),
  name,
  source,
  ...(builtInId ? { builtInId } : {}),
  fileName,
  updatedAt,
})

export const contractTemplateNotFound = () => new PartyContractTemplateError('partycrm_contract_template_not_found', 'Шаблон договора не найден', 404)

export const readBuiltInContractTemplate = async (metadata) => ({
  ...metadata,
  templateBase64: (await buildPartyBuiltInContractTemplateBuffer(metadata.id)).toString('base64'),
})

export const findContractTemplate = async (Templates, tenantId, id) => {
  if (!isValidObjectId(id)) throw contractTemplateNotFound()
  const template = await Templates.findOne({ _id: id, tenantId }).select('+templateBase64').lean()
  if (!template) throw contractTemplateNotFound()
  return { ...contractTemplateMetadata(template), templateBase64: template.templateBase64 }
}

export const contractTemplateJson = (data, status = 200) => NextResponse.json(
  { success: true, data },
  { status, headers: { 'Cache-Control': 'private, no-store' } }
)

export const withContractTemplateAccess = (handle) => async (req, routeContext) => {
  const { context, error } = await getPartyRequestContext({ req, managementOnly: true })
  if (error) return error
  try {
    const { access } = await getPartyCompanyTariffAccessState(context.company)
    if (!access.allowDocuments) {
      return partyError(403, 'partycrm_contract_templates_tariff_required', 'Шаблоны договоров недоступны на текущем тарифе', 'permission')
    }
    const Templates = await getPartyContractTemplateModel()
    return await handle(req, { ...context, Templates, params: await routeContext?.params })
  } catch (cause) {
    if (cause instanceof PartyContractTemplateError) {
      return partyError(cause.status, cause.code, cause.message, 'validation')
    }
    if (cause?.code === 11000) {
      return partyError(409, 'partycrm_contract_template_name_taken', 'Шаблон с таким названием уже есть', 'conflict')
    }
    return partyError(500, 'partycrm_contract_templates_failed', 'Не удалось выполнить действие с шаблоном договора')
  }
}
