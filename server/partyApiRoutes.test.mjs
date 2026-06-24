import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const route = (path) => readFile(join(process.cwd(), path), 'utf8')

test('party health route checks PartyCRM product database explicitly', async () => {
  const source = await route('app/api/party/health/route.js')

  assert.match(source, /PRODUCTS\.PARTYCRM/)
  assert.match(source, /getProductDbConnection\(PRODUCTS\.PARTYCRM\)/)
  assert.match(source, /partycrm_db_unavailable/)
})

test('party memberships route exposes only membership context for current session', async () => {
  const source = await route('app/api/party/memberships/route.js')

  assert.match(source, /getPartyMembershipContext/)
  assert.match(source, /sessionUser/)
  assert.match(source, /memberships/)
  assert.match(source, /unauthorized/)
})

test('party me route resolves active company through request context', async () => {
  const source = await route('app/api/party/me/route.js')

  assert.match(source, /getPartyRequestContext\(\{\s*req\s*\}\)/)
  assert.match(source, /tenantId/)
  assert.match(source, /staff/)
  assert.match(source, /company/)
})

test('party additionalEvents reminder cron route sends deduped PartyCRM push', async () => {
  const source = await route('app/api/party/reminders/additional-events/route.js')

  assert.match(source, /PARTYCRM_CRON_SECRET/)
  assert.match(source, /runPartyAdditionalEventReminderBatch/)
  assert.match(source, /PushReminderLogs\.create/)
  assert.match(source, /getPartyOrderModel/)
  assert.match(source, /sendPushToTenant/)
  assert.match(source, /product:\s*'partycrm'/)
})

test('party tariff select route charges paid tariffs from company balance', async () => {
  const source = await route('app/api/party/billing/tariff/select/route.js')

  assert.match(source, /applyPartyCompanyTariffPurchase/)
  assert.match(source, /companyId:\s*context\.tenantId/)
  assert.doesNotMatch(source, /Платный тариф нужно оплатить через платёжного провайдера/)
  assert.doesNotMatch(source, /price\s*>\s*0/)
})

test('party provider create routes top up balance instead of buying tariffs directly', async () => {
  for (const path of [
    'app/api/party/billing/yookassa/create/route.js',
    'app/api/party/billing/tochka/create/route.js',
  ]) {
    const source = await route(path)

    assert.match(source, /buildPartyBalanceTopUpPaymentDraft/)
    assert.match(source, /tariffId:\s*null/)
    assert.match(source, /tariffId:\s*""/)
    assert.doesNotMatch(source, /body\?\.purpose\s*===\s*"tariff"/)
    assert.doesNotMatch(source, /getPartyTariffModel/)
  }
})

test('party provider success processing only credits company balance', async () => {
  for (const path of [
    'server/partyYookassaPaymentProcessing.js',
    'server/partyTochkaPaymentProcessing.js',
  ]) {
    const source = await route(path)

    assert.doesNotMatch(source, /applyPartyCompanyTariffPurchase/)
    assert.doesNotMatch(source, /payment\.purpose\s*===\s*"tariff"/)
    assert.match(source, /company\.balance\s*=/)
    assert.match(source, /payment\.purpose\s*===\s*"balance"/)
  }
})

