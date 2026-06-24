import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('tariffs settings loads safe billing diagnostics for company managers', async () => {
  const component = await source(
    'app/company/settings/content/CompanySettingsTariffsContent.js'
  )

  assert.match(component, /\/api\/party\/billing\/diagnostics/)
  assert.match(component, /setBillingDiagnostics/)
  assert.match(component, /buildRequestOptions\(\{ cache: 'no-store' \}\)/)
  assert.match(component, /Диагностика платежей/)
  assert.match(component, /readyForTestPayment/)
  assert.match(component, /webhookUrl/)
  assert.doesNotMatch(component, /YOOKASSA_SECRET_KEY/)
  assert.doesNotMatch(component, /TOCHKA_API_TOKEN/)
})
