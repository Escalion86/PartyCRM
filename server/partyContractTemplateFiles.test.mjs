import assert from 'node:assert/strict'
import test from 'node:test'
import PizZip from 'pizzip'
import {
  getPartyContractDownloadHeader,
  normalizePartyContractTemplateName,
  preparePartyContractTemplateUpload,
} from './partyContractTemplateFiles.js'

const archive = (parts) => {
  const zip = new PizZip()
  for (const part of parts) zip.file(part, '<test/>')
  return zip.generate({ type: 'base64' })
}

const documentParts = ['[Content_Types].xml', 'word/document.xml']

test('contract template names are trimmed, searchable and compared without case', () => {
  assert.deepEqual(normalizePartyContractTemplateName('  Выездной   договор  '), {
    name: 'Выездной договор', normalizedName: 'выездной договор',
  })
  assert.throws(() => normalizePartyContractTemplateName('а'.repeat(121)), { code: 'partycrm_invalid_contract_template_name' })
})

test('a DOCX upload preserves package contents and sanitizes its download name', () => {
  const templateBase64 = archive(documentParts)
  assert.deepEqual(preparePartyContractTemplateUpload({ fileName: 'Праздник?.DOCX', templateBase64 }), {
    fileName: 'Праздник.docx', templateBase64,
  })
  assert.match(getPartyContractDownloadHeader('Праздник.docx'), /filename\*=UTF-8''%D0%9F/)
})

test('wrong package, macro-enabled document and oversized DOCX cannot be saved', () => {
  const invalid = { code: 'partycrm_invalid_contract_template_docx' }
  const fileName = 'Шаблон.docx'
  for (const templateBase64 of ['bm90IGRvY3g=', archive(['test.txt']), archive([...documentParts, 'word/vbaProject.bin'])]) {
    assert.throws(() => preparePartyContractTemplateUpload({ fileName, templateBase64 }), invalid)
  }
  assert.throws(() => preparePartyContractTemplateUpload({ fileName, templateBase64: 'A'.repeat(4 * 1024 * 1024 + 4) }), {
    status: 413,
  })
})
