import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { filterCompanySettingsPatchByTariffAccess, mergeCompanySettingsPatch, normalizeCompanyProfile, normalizeCompanySettings } from '../helpers/companySettings.js'

const source = (await readFile(new URL('../app/api/party/company-settings/route.js', import.meta.url), 'utf8')).replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '').replaceAll('export async function ', 'async function ')
const setup = ({ ready = true, enabled = false, authError, probeError } = {}) => {
  const writes = [], probes = []
  const company = { settings: { modules: { ticketing: { enabled } } } }
  const deps = {
    NextResponse: { json: (body) => ({ status: 200, body }) },
    getPartyCompanyModel: async () => ({ findById: (id) => { assert.equal(id, 'tenant'); return { select() { return this }, lean: async () => company } }, updateOne: async (filter, update) => writes.push({ filter, update }) }),
    getPartyRequestContext: async (options) => { assert.equal(options.managementOnly, true); return authError ? { error: authError } : { context: { tenantId: 'tenant' } } },
    parseJsonBody: (req) => req.body, partyError: (status, code, message) => ({ status, code, message }),
    getPartyCompanyTariffAccessState: async () => ({ access: {}, serializedAccess: {} }),
    isPartyRestrictedManagementContext: () => false, serializePartyRestrictedCompanySettings: (value) => value,
    preservePartyGoogleCalendarSettings: (_before, value) => value, serializePartyCompanySettingsForResponse: (value) => value,
    filterCompanySettingsPatchByTariffAccess, mergeCompanySettingsPatch, normalizeCompanyProfile, normalizeCompanySettings,
    supportsPartyVenueTransactions: async () => { probes.push(true); if (probeError) throw Error('secret mongo host'); return ready },
  }
  const PATCH = new Function(...Object.keys(deps), `${source}\nreturn PATCH`)(...Object.values(deps))
  return { writes, probes, run: (body) => PATCH({ body }) }
}
test('activation checks storage readiness before a tenant-scoped setting write', async () => {
  const api = setup(), result = await api.run({ modules: { ticketing: { enabled: true } } })
  assert.equal(result.status, 200)
  assert.equal(api.probes.length, 1)
  assert.deepEqual(api.writes[0].filter, { _id: 'tenant' })
  assert.equal(api.writes[0].update.$set['settings.modules.ticketing.enabled'], true)
  assert.equal(Object.hasOwn(api.writes[0].update.$set, 'settings.modules'), false)
  for (const options of [{ ready: false }, { probeError: true }]) {
    const denied = setup(options), response = await denied.run({ modules: { ticketing: { enabled: true } } })
    assert.equal(response.status, 503)
    assert.equal(denied.writes.length, 0)
    assert.doesNotMatch(JSON.stringify(response), /secret|mongo host/)
  }
})
test('unrelated patches cannot revert a concurrently changed module and disable remains available', async () => {
  const api = setup({ enabled: true })
  assert.equal((await api.run({ defaultTown: 'Красноярск' })).status, 200)
  assert.equal(Object.keys(api.writes[0].update.$set).some((key) => key.startsWith('settings.modules')), false)
  assert.equal((await api.run({ modules: { ticketing: {} } })).status, 200)
  assert.equal(Object.keys(api.writes[1].update.$set).some((key) => key.startsWith('settings.modules')), false)
  assert.equal((await api.run({ modules: { ticketing: { enabled: false } } })).status, 200)
  assert.equal(api.writes[2].update.$set['settings.modules.ticketing.enabled'], false)
  assert.equal(api.probes.length, 0)
})
test('malformed flags and missing management authorization stop without mutation', async () => {
  const api = setup()
  for (const modules of [null, [], true, { ticketing: null }, { ticketing: [] }, { ticketing: { enabled: 'true' } }]) assert.equal((await api.run({ modules })).status, 400)
  assert.equal(api.writes.length, 0)
  assert.equal((await setup({ authError: { status: 403 } }).run({ modules: { ticketing: { enabled: true } } })).status, 403)
})
