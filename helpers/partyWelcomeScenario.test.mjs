import test from 'node:test'
import assert from 'node:assert/strict'

import { getPartyActivationWelcomeScenario } from './partyWelcomeScenario.js'

const onboardingSteps = [
  { id: 'location', title: 'Добавить точку', completed: true },
  { id: 'service', title: 'Добавить услугу', completed: false },
  { id: 'order', title: 'Создать первый заказ', completed: false },
]

test('getPartyActivationWelcomeScenario builds trial welcome with next steps', () => {
  const scenario = getPartyActivationWelcomeScenario({
    billing: {
      access: { trialActive: true, hasTariff: true },
      trialEndsAt: '2026-06-22T00:00:00.000Z',
    },
    onboardingSteps,
  })

  assert.equal(scenario.kind, 'trial')
  assert.equal(scenario.title, 'Пробный период активен')
  assert.deepEqual(
    scenario.nextSteps.map((step) => step.id),
    ['service', 'order']
  )
})

test('getPartyActivationWelcomeScenario builds paid tariff welcome', () => {
  const scenario = getPartyActivationWelcomeScenario({
    billing: {
      access: { trialActive: false, hasTariff: true },
      tariffTitle: 'Pro',
      tariffActiveUntil: '2026-07-08T00:00:00.000Z',
    },
    onboardingSteps,
  })

  assert.equal(scenario.kind, 'paid')
  assert.equal(scenario.title, 'Тариф Pro активирован')
  assert.equal(scenario.nextSteps.length, 2)
})

test('getPartyActivationWelcomeScenario returns null without active access', () => {
  assert.equal(
    getPartyActivationWelcomeScenario({
      billing: { access: { trialActive: false, hasTariff: false } },
      onboardingSteps,
    }),
    null
  )
})
