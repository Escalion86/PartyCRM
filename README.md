# ArtistCRM

CRM-система для соло-артистов и агентств мероприятий.

## Продукты

- **ArtistCRM**: основной продукт для управления заявками, мероприятиями, клиентами и финансами соло-артистов.
- **PartyCRM**: отдельная подсистема для агентств и мероприятий (заказы), код расположен в `app/company`.

## Технологии

- **Frontend**: Next.js (App Router), React, Jotai (состояние), MUI (Material UI) + Tailwind CSS (смешанный подход).
- **Backend**: Next.js API Routes, MongoDB + Mongoose.
- **PWA**: Настроен оффлайн-режим через `@ducanh2912/next-pwa`.
- **Мобильное приложение**: планируется клиент на Expo/React Native (директория `mobile`).

## Быстрый старт

```bash
npm install
npm run dev
```

Открой [http://localhost:3000](http://localhost:3000).

## Документация

- `AGENTS.md` — руководство для ИИ-агентов и разработчиков (архитектура, правила, roadmap).
- `docs/ROADMAP.md` — план развития продукта.

## Переменные окружения

Создайте `.env.local` на основе предоставленного примера (или запросите у команды). Основные переменные:
- `MONGODB_URI`, `MONGODB_DBNAME`
- `NEXTAUTH_SECRET`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`

## Биллинг (YooKassa и Tochka)

### YooKassa

Required production environment variables:

```bash
YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=
YOOKASSA_RETURN_URL=https://artistcrm.ru/cabinet/tariff-select?payment=yookassa
YOOKASSA_WEBHOOK_SECRET=
```

Webhook URL in YooKassa:

```text
https://artistcrm.ru/api/billing/yookassa/webhook?token=YOOKASSA_WEBHOOK_SECRET
```

For balance top-ups paid through SBP, the app credits an additional 2% bonus
after YooKassa or Tochka returns a successful SBP payment only when enabled:

```bash
BILLING_SBP_BONUS_ENABLED=true
```

Leave unset or set to `false` to hide the SBP bonus notice and disable bonus
accrual.

Optional receipt variables, if YooKassa fiscalization is enabled:

```bash
YOOKASSA_SEND_RECEIPT=true
YOOKASSA_VAT_CODE=1
NEXT_PUBLIC_LEGAL_NAME=
NEXT_PUBLIC_LEGAL_INN=
NEXT_PUBLIC_SUPPORT_EMAIL=support@artistcrm.ru
```

### Tochka acquiring

Required production environment variables:

```bash
TOCHKA_API_TOKEN=
TOCHKA_CLIENT_ID=
TOCHKA_CUSTOMER_CODE=302258794
TOCHKA_MERCHANT_ID=200000000037708
TOCHKA_RETURN_URL=https://artistcrm.ru/cabinet/tariff-select?payment=tochka
TOCHKA_SEND_RECEIPT=true
TOCHKA_TAX_SYSTEM_CODE=usn_income
TOCHKA_VAT_TYPE=none
TOCHKA_RECEIPT_ITEM_NAME=Оплата ArtistCRM
TOCHKA_RECEIPT_EMAIL=support@artistcrm.ru
```

Tochka receipt API accepts `TOCHKA_TAX_SYSTEM_CODE` values:
`osn`, `usn_income`, `usn_income_outcome`, `esn`, `patent`.
`npd` is not accepted by `payments_with_receipt`; use
`TOCHKA_SEND_RECEIPT=false` for Tochka payment-link tests without fiscal receipt.

Webhook URL in Tochka:

```text
https://artistcrm.ru/api/billing/tochka/webhook
```

Use the local diagnostic command to check available companies and retailers:

```bash
npm run tochka:discover
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [MUI Documentation](https://mui.com/material-ui/getting-started/)
- [Jotai Documentation](https://jotai.org/)
