# PartyCRM ENV

## Обязательные переменные

```env
NODE_ENV=development|production
DOMAIN=http://localhost:3000
MONGODB_URI=...
MONGODB_DBNAME=partycrm_dev
AUTH_SECRET=...
PARTYCRM_SECRET=...
PARTYCRM_HEALTH_SECRET=...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/api/party/google-calendar/callback
NEXTAUTH_SECRET=...
PARTY_VK_AUTH_ENABLED=true
PARTY_VK_ID_APP_ID=54681802
PARTY_VK_ID_CLIENT_SECRET=...
PARTY_VK_ID_REDIRECT_URI=https://partycrm.ru
NEXT_PUBLIC_PARTY_VK_ID_SCOPE=phone email
```

Это набор для отдельного PartyCRM runtime. Для общего runtime с ArtistCRM
обычные `MONGODB_*` остаются за ArtistCRM, а PartyCRM получает отдельные:

```env
PARTYCRM_SHARED_RUNTIME=true
PARTYCRM_MONGODB_URI=...
PARTYCRM_MONGODB_DBNAME=partycrm_dev
```

`server/productDbConnect.js` сначала читает product-specific переменные и
только затем использует `MONGODB_*` как fallback. При наличии
При `PARTYCRM_SHARED_RUNTIME=true` совпадающая пара URI+DB для двух продуктов
считается ошибкой конфигурации. В отдельном PartyCRM runtime флаг не задаётся.

## Дополнительно нужны для текущего состояния кода

Сейчас `PartyCRM` дополнительно использует:

```env
NEXT_PUBLIC_LEGAL_NAME
NEXT_PUBLIC_LEGAL_INN
NEXT_PUBLIC_SUPPORT_EMAIL
YOOKASSA_SHOP_ID
YOOKASSA_SECRET_KEY
YOOKASSA_WEBHOOK_SECRET
TOCHKA_API_TOKEN
TOCHKA_CLIENT_ID
TOCHKA_CUSTOMER_CODE
TOCHKA_MERCHANT_ID
TOCHKA_SEND_RECEIPT
TOCHKA_VAT_TYPE
TOCHKA_RECEIPT_ITEM_NAME
TOCHKA_RECEIPT_EMAIL
BILLING_CRON_SECRET
```

## Что убрать из PartyCRM

Из копии `ArtistCRM` в `PartyCRM` больше не нужно переносить:

```env
LOGIN
PASSWORD
SECRET
GOOGLE_CALENDAR_ID
YOOKASSA_RETURN_URL
TOCHKA_RETURN_URL
TOCHKA_RECEIPT_CLIENT_CONTACT
TOCHKA_TAX_SYSTEM_CODE
VK_AUTH_ENABLED
VK_ID_APP_ID
VK_ID_CLIENT_SECRET
VK_ID_REDIRECT_URI
NEXT_PUBLIC_VK_ID_SCOPE
VK_DEBUG_LOGS
NEXT_PUBLIC_VK_DEBUG_LOGS
```

Переменные VK ID без префикса `PARTY_` относятся к ArtistCRM и в PartyCRM не
используются. Для PartyCRM применяются только отдельные `PARTY_VK_*` и
`NEXT_PUBLIC_PARTY_VK_*`, чтобы приложения и ключи двух продуктов не
смешивались. Защищённый ключ `PARTY_VK_ID_CLIENT_SECRET` хранится только на
сервере. Redirect URI должен в точности совпадать с адресом из кабинета VK ID.

## Оставлять только если реально используете эти общие модули

Следующие переменные не нужны `PartyCRM` как продукту v1, но могут остаться, если вы сознательно оставляете в нем общие telephony/push/AI-модули:

```env
TELEFONIP
TELEFONIP_API_BASE_URL
PHONE_SMS_SEND_WEBHOOK
TELEPHONY_WEBHOOK_SECRET
NOVOFON_WEBHOOK_SECRET
TELEGRAM_TOKEN
ESCALIONCLOUD_PASSWORD
PUSH_REMINDERS_CRON_SECRET
VAPID_PUBLIC_KEY
VAPID_PRIVATE_KEY
VAPID_SUBJECT
AI_ANALYSIS_PROVIDER
AI_TRANSCRIPTION_PROVIDER
AI_ANALYSIS_API_URL
AI_TRANSCRIPTION_API_URL
DEEPSEEK_API_KEY
DEEPSEEK_CALL_ANALYSIS_MODEL
AITUNNEL_KEY
AITUNNEL_CALL_ANALYSIS_MODEL
AITUNNEL_TRANSCRIPTION_MODEL
OPENAI_API_KEY
OPENAI_MODEL
OPENAI_BASE_URL
OPENAI_CALL_ANALYSIS_MODEL
OPENAI_TRANSCRIPTION_MODEL
```

## Примечание

- Шаблоны лежат в `.env.example` и `.env.deploy.example`.
- Реальные `.env.local` и `.env.deploy` должны оставаться только локально.
- Redirect URI Google OAuth должен точно совпадать с `${DOMAIN}/api/party/google-calendar/callback` и быть добавлен в Google Cloud Console. `NEXTAUTH_SECRET` используется для подписи краткоживущего OAuth state и обязателен в production.
- Webhook YooKassa: `https://partycrm.ru/api/party/billing/yookassa/webhook?token=<YOOKASSA_WEBHOOK_SECRET>`.
- Webhook Точки: `https://partycrm.ru/api/party/billing/tochka/webhook`; тело запроса должно быть JWT, подписанным публичным ключом Точки.
- `PARTYCRM_HEALTH_SECRET` открывает расширенную диагностику `/api/party/health` только при передаче того же значения в заголовке `x-health-secret`. Публичный ответ содержит только состояние БД, задержку и uptime без имени БД и количества документов.