test('party billing diagnostics route exposes safe preflight status for company managers', async () => {
  const source = await route('app/api/party/billing/diagnostics/route.js')

  assert.match(source, /getPartyRequestContext\(\{\s*req,\s*managementOnly:\s*true/)
  assert.match(source, /buildPartyBillingDiagnostics/)
  assert.match(source, /NextResponse\.json/)
  assert.doesNotMatch(source, /YOOKASSA_SECRET_KEY/)
  assert.doesNotMatch(source, /TOCHKA_API_TOKEN/)
})

test('party messenger conversation routes use PartyCRM models and request context', async () => {
  for (const path of [
    'app/api/party/integrations/avito/conversations/route.js',
    'app/api/party/integrations/avito/conversations/[id]/messages/route.js',
    'app/api/party/integrations/vk/conversations/route.js',
    'app/api/party/integrations/vk/conversations/[id]/messages/route.js',
  ]) {
    const source = await route(path)

    assert.match(source, /getPartyRequestContext/)
    assert.match(source, /context\.tenantId/)
    assert.doesNotMatch(source, /@models\/(Avito|Vk)/)
    assert.doesNotMatch(source, /SiteSettings/)
  }
})

test('party messenger message routes support outgoing replies through PartyCRM services', async () => {
  const expectations = [
    {
      path: 'app/api/party/integrations/avito/conversations/[id]/messages/route.js',
      service: /sendPartyAvitoConversationReply/,
      sender: /sendAvitoMessage/,
      token: /requestAvitoAccessToken/,
    },
    {
      path: 'app/api/party/integrations/vk/conversations/[id]/messages/route.js',
      service: /sendPartyVkConversationReply/,
      sender: /sendVkMessage/,
      token: null,
    },
  ]

  for (const expectation of expectations) {
    const source = await route(expectation.path)

    assert.match(source, /export async function POST/)
    assert.match(source, /getPartyRequestContext\(\{\s*req,\s*managementOnly:\s*true/)
    assert.match(source, /context\.company\?\.settings\?\.integrations/)
    assert.match(source, expectation.service)
    assert.match(source, expectation.sender)
    if (expectation.token) assert.match(source, expectation.token)
    assert.doesNotMatch(source, /SiteSettings/)
    assert.doesNotMatch(source, /@models\/(Avito|Vk)/)
  }
})

test('party novofon routes use PartyCRM webhook and product-aware call flow', async () => {
  const connectSource = await route(
    'app/api/party/integrations/novofon/connect/route.js'
  )
  const webhookSource = await route(
    'app/api/party/integrations/novofon/webhook/[token]/route.js'
  )

  assert.match(connectSource, /buildPartyNovofonWebhookUrl/)
  assert.doesNotMatch(connectSource, /\/api\/telephony\/novofon\/webhook/)

  assert.match(webhookSource, /getPartyCompanyModel/)
  assert.match(webhookSource, /getPartyCallModel/)
  assert.match(webhookSource, /getPartyClientModel/)
  assert.match(webhookSource, /savePartyNovofonCall/)
  assert.match(webhookSource, /normalizeNovofonWebhook/)
  assert.match(webhookSource, /getPartyCompanyTariffAccessState/)
  assert.doesNotMatch(webhookSource, /SiteSettings/)
  assert.doesNotMatch(webhookSource, /@models\/Calls/)
})

test('party AI save route enforces company tariff access and stores settings on PartyCompany', async () => {
  const source = await route('app/api/party/integrations/ai/save/route.js')

  assert.match(source, /getPartyRequestContext\(\{\s*req,\s*managementOnly:\s*true/)
  assert.match(source, /getPartyCompanyModel/)
  assert.match(source, /getPartyCompanyTariffAccessState/)
  assert.match(source, /allowAi/)
  assert.match(source, /settings\.integrations/)
  assert.match(source, /normalizeAiSettings/)
  assert.doesNotMatch(source, /SiteSettings/)
  assert.doesNotMatch(source, /@models\/Site/)
})

test('party AI check route validates company AI settings and records diagnostics', async () => {
  const source = await route('app/api/party/integrations/ai/check/route.js')

  assert.match(source, /getPartyRequestContext\(\{\s*req,\s*managementOnly:\s*true/)
  assert.match(source, /getPartyCompanyModel/)
  assert.match(source, /getPartyCompanyTariffAccessState/)
  assert.match(source, /allowAi/)
  assert.match(source, /normalizeAiSettings/)
  assert.match(source, /aiLastCheckedAt/)
  assert.match(source, /aiLastError/)
  assert.match(source, /settings\.integrations/)
  assert.doesNotMatch(source, /SiteSettings/)
  assert.doesNotMatch(source, /@models\/Site/)
})

test('party integration check routes record company-level diagnostics', async () => {
  const vkSource = await route('app/api/party/integrations/vk/check/route.js')
  const avitoSource = await route('app/api/party/integrations/avito/check/route.js')
  const novofonSource = await route(
    'app/api/party/integrations/novofon/check/route.js'
  )

  for (const source of [vkSource, avitoSource, novofonSource]) {
    assert.match(source, /getPartyRequestContext\(\{\s*req,\s*managementOnly:\s*true/)
    assert.match(source, /getPartyCompanyModel/)
    assert.match(source, /LastCheckedAt/)
    assert.match(source, /LastError/)
    assert.match(source, /Status/)
    assert.match(source, /settings\.integrations/)
    assert.doesNotMatch(source, /SiteSettings/)
    assert.doesNotMatch(source, /@models\/Site/)
  }

  assert.match(novofonSource, /normalizeNovofonSettings/)
  assert.match(novofonSource, /novofon_api_key_required/)
  assert.match(novofonSource, /novofon_webhook_secret_required/)
})

test('party calls routes expose Novofon calls and create orders from call drafts', async () => {
  const listSource = await route('app/api/party/calls/route.js')
  const createOrderSource = await route(
    'app/api/party/calls/[id]/create-order/route.js'
  )

  assert.match(listSource, /getPartyRequestContext\(\{\s*req,\s*managementOnly:\s*true/)
  assert.match(listSource, /getPartyCallModel/)
  assert.match(listSource, /context\.tenantId/)
  assert.match(listSource, /allowTelephony/)
  assert.match(listSource, /\.sort\(\{\s*startedAt:\s*-1/)

  assert.match(createOrderSource, /getPartyRequestContext\(\{\s*req,\s*managementOnly:\s*true/)
  assert.match(createOrderSource, /getPartyCallModel/)
  assert.match(createOrderSource, /getPartyOrderModel/)
  assert.match(createOrderSource, /createPartyOrderFromCallDraft/)
  assert.match(createOrderSource, /normalizeOrderPayload/)
  assert.match(createOrderSource, /validateOrderReferences/)
  assert.match(createOrderSource, /canCreatePartyOrderByTariff/)
  assert.match(createOrderSource, /filterPartyOrderPayloadByTariffAccess/)
  assert.match(createOrderSource, /findPartyOrderConflicts/)
  assert.match(createOrderSource, /syncPartyOrderCalendarAfterCrud/)
  assert.match(createOrderSource, /context\.tenantId/)
  assert.match(createOrderSource, /allowTelephony/)
})

test('party close-past route returns close financial summaries for owner review', async () => {
  const source = await route('app/api/party/orders/close-past/route.js')

  assert.match(source, /closed:\s*closed/)
  assert.match(source, /summary:\s*readiness\.summary/)
  assert.match(source, /closedIds:\s*closed\.map/)
  assert.match(source, /skipped\.push\(\{\s*orderId,\s*blockers:\s*readiness\.blockers,\s*summary:\s*readiness\.summary/)
})

test('party performer calendar route exports only sanitized performer assignments', async () => {
  const source = await route('app/api/party/performer/calendar/route.js')

  assert.match(source, /getPartyMembershipContext/)
  assert.match(source, /sanitizePartyOrderForPerformer/)
  assert.match(source, /buildPartyPerformerCalendarIcs/)
  assert.match(source, /text\/calendar/)
  assert.match(source, /Content-Disposition/)
  assert.doesNotMatch(source, /getPartyRequestContext\(\{\s*req,\s*managementOnly/)
  assert.doesNotMatch(source, /contractAmount/)
  assert.doesNotMatch(source, /clientPayment/)
  assert.doesNotMatch(source, /transactions/)
})

test('party performer routes expose assignments and allow confirming and completing own work', async () => {
  const listSource = await route('app/api/party/performer/orders/route.js')
  const statusSource = await route(
    'app/api/party/performer/orders/[id]/status/route.js'
  )
  const workspaceSource = await route('app/performer/PerformerWorkspaceClient.js')

  assert.match(listSource, /getPartyMembershipContext/)
  assert.match(listSource, /sanitizePartyOrderForPerformer/)
  assert.match(listSource, /'assignedStaff\.staffId':\s*String\(membership\.staffId\)/)
  assert.match(statusSource, /ALLOWED_STATUSES\s*=\s*new Set\(\['confirmed', 'declined', 'done'\]\)/)
  assert.match(statusSource, /getPartyMembershipContext/)
  assert.match(statusSource, /partycrm_performer_staff_access_denied/)
  assert.match(statusSource, /'assignedStaff\.\$\.confirmationStatus':\s*confirmationStatus/)
  assert.match(workspaceSource, /Подтвердить участие/)
  assert.match(workspaceSource, /Отметить выполненным/)
  assert.match(workspaceSource, /confirmationStatus:\s*'confirmed'/)
  assert.match(workspaceSource, /confirmationStatus:\s*'done'/)
})
