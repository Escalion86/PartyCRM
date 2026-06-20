# PartyCRM

CRM-система для event-компаний, площадок и исполнителей.

## Продукт

- **PartyCRM**: отдельный продукт для компаний event-сегмента, управления заказами, точками, сотрудниками и кабинетами исполнителей.

## Технологии

- **Frontend**: Next.js (App Router), React, Jotai (состояние), MUI (Material UI) + Tailwind CSS (смешанный подход).
- **Backend**: Next.js API Routes, MongoDB + Mongoose.
- **PWA**: Настроен оффлайн-режим через `@ducanh2912/next-pwa`.
- **Мобильное приложение**: отдельного mobile-клиента пока нет.

## Быстрый старт

```bash
npm install
npm run dev
```

Открой [http://localhost:3000/party](http://localhost:3000/party).

## Документация

- `AGENTS.md` — руководство для ИИ-агентов и разработчиков (архитектура, правила, roadmap).
- `docs/PARTYCRM_ROADMAP.md` — план развития продукта.
- `docs/PARTYCRM_PILOT_CHECKLIST.md` — ручной smoke-test закрытого pilot.
- `docs/PARTYCRM_PUBLIC_LEADS_API.md` — подключение заявок с сайта, Tilda и внешних форм.
- `docs/PARTYCRM_BACKUP_RESTORE_RUNBOOK.md` — backup/restore и правила миграций PartyCRM DB.

## Переменные окружения

Используйте `.env.example` для локальной разработки и `.env.deploy.example` как production-шаблон.

Минимум для запуска:
- `DOMAIN`
- `MONGODB_URI`, `MONGODB_DBNAME`
- `AUTH_SECRET`
- `PARTYCRM_SECRET`

В отдельном PartyCRM runtime используются обычные `MONGODB_*`. Если ArtistCRM
и PartyCRM запущены одним Next.js process, PartyCRM обязан использовать
`PARTYCRM_SHARED_RUNTIME=true`, `PARTYCRM_MONGODB_URI` и
`PARTYCRM_MONGODB_DBNAME`; совпадающая с ArtistCRM пара URI+DB блокируется при
подключении.

Подробная раскладка по обязательным, legacy и удаляемым переменным:
- `docs/ENV_VARIABLES.md`

## Биллинг

### YooKassa

Required production environment variables:

```bash
YOOKASSA_SHOP_ID=
YOOKASSA_SECRET_KEY=
YOOKASSA_WEBHOOK_SECRET=
```

Webhook URL in YooKassa:

```text
https://partycrm.ru/api/party/billing/yookassa/webhook?token=YOOKASSA_WEBHOOK_SECRET
```

For balance top-ups paid through SBP, the app credits an additional 2% bonus
after YooKassa or Tochka returns a successful SBP payment only when enabled:

```bash
BILLING_SBP_BONUS_ENABLED=true
```

Leave unset or set to `false` to hide the SBP bonus notice and disable bonus
accrual.

`PartyCRM` использует YooKassa через `/api/party/billing/yookassa/*`
и Точку через `/api/party/billing/tochka/*`.

### Tochka

Required production environment variables:

```bash
TOCHKA_API_TOKEN=
TOCHKA_CLIENT_ID=
TOCHKA_CUSTOMER_CODE=
TOCHKA_MERCHANT_ID=
TOCHKA_SEND_RECEIPT=false
TOCHKA_VAT_TYPE=none
TOCHKA_RECEIPT_ITEM_NAME="Оплата PartyCRM"
TOCHKA_RECEIPT_EMAIL=support@partycrm.ru
```

Webhook URL in Tochka:

```text
https://partycrm.ru/api/party/billing/tochka/webhook
```

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [MUI Documentation](https://mui.com/material-ui/getting-started/)
- [Jotai Documentation](https://jotai.org/)
