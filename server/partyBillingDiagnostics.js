const truthy = (value) => String(value ?? '').trim() !== ''

const normalizeOrigin = (env = {}) => {
  const domain = String(env.DOMAIN || '').trim()
  if (!domain) return ''
  const withoutSlash = domain.replace(/\/$/, '')
  return withoutSlash.startsWith('http')
    ? withoutSlash
    : `https://${withoutSlash}`
}

const missingKeys = (env, keys) => keys.filter((key) => !truthy(env[key]))

const TOCHKA_ALLOWED_TAX_SYSTEM_CODES = new Set([
  'osn',
  'usn_income',
  'usn_income_outcome',
  'esn',
  'patent',
])

const buildYookassaDiagnostics = ({ env, publicOrigin }) => {
  const paymentMissing = missingKeys(env, [
    'YOOKASSA_SHOP_ID',
    'YOOKASSA_SECRET_KEY',
  ])
  const webhookMissing = missingKeys(env, ['YOOKASSA_WEBHOOK_SECRET'])
  const missing = [...paymentMissing, ...webhookMissing]
  const configured = paymentMissing.length === 0

  return {
    provider: 'yookassa',
    configured,
    readyForTestPayment: configured && missing.length === 0 && Boolean(publicOrigin),
    missing,
    blockers: publicOrigin ? [] : ['DOMAIN_REQUIRED_FOR_RETURN_AND_WEBHOOK_URLS'],
    createEndpoint: '/api/party/billing/yookassa/create',
    syncEndpoint: '/api/party/billing/yookassa/sync',
    webhookEndpoint: '/api/party/billing/yookassa/webhook',
    returnUrl: publicOrigin ? `${publicOrigin}/company/finance?payment=yookassa` : '',
    webhookUrl: publicOrigin
      ? `${publicOrigin}/api/party/billing/yookassa/webhook?token=<YOOKASSA_WEBHOOK_SECRET>`
      : '',
    safeEnv: {
      shopIdConfigured: truthy(env.YOOKASSA_SHOP_ID),
      secretKeyConfigured: truthy(env.YOOKASSA_SECRET_KEY),
      webhookSecretConfigured: truthy(env.YOOKASSA_WEBHOOK_SECRET),
      receiptEnabled: env.YOOKASSA_SEND_RECEIPT === 'true',
    },
  }
}

const buildTochkaDiagnostics = ({ env, publicOrigin }) => {
  const paymentMissing = missingKeys(env, [
    'TOCHKA_API_TOKEN',
    'TOCHKA_CUSTOMER_CODE',
    'TOCHKA_MERCHANT_ID',
  ])
  const receiptEnabled = env.TOCHKA_SEND_RECEIPT === 'true'
  const taxSystemCode = String(env.TOCHKA_TAX_SYSTEM_CODE || 'npd').trim()
  const blockers = []
  if (!publicOrigin) blockers.push('DOMAIN_REQUIRED_FOR_RETURN_AND_WEBHOOK_URLS')
  if (receiptEnabled && !TOCHKA_ALLOWED_TAX_SYSTEM_CODES.has(taxSystemCode)) {
    blockers.push('TOCHKA_TAX_SYSTEM_CODE_UNSUPPORTED')
  }
  const configured = paymentMissing.length === 0

  return {
    provider: 'tochka',
    configured,
    readyForTestPayment:
      configured && paymentMissing.length === 0 && blockers.length === 0,
    missing: paymentMissing,
    blockers,
    createEndpoint: '/api/party/billing/tochka/create',
    syncEndpoint: '/api/party/billing/tochka/sync',
    webhookEndpoint: '/api/party/billing/tochka/webhook',
    returnUrl: publicOrigin ? `${publicOrigin}/company/finance?payment=tochka` : '',
    webhookUrl: publicOrigin
      ? `${publicOrigin}/api/party/billing/tochka/webhook`
      : '',
    safeEnv: {
      tokenConfigured: truthy(env.TOCHKA_API_TOKEN),
      clientIdConfigured: truthy(env.TOCHKA_CLIENT_ID),
      customerCodeConfigured: truthy(env.TOCHKA_CUSTOMER_CODE),
      merchantIdConfigured: truthy(env.TOCHKA_MERCHANT_ID),
      customWebhookPublicKeyConfigured: truthy(env.TOCHKA_WEBHOOK_PUBLIC_JWK),
      receiptEnabled,
      taxSystemCode,
    },
  }
}

export const buildPartyBillingDiagnostics = ({ env = process.env } = {}) => {
  const publicOrigin = normalizeOrigin(env)
  const yookassa = buildYookassaDiagnostics({ env, publicOrigin })
  const tochka = buildTochkaDiagnostics({ env, publicOrigin })

  return {
    balanceFirst: true,
    publicOrigin,
    defaultProvider: yookassa.configured ? 'yookassa' : tochka.configured ? 'tochka' : '',
    providers: {
      yookassa,
      tochka,
    },
    e2eChecklist: [
      'Создать пополнение баланса через provider create endpoint',
      'Открыть confirmationUrl и завершить тестовую оплату у провайдера',
      'Дождаться webhook или запустить sync endpoint по paymentId',
      'Проверить, что платеж стал succeeded, а баланс компании увеличился',
      'Выбрать платный тариф через /api/party/billing/tariff/select и проверить списание с баланса',
    ],
  }
}
