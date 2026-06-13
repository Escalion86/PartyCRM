import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getCompanyIntegrationIndicatorState,
  INTEGRATION_INDICATOR_STATE,
} from './companyIntegrationState.js'

const { connected, disconnected, loading, warning } =
  INTEGRATION_INDICATOR_STATE

test('returns loading while integration state is loading', () => {
  assert.equal(
    getCompanyIntegrationIndicatorState({
      type: 'publicLead',
      enabled: true,
      apiKeys: [{ key: 'lead-key' }],
      loading: true,
    }),
    loading
  )
})

test('returns connected for enabled publicLead with an active non-empty key', () => {
  assert.equal(
    getCompanyIntegrationIndicatorState({
      type: 'publicLead',
      enabled: true,
      apiKeys: [
        { key: '' },
        { key: 'disabled-key', enabled: false },
        { key: 'active-key', enabled: true },
      ],
    }),
    connected
  )
})

test('treats a publicLead key without enabled as active', () => {
  assert.equal(
    getCompanyIntegrationIndicatorState({
      type: 'publicLead',
      enabled: true,
      apiKeys: [{ key: 'active-key' }],
    }),
    connected
  )
})

test('returns warning for enabled publicLead without an active key', () => {
  assert.equal(
    getCompanyIntegrationIndicatorState({
      type: 'publicLead',
      enabled: true,
      apiKeys: [{ key: 'disabled-key', enabled: false }, { key: '   ' }],
    }),
    warning
  )
})

test('returns connected for connected Avito and VK integrations', () => {
  for (const type of ['avito', 'vk']) {
    assert.equal(
      getCompanyIntegrationIndicatorState({ type, status: 'connected' }),
      connected
    )
  }
})

test('returns warning for enabled but disconnected Avito and VK integrations', () => {
  for (const type of ['avito', 'vk']) {
    assert.equal(
      getCompanyIntegrationIndicatorState({ type, enabled: true }),
      warning
    )
  }
})

test('returns connected or warning for Novofon depending on apiKey', () => {
  assert.equal(
    getCompanyIntegrationIndicatorState({
      type: 'novofon',
      enabled: true,
      apiKey: 'novofon-key',
    }),
    connected
  )
  assert.equal(
    getCompanyIntegrationIndicatorState({
      type: 'novofon',
      enabled: true,
      apiKey: '   ',
    }),
    warning
  )
})

test('returns connected for AI only when apiKey is non-empty', () => {
  assert.equal(
    getCompanyIntegrationIndicatorState({ type: 'ai', apiKey: 'ai-key' }),
    connected
  )
  assert.equal(
    getCompanyIntegrationIndicatorState({ type: 'ai', apiKey: '   ' }),
    disconnected
  )
})

test('locked has priority over loading and connected states', () => {
  assert.equal(
    getCompanyIntegrationIndicatorState({
      type: 'publicLead',
      enabled: true,
      apiKeys: [{ key: 'active-key' }],
      locked: true,
      loading: true,
    }),
    warning
  )
})

test('returns disconnected for disabled and unknown integrations', () => {
  assert.equal(
    getCompanyIntegrationIndicatorState({ type: 'publicLead' }),
    disconnected
  )
  assert.equal(
    getCompanyIntegrationIndicatorState({ type: 'avito' }),
    disconnected
  )
  assert.equal(
    getCompanyIntegrationIndicatorState({ type: 'vk' }),
    disconnected
  )
  assert.equal(
    getCompanyIntegrationIndicatorState({ type: 'novofon' }),
    disconnected
  )
  assert.equal(
    getCompanyIntegrationIndicatorState({ type: 'unknown', enabled: true }),
    disconnected
  )
})
