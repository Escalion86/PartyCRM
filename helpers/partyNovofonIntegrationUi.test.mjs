import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('company Novofon integration card exposes check action and diagnostics', async () => {
  const component = await source(
    'app/company/settings/content/CompanySettingsIntegrationsContent.js'
  )
  const novofonSection = component.slice(
    component.indexOf('title="Novofon"'),
    component.indexOf('title="AITunnel / AI"')
  )

  assert.match(novofonSection, /title="Novofon"/)
  assert.match(
    novofonSection,
    /IntegrationDiagnostics state=\{status\?\.novofon\}/
  )
  assert.match(novofonSection, /provider:\s*'novofon'/)
  assert.match(novofonSection, /action:\s*'check'/)
  assert.match(novofonSection, /method:\s*'GET'/)
  assert.match(novofonSection, /disabled=\{access && !access\.allowTelephony\}/)
})
