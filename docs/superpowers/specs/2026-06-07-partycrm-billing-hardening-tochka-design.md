# PartyCRM Billing Hardening And Tochka Design

Дата: 2026-06-07.

## Scope

Этот этап доводит текущий billing PartyCRM до безопасного pilot-уровня без смены доменной модели. Тариф и баланс остаются на `PartyUser`, как уже реализовано в `server/partyBilling.js` и `/api/party/billing/yookassa/*`.

Company-level billing для B2B-модели фиксируется как отдельный будущий этап, потому что он потребует миграции UI, прав, истории платежей и feature flags на уровне компании.

## Goals

- Закрыть в PartyCRM те же billing code risks, которые уже закрыты в ArtistCRM.
- Подключить Tochka как второй провайдер оплаты тарифов и пополнений PartyCRM.
- Сохранить совместимость с текущим UI и моделями PartyCRM.
- Обновить env/docs так, чтобы было понятно, какие переменные нужны для YooKassa и Tochka.

## Non-Goals

- Не переносить тариф с `PartyUser` на `PartyCompany`.
- Не менять `/company/settings/tariffs` в полноценный B2B billing кабинет.
- Не проводить реальные платежи, webhook delivery и receipt E2E локально.
- Не внедрять новые платежные провайдеры кроме Tochka.

## Architecture

YooKassa остается в `server/partyYookassaPaymentProcessing.js` и `/api/party/billing/yookassa/*`. В нем нужно исправить тарифную сумму и атомарную обработку successful payment.

Tochka добавляется параллельным контуром:

- `/api/party/billing/tochka/create`
- `/api/party/billing/tochka/sync`
- `/api/party/billing/tochka/webhook`
- `server/partyTochkaPaymentProcessing.js`

Внешний helper `server/tochka.js` переиспользуется, потому что он уже содержит создание платежа, извлечение operation id/payment url, нормализацию суммы и проверку публичного JWK через `server/tochkaPaymentProcessing.js` в ArtistCRM. PartyCRM получает свой processing helper, работающий с `getPartyPaymentModel()` и `applyPartyTariffPurchase()`.

## Safety Rules

- `purpose=tariff` всегда использует `tariff.price`, а не `amount` из request body.
- Успешный webhook/sync перед начислением баланса атомарно переводит платеж из `pending` в `succeeded`.
- Повторная обработка успешного платежа возвращает `alreadyProcessed` и не меняет баланс.
- Production YooKassa webhook без `YOOKASSA_WEBHOOK_SECRET` возвращает `503`.
- Tochka webhook принимает только валидный JWT с подписью RS256.
- Пользовательский sync доступен только владельцу платежа или глобальному `support/admin`.

## Verification

- `npx eslint app/api/party/billing/yookassa/create/route.js app/api/party/billing/yookassa/webhook/route.js app/api/party/billing/tochka/create/route.js app/api/party/billing/tochka/sync/route.js app/api/party/billing/tochka/webhook/route.js server/partyYookassaPaymentProcessing.js server/partyTochkaPaymentProcessing.js`
- `npm run build`
- Existing tests: `node --test app/**/*.test.mjs helpers/*.test.js`

## Open Production Checks

- Реальный YooKassa payment create -> webhook -> sync.
- Реальный Tochka payment create -> JWT webhook -> sync.
- Receipt settings, VAT/tax system and provider dashboard configuration.
- Проверка return URL на `https://partycrm.ru/company/finance?payment=<provider>`.
