import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const clientModalSource = readFileSync(
  new URL('../components/party/modals/ClientModal.js', import.meta.url),
  'utf8'
)

const workspaceSource = readFileSync(
  new URL('../app/company/CompanyWorkspaceClient.js', import.meta.url),
  'utf8'
)

const orderModalSource = readFileSync(
  new URL('../components/party/modals/OrderModal.js', import.meta.url),
  'utf8'
)

test('client form uses company lead source dictionary picker', () => {
  assert.match(clientModalSource, /PartyDictionaryPicker/)
  assert.match(clientModalSource, /label="Откуда узнал о компании"/)
  assert.match(clientModalSource, /items=\{companySettings\?\.leadSources \|\| \[\]\}/)
  assert.match(clientModalSource, /onCreateItem=\{handleLeadSourceCreate\}/)
})

test('company workspace passes company settings to client modal', () => {
  assert.match(workspaceSource, /companySettings=\{companySettings\}/)
  assert.match(workspaceSource, /onCompanySettingsChange=\{setCompanySettings\}/)
})

test('order modal passes lead source settings to nested client modal', () => {
  assert.match(orderModalSource, /companySettings=\{companySettings\}/)
  assert.match(orderModalSource, /onCompanySettingsChange=\{onCompanySettingsChange\}/)
})
