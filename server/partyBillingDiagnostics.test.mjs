import test from 'node:test'
import assert from 'node:assert/strict'

import { buildPartyBillingDiagnostics } from './partyBillingDiagnostics.js'

test('buildPartyBillingDiagnostics reports missing provider env without secret values', () => {
  const diagnostics = buildPartyBillingDiagnostics({
    env: {
      DOMAIN: 'https://partycrm.example',
      YOOKASSA_SHOP_ID: 'shop-123',
      YOOKASSA_SECRET_KEY: 'secret-should-not-leak',
      TOCHKA_API_TOKEN: 'token-should-not-leak',
      TOCHKA_CUSTOMER_CODE: '',
      TOCHKA_MERCHANT_ID: '',
    },
  })

  assert.equal(diagnostics.balanceFirst, true)
  assert.equal(diagnostics.providers.yookassa.configured, true)
  assert.equal(diagnostics.providers.yookassa.readyForTestPayment, false)
  assert.deepEqual(diagnostics.providers.yookassa.missing, [
    'YOOKASSA_WEBHOOK_SECRET',
  ])
  assert.equal(
    diagnostics.providers.yookassa.webhookUrl,
    'https://partycrm.example/api/party/billing/yookassa/webhook?token=<YOOKASSA_WEBHOOK_SECRET>'
  )
  assert.equal(diagnostics.providers.tochka.configured, false)
  assert.deepEqual(diagnostics.providers.tochka.missing, [
    'TOCHKA_CUSTOMER_CODE',
    'TOCHKA_MERCHANT_ID',
  ])

  const serialized = JSON.stringify(diagnostics)
  assert.doesNotMatch(serialized, /secret-should-not-leak/)
  assert.doesNotMatch(serialized, /token-should-not-leak/)
})

test('buildPartyBillingDiagnostics marks providers ready when payment and webhook requirements are present', () => {
  const diagnostics = buildPartyBillingDiagnostics({
    env: {
      DOMAIN: 'partycrm.example',
      YOOKASSA_SHOP_ID: 'shop-123',
      YOOKASSA_SECRET_KEY: 'secret',
      YOOKASSA_WEBHOOK_SECRET: 'webhook-secret',
      TOCHKA_API_TOKEN: 'token',
      TOCHKA_CUSTOMER_CODE: 'customer',
      TOCHKA_MERCHANT_ID: 'merchant',
    },
  })

  assert.equal(diagnostics.publicOrigin, 'https://partycrm.example')
  assert.equal(diagnostics.providers.yookassa.readyForTestPayment, true)
  assert.equal(diagnostics.providers.tochka.readyForTestPayment, true)
  assert.equal(
    diagnostics.providers.yookassa.createEndpoint,
    '/api/party/billing/yookassa/create'
  )
  assert.equal(
    diagnostics.providers.tochka.webhookUrl,
    'https://partycrm.example/api/party/billing/tochka/webhook'
  )
})

test('buildPartyBillingDiagnostics flags Tochka receipt tax system mismatch before E2E payment', () => {
  const diagnostics = buildPartyBillingDiagnostics({
    env: {
      DOMAIN: 'https://partycrm.example',
      TOCHKA_API_TOKEN: 'token',
      TOCHKA_CUSTOMER_CODE: 'customer',
      TOCHKA_MERCHANT_ID: 'merchant',
      TOCHKA_SEND_RECEIPT: 'true',
      TOCHKA_TAX_SYSTEM_CODE: 'npd',
    },
  })

  assert.equal(diagnostics.providers.tochka.configured, true)
  assert.equal(diagnostics.providers.tochka.readyForTestPayment, false)
  assert.deepEqual(diagnostics.providers.tochka.blockers, [
    'TOCHKA_TAX_SYSTEM_CODE_UNSUPPORTED',
  ])
})
