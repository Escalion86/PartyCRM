import PizZip from 'pizzip'

export const PARTY_CONTRACT_DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const MAX_DOCX_BYTES = 3 * 1024 * 1024
const DOCX_FALLBACK = 'Шаблон договора.docx'

export class PartyContractTemplateError extends Error {
  constructor(code, message, status = 400) {
    super(message)
    this.code = code
    this.status = status
  }
}

export const normalizePartyContractTemplateName = (value) => {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : ''
  if (!name || name.length > 120 || /\p{C}/u.test(name)) {
    throw new PartyContractTemplateError('partycrm_invalid_contract_template_name', 'Введите название шаблона длиной до 120 символов')
  }
  return { name, normalizedName: name.normalize('NFKC').toLocaleLowerCase('ru-RU') }
}

export const normalizePartyContractDocxFileName = (value) => {
  const cleanName = typeof value === 'string'
    ? value.trim().replace(/[<>:"/\\|?*\p{C}]/gu, '').replace(/\.docx$/i, '').slice(0, 160).trim()
    : ''
  return cleanName ? `${cleanName}.docx` : DOCX_FALLBACK
}

export const preparePartyContractTemplateUpload = ({ fileName, templateBase64 } = {}) => {
  const invalidDocx = () => new PartyContractTemplateError('partycrm_invalid_contract_template_docx', 'Выберите корректный файл DOCX')
  if (typeof fileName !== 'string' || !/\.docx$/i.test(fileName.trim()) || typeof templateBase64 !== 'string') throw invalidDocx()
  const base64 = templateBase64.trim()
  if (base64.length > Math.ceil(MAX_DOCX_BYTES / 3) * 4) {
    throw new PartyContractTemplateError('partycrm_contract_template_file_too_large', 'Размер шаблона не должен превышать 3 МБ', 413)
  }
  if (!base64 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw invalidDocx()
  try {
    const zip = new PizZip(Buffer.from(base64, 'base64'))
    if (!zip.file('[Content_Types].xml') || !zip.file('word/document.xml') ||
        zip.file(/(?:^|\/)vbaProject\.bin$/i).length > 0) throw invalidDocx()
  } catch {
    throw invalidDocx()
  }
  return { fileName: normalizePartyContractDocxFileName(fileName), templateBase64: base64 }
}

export const getPartyContractDownloadHeader = (fileName) => {
  const sanitized = normalizePartyContractDocxFileName(fileName)
  const encoding = encodeURIComponent(Buffer.from(sanitized).toString('utf8')).replace(/['()*]/g, (symbol) => `%${symbol.charCodeAt(0).toString(16)}`)
  return `attachment; filename="contract-template.docx"; filename*=UTF-8''${encoding}`
}
