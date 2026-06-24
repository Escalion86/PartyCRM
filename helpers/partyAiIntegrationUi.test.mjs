import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('company AI integration card exposes check action and diagnostics', async () => {
  const component = await source(
    'app/company/settings/content/CompanySettingsIntegrationsContent.js'
  )

  assert.match(component, /title="AITunnel \/ AI"/)
  assert.match(component, /IntegrationDiagnostics state=\{status\?\.ai\}/)
  assert.match(component, /provider:\s*'ai'/)
  assert.match(component, /action:\s*'check'/)
  assert.match(component, /method:\s*'GET'/)
  assert.match(component, /disabled=\{access && !access\.allowAi\}/)
})
