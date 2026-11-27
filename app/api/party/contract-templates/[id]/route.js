import { NextResponse } from 'next/server'
import { isValidObjectId, parseJsonBody } from '@server/partyApi'
import {
  PARTY_CONTRACT_DOCX_MIME,
  PartyContractTemplateError,
  getPartyContractDownloadHeader,
  normalizePartyContractTemplateName,
  preparePartyContractTemplateUpload,
} from '@server/partyContractTemplateFiles'
import {
  builtinContractTemplate,
  contractTemplateJson,
  contractTemplateMetadata,
  contractTemplateNotFound,
  findContractTemplate,
  legacyContractTemplate,
  readBuiltInContractTemplate,
  withContractTemplateAccess,
} from '../_shared'

export const GET = withContractTemplateAccess(async (req, { tenantId, company, Templates, params }) => {
  const { id } = params
  const builtin = builtinContractTemplate(id)
  const template = builtin
    ? await readBuiltInContractTemplate(builtin)
    : id === 'legacy' ? legacyContractTemplate(company) : await findContractTemplate(Templates, tenantId, id)
  if (!template) throw contractTemplateNotFound()
  if (new URL(req.url).searchParams.get('download') !== '1') return contractTemplateJson(template)
  return new NextResponse(Buffer.from(template.templateBase64, 'base64'), {
    headers: {
      'Cache-Control': 'private, no-store',
      'Content-Disposition': getPartyContractDownloadHeader(template.fileName),
      'Content-Type': PARTY_CONTRACT_DOCX_MIME,
      'X-Content-Type-Options': 'nosniff',
    },
  })
})

export const PATCH = withContractTemplateAccess(async (req, { tenantId, Templates, params }) => {
  const { id } = params
  if (!isValidObjectId(id)) throw contractTemplateNotFound()
  const body = await parseJsonBody(req)
  const changes = Object.hasOwn(body, 'name') ? normalizePartyContractTemplateName(body.name) : {}
  if (Object.hasOwn(body, 'templateBase64') || Object.hasOwn(body, 'fileName')) {
    Object.assign(changes, preparePartyContractTemplateUpload(body), { source: 'upload', builtInId: '' })
  }
  if (!Object.keys(changes).length) {
    throw new PartyContractTemplateError('partycrm_contract_template_patch_empty', 'Укажите новое название или файл шаблона')
  }
  await Templates.init()
  const template = await Templates.findOneAndUpdate(
    { _id: id, tenantId },
    { $set: changes },
    { returnDocument: 'after', runValidators: true }
  ).lean()
  if (!template) throw contractTemplateNotFound()
  return contractTemplateJson(contractTemplateMetadata(template))
})

export const DELETE = withContractTemplateAccess(async (_req, { tenantId, Templates, params }) => {
  const { id } = params
  if (!isValidObjectId(id)) throw contractTemplateNotFound()
  const result = await Templates.deleteOne({ _id: id, tenantId })
  if (!result.deletedCount) throw contractTemplateNotFound()
  // A missing saved default resolves to the automatic choice on the next read.
  return contractTemplateJson({ id })
})
