import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getPartyDocumentTemplateSource,
  formatPartyDocumentFileDate,
  getPartyContractServiceTitles,
  getPartyDocumentDate,
} from './partyOrderDocuments.js'

test('custom DOCX template is used when company uploaded it', () => {
  assert.deepEqual(getPartyDocumentTemplateSource('custom-base64'), {
    type: 'docx',
    templateBase64: 'custom-base64',
  })
})

test('contract date uses the company day and services use the saved order items', () => {
  assert.equal(getPartyDocumentDate(new Date('2026-11-28T19:00:00Z'), 'Asia/Krasnoyarsk'), '2026-11-29')
  assert.deepEqual(getPartyContractServiceTitles({
    serviceTitle: 'Старая программа',
    orderItems: [{ title: 'Игра в зале', quantity: 2 }, { title: 'Световое шоу', quantity: 1 }],
  }), ['Игра в зале × 2', 'Световое шоу'])
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
