import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getPartyCompanyOnboardingProgress,
  getPartyCompanyOnboardingSteps,
} from './partyOnboarding.js'
import { mergeCompanySettingsPatch } from './companySettings.js'

test('company without premises can finish onboarding with a persisted setting', () => {
  const settings = mergeCompanySettingsPatch({}, { noOwnPremises: true })
  const savedSettings = mergeCompanySettingsPatch(settings, { defaultTown: 'Москва' })
  const steps = getPartyCompanyOnboardingSteps({
    noOwnPremises: savedSettings.noOwnPremises,
    services: [{}],
    staff: [{ role: 'owner' }, { role: 'performer' }],
    orders: [{}],
    hasOrderTypes: true,
  })
  assert.equal(steps[0].completed, true)
  assert.equal(getPartyCompanyOnboardingProgress(steps).finished, true)
  assert.equal(getPartyCompanyOnboardingProgress(getPartyCompanyOnboardingSteps({
    noOwnPremises: savedSettings.noOwnPremises,
  })).finished, false)
})

test('getPartyCompanyOnboardingSteps marks company setup tasks', () => {
  const steps = getPartyCompanyOnboardingSteps({
    locations: [{}],
    services: [],
    staff: [{ role: 'owner' }],
    orders: [],
  })

  assert.deepEqual(
    steps.map((step) => [step.id, step.completed]),
    [
      ['location', true],
      ['service', false],
      ['staff', false],
      ['order-type', false],
      ['order', false],
    ]
  )
})

test('catalog and staff steps remain repeatable after completion', () => {
  const steps = getPartyCompanyOnboardingSteps({
    locations: [{}],
    services: [{}],
    staff: [{ role: 'owner' }, { role: 'performer' }],
    orders: [{}],
    hasOrderTypes: true,
  })

  assert.deepEqual(
    steps.filter((step) => step.completed && step.repeatable).map((step) => step.id),
    ['location', 'service', 'staff', 'order-type']
  )
  assert.equal(getPartyCompanyOnboardingProgress(steps).finished, true)
})

test('getPartyCompanyOnboardingProgress counts completed setup tasks', () => {
  assert.deepEqual(
    getPartyCompanyOnboardingProgress([
      { completed: true },
      { completed: false },
      { completed: true },
    ]),
    { completedCount: 2, totalCount: 3, finished: false }
  )
})
