import { PARTY_BUILT_IN_CONTRACT_TEMPLATES } from '@helpers/partyBuiltInContractTemplates'
import { normalizeCompanyDocumentRequisites } from '@helpers/companySettings'
import { isValidObjectId, parseJsonBody } from '@server/partyApi'
import { getPartyCompanyModel } from '@server/partyModels'
import {
  PartyContractTemplateError,
  normalizePartyContractTemplateName,
  preparePartyContractTemplateUpload,
} from '@server/partyContractTemplateFiles'
import {
  builtinContractTemplate,
  contractTemplateJson,
  contractTemplateMetadata,
  contractTemplateNotFound,
  legacyContractTemplate,
  readBuiltInContractTemplate,
  withContractTemplateAccess,
} from './_shared'

export const GET = withContractTemplateAccess(async (_req, { tenantId, company, Templates }) => {
  const templates = (await Templates.find({ tenantId }).sort({ normalizedName: 1 }).lean()).map(contractTemplateMetadata)
  const legacy = legacyContractTemplate(company)
  const selected = company.defaultContractTemplateId
  const defaultTemplateId = (
    (selected === 'legacy' && legacy) || builtinContractTemplate(selected) || templates.some((template) => template.id === selected)
  ) ? selected : null
  const legacyTemplate = legacy && { id: legacy.id, name: legacy.name, fileName: legacy.fileName }
  const documentContext = {
    requisites: normalizeCompanyDocumentRequisites(company.settings?.documents?.requisites),
    timeZone: company.settings?.timeZone || company.timeZone || '',
  }
  return contractTemplateJson({ templates, builtIns: PARTY_BUILT_IN_CONTRACT_TEMPLATES, defaultTemplateId, legacyTemplate, documentContext })
})

export const POST = withContractTemplateAccess(async (req, { tenantId, company, Templates }) => {
  const body = await parseJsonBody(req)
  const identity = normalizePartyContractTemplateName(body.name)
  let file
  if (Object.hasOwn(body, 'builtInId')) {
    const metadata = builtinContractTemplate(body.builtInId)
    if (!metadata) throw contractTemplateNotFound()
    const { fileName, templateBase64 } = await readBuiltInContractTemplate(metadata)
    file = { source: 'built_in', builtInId: metadata.id, fileName, templateBase64 }
  } else if (Object.hasOwn(body, 'copyFrom')) {
    const legacy = body.copyFrom === 'legacy' && legacyContractTemplate(company)
    if (!legacy) throw contractTemplateNotFound()
    file = { source: 'upload', ...preparePartyContractTemplateUpload(legacy) }
  } else {
    file = { source: 'upload', ...preparePartyContractTemplateUpload(body) }
  }
  await Templates.init()
  const created = await Templates.create({ tenantId, ...identity, ...file })
  return contractTemplateJson(contractTemplateMetadata(created), 201)
})

export const PATCH = withContractTemplateAccess(async (req, { tenantId, company, Templates }) => {
  const { defaultTemplateId: value } = await parseJsonBody(req)
  if (value !== null) {
    if (typeof value !== 'string' || !value) {
      throw new PartyContractTemplateError('partycrm_contract_template_default_invalid', 'Выберите шаблон по умолчанию')
    }
    const available = value === 'legacy'
      ? legacyContractTemplate(company)
      : builtinContractTemplate(value) || (isValidObjectId(value) && await Templates.exists({ _id: value, tenantId }))
    if (!available) throw contractTemplateNotFound()
  }

  const defaultTemplateId = value && isValidObjectId(value) ? value.toLowerCase() : value
  const Companies = await getPartyCompanyModel()
  const result = await Companies.updateOne({ _id: tenantId, tenantId }, { $set: { defaultContractTemplateId: defaultTemplateId } })
  if (!result.matchedCount) throw new PartyContractTemplateError('partycrm_company_not_found', 'Компания не найдена', 404)
  return contractTemplateJson({ defaultTemplateId })
})
