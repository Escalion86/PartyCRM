import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getPartyDocumentTemplateSource,
  formatPartyDocumentFileDate,
} from './partyOrderDocuments.js'

test('custom DOCX template is used when company uploaded it', () => {
  assert.deepEqual(getPartyDocumentTemplateSource('custom-base64'), {
    type: 'docx',
    templateBase64: 'custom-base64',
  })
})

test('built-in text template is used when company has no custom DOCX', () => {
  assert.deepEqual(getPartyDocumentTemplateSource(''), {
    type: 'built_in',
    templateBase64: '',
  })
})

test('document file date accepts ISO date and Date instances', () => {
  assert.equal(formatPartyDocumentFileDate('2026-06-13'), '13.06.2026')
  assert.equal(
    formatPartyDocumentFileDate(new Date('2026-06-13T10:00:00.000Z')),
    '13.06.2026'
  )
})
