import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizePartyCompanyModules,
  isPartyCompanyModuleEnabled,
  isValidPartyCompanyModulesPatch,
  canPartySetOffsiteOrder,
} from './partyCompanyModules.js'
import { mergeCompanySettingsPatch } from './companySettings.js'

test('legacy companies keep offsite and inventory while ticketing remains opt-in', () => {
  assert.deepEqual(normalizePartyCompanyModules(), {
    offsite: { enabled: true }, inventory: { enabled: true }, ticketing: { enabled: false },
  })
  assert.equal(isPartyCompanyModuleEnabled({ settings: {} }, 'inventory'), true)
  assert.equal(isPartyCompanyModuleEnabled({}, 'goods'), false)
  assert.equal(isPartyCompanyModuleEnabled({ modules: { inventory: { enabled: false } } }, 'inventory'), false)
})

test('partial module updates preserve disabled modules and discard unknown configuration', () => {
  const current = { modules: { inventory: { enabled: false }, ticketing: { enabled: true }, offsite: { enabled: false } } }
  const next = mergeCompanySettingsPatch(current, { modules: { inventory: {}, ticketing: { enabled: false } } })
  assert.deepEqual(next.modules, {
    offsite: { enabled: false }, inventory: { enabled: false }, ticketing: { enabled: false },
  })
  assert.deepEqual(mergeCompanySettingsPatch(current, { defaultTown: 'Москва' }).modules, current.modules)
  for (const modules of [{ unknown: { enabled: true } }, { inventory: { enabled: 'true' } }, { offsite: { nested: true } }, null, []])
    assert.equal(isValidPartyCompanyModulesPatch(modules), false)
})

test('disabling offsite blocks new bookings without blocking existing offsite orders', () => {
  const company = { settings: { modules: { offsite: { enabled: false } } } }
  assert.equal(canPartySetOffsiteOrder(company, { placeType: 'client_address' }), false)
  assert.equal(canPartySetOffsiteOrder(company, { placeType: 'client_address' }, { placeType: 'company_location' }), false)
  assert.equal(canPartySetOffsiteOrder(company, { placeType: 'client_address' }, { placeType: 'client_address' }), true)
  assert.equal(canPartySetOffsiteOrder(company, { placeType: 'company_location' }, { placeType: 'client_address' }), true)
  assert.equal(canPartySetOffsiteOrder({}, { placeType: 'client_address' }), true)
})
