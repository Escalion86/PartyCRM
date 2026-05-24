# Production ENV Checklist

Документ фиксирует production-переменные для текущего деплоя ArtistCRM + PartyCRM technical preview.

## Обязательные базовые переменные

```env
NODE_ENV=production
DOMAIN=https://artistcrm.ru

MONGODB_URI=...
MONGODB_DBNAME=...

NEXTAUTH_SECRET=...
NEXTAUTH_URL=https://artistcrm.ru
NEXTAUTH_URL_INTERNAL=http://127.0.0.1:3006
```

`MONGODB_SERVER`, `MONGODB_PORT`, `MONGODB_USER`, `MONGODB_PASSWORD` можно хранить в env для deploy-скриптов, но приложение напрямую читает `MONGODB_URI` и `MONGODB_DBNAME`.

## PartyCRM technical preview

```env
PARTYCRM_DOMAIN=partycrm.ru
PARTYCRM_MONGODB_URI=...
PARTYCRM_MONGODB_DBNAME=partycrm_prod
PARTYCRM_AUTH_SECRET=...
```

Правило: `PARTYCRM_MONGODB_DBNAME` должен отличаться от `MONGODB_DBNAME`.
Правило: `PARTYCRM_AUTH_SECRET` должен быть отдельным production-секретом для cookie `partycrm_session`.

## Оплаты

ЮKassa:

```env
YOOKASSA_SECRET_KEY=...
YOOKASSA_SHOP_ID=...
YOOKASSA_RETURN_URL=https://artistcrm.ru/cabinet/tariff-select?payment=yookassa
YOOKASSA_WEBHOOK_SECRET=...
YOOKASSA_SEND_RECEIPT=false
YOOKASSA_VAT_CODE=1
```

Точка:

```env
TOCHKA_API_TOKEN=...
TOCHKA_CLIENT_ID=...
TOCHKA_CUSTOMER_CODE=...
TOCHKA_MERCHANT_ID=...
TOCHKA_SEND_RECEIPT=false
TOCHKA_VAT_TYPE=none
TOCHKA_RECEIPT_CLIENT_CONTACT=phone
TOCHKA_RECEIPT_ITEM_NAME=Оплата ArtistCRM
TOCHKA_RECEIPT_EMAIL=support@artistcrm.ru
```

Если включаются чеки Точки, дополнительно проверить:

```env
TOCHKA_TAX_SYSTEM_CODE=...
TOCHKA_PAYMENT_METHOD=full_payment
TOCHKA_PAYMENT_OBJECT=service
TOCHKA_MEASURE=шт.
TOCHKA_PAYMENT_TTL=1440
TOCHKA_WEBHOOK_PUBLIC_JWK=...
```

## Публичные юридические данные

```env
NEXT_PUBLIC_LEGAL_NAME=ArtistCRM
NEXT_PUBLIC_LEGAL_INN=...
NEXT_PUBLIC_SUPPORT_EMAIL=support@artistcrm.ru
```

## Push и cron

```env
BILLING_CRON_SECRET=...
PUSH_REMINDERS_CRON_SECRET=...

VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:support@cigam.ru
```

Cron для `/api/push/reminders/additional-events` можно запускать каждые 15
минут. Приложение само отфильтрует пользователей по времени ежедневных
напоминаний из `Настройки -> Уведомления`; если время не задано, используется
`10:00` в часовом поясе пользователя.

## VK ID

```env
VK_AUTH_ENABLED=true
VK_ID_APP_ID=...
VK_ID_CLIENT_SECRET=...
VK_ID_REDIRECT_URI=https://artistcrm.ru/api/vk-id/callback
NEXT_PUBLIC_VK_ID_SCOPE=phone email
```

Опционально:

```env
VK_DEBUG_LOGS=false
NEXT_PUBLIC_VK_DEBUG_LOGS=false
VK_ID_DOMAIN=id.vk.ru
```

## Google Calendar

```env
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://artistcrm.ru/api/google-calendar/callback
```

Опционально для service account сценариев:

```env
GOOGLE_CALENDAR_CREDENTIALS_PATH=...
```

## Телефония и SMS

```env
TELEFONIP=...
TELEGRAM_TOKEN=...
```

Опционально:

```env
TELEFONIP_API_BASE_URL=https://api.telefon-ip.ru
PHONE_SMS_SEND_WEBHOOK=...
TELEPHONY_WEBHOOK_SECRET=...
NOVOFON_WEBHOOK_SECRET=...
```

## AI

Для анализа звонков:

```env
AI_ANALYSIS_PROVIDER=deepseek
DEEPSEEK_API_KEY=...
DEEPSEEK_CALL_ANALYSIS_MODEL=deepseek-v4-flash
```

Для распознавания записей:

```env
AI_TRANSCRIPTION_PROVIDER=aitunnel
AITUNNEL_KEY=...
AITUNNEL_TRANSCRIPTION_MODEL=whisper-1
```

Опционально:

```env
AI_ANALYSIS_API_URL=...
AI_TRANSCRIPTION_API_URL=...
OPENAI_API_KEY=...
OPENAI_CALL_ANALYSIS_MODEL=gpt-4o-mini
OPENAI_TRANSCRIPTION_MODEL=whisper-1
```

## Почта и файлы

```env
ESCALIONCLOUD_PASSWORD=...

SMTP_HOST=smtp.yandex.ru
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=support@artistcrm.ru
SMTP_PASSWORD=...
MAIL_FROM=ArtistCRM <support@artistcrm.ru>
```

## Лишнее или подозрительное

Эти переменные сейчас не используются кодом напрямую или выглядят как legacy:

```env
SECRET
NEXTAUTH_SITE
DEEPSEEK_KEY
```

Опечатка, которую нужно исправить:

```env
OCHKA_RECEIPT_EMAIL=...
```

Должно быть:

```env
TOCHKA_RECEIPT_EMAIL=support@artistcrm.ru
```
