import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  filterCompanySettingsPatchByTariffAccess,
  mergeCompanySettingsPatch,
  normalizeCompanyProfile,
  normalizeCompanySettings,
} from '../helpers/companySettings.js'
import { validatePartyCompanyBranding } from '../helpers/partyCompanyBranding.js'
import { PARTY_COMPANY_MODULES, isValidPartyCompanyModulesPatch } from '../helpers/partyCompanyModules.js'

const source = (await readFile(new URL('../app/api/party/company-settings/route.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
  .replaceAll('export async function ', 'async function ')

function setup({ authError } = {}) {
  const writes = []
  const reads = []
  const company = { settings: { branding: { palette: 'rose', logoUrl: '/logo.png' } } }
  const dependencies = {
    NextResponse: { json: (body) => ({ status: 200, body }) },
    getPartyCompanyModel: async () => ({
      findById: (id) => {
        reads.push(id)
        return { select() { return this }, lean: async () => company }
      },
      updateOne: async (filter, update) => writes.push({ filter, update }),
    }),
    getPartyRequestContext: async (options) => {
      assert.equal(options.managementOnly, true)
      return authError ? { error: authError } : { context: { tenantId: 'own-company' } }
    },
    parseJsonBody: (req) => req.body,
    partyError: (status, code, message) => ({ status, code, message }),
    getPartyCompanyTariffAccessState: async () => ({ access: {}, serializedAccess: {} }),
    preservePartyGoogleCalendarSettings: (_before, value) => value,
    serializePartyCompanySettingsForResponse: (value) => value,
    filterCompanySettingsPatchByTariffAccess,
    mergeCompanySettingsPatch,
    normalizeCompanyProfile,
    normalizeCompanySettings,
    validatePartyCompanyBranding,
    PARTY_COMPANY_MODULES,
    isValidPartyCompanyModulesPatch,
  }
  const PATCH = new Function(...Object.keys(dependencies), `${source}\nreturn PATCH`)(...Object.values(dependencies))
  return { reads, writes, run: (body) => PATCH({ body }) }
}

test('branding changes require company management before reading or writing storage', async () => {
  const api = setup({ authError: { status: 403 } })
  assert.equal((await api.run({ branding: { palette: 'violet' } })).status, 403)
  assert.equal(api.reads.length, 0)
  assert.equal(api.writes.length, 0)
})

test('unsupported branding is rejected without a database mutation', async () => {
  const api = setup()
  for (const branding of [null, [], { palette: '#fff' }, { logoUrl: 'http://localhost/logo.png' }, { html: '<script>' }]) {
    assert.equal((await api.run({ branding })).status, 400)
  }
  assert.equal(api.reads.length, 0)
  assert.equal(api.writes.length, 0)
})

test('logo-only and palette-only updates are tenant scoped and preserve independently changed fields', async () => {
  const api = setup()
  const response = await api.run({ branding: { logoUrl: '/new-logo.webp' } })
  assert.equal(response.status, 200)
  assert.deepEqual(response.body.data.settings.branding, { palette: 'rose', logoUrl: '/new-logo.webp' })
  assert.deepEqual(api.writes[0].filter, { _id: 'own-company' })
  assert.equal(api.writes[0].update.$set['settings.branding.logoUrl'], '/new-logo.webp')
  assert.equal(Object.hasOwn(api.writes[0].update.$set, 'settings.branding.palette'), false)
  assert.equal(Object.hasOwn(api.writes[0].update.$set, 'settings.branding'), false)
  await api.run({ branding: { palette: 'emerald' } })
  assert.equal(api.writes[1].update.$set['settings.branding.palette'], 'emerald')
  assert.equal(Object.hasOwn(api.writes[1].update.$set, 'settings.branding.logoUrl'), false)
  await api.run({ defaultTown: 'Москва' })
  assert.equal(Object.keys(api.writes[2].update.$set).some((key) => key.startsWith('settings.branding')), false)
})
