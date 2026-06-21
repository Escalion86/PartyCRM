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
