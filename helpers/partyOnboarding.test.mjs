import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getPartyCompanyOnboardingProgress,
  getPartyCompanyOnboardingSteps,
} from './partyOnboarding.js'

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
      ['order', false],
    ]
  )
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
