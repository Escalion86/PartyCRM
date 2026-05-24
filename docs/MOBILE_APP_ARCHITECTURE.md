# Mobile App Architecture (React Native + Expo)

## Цель
- Запустить полноценное мобильное приложение ArtistCRM для сценариев:
  - быстрый контроль заявок и перезвонов;
  - надежные push-напоминания;
  - работа по мероприятиям и задаткам в 1-2 тапа;
  - переход из уведомления сразу в нужную карточку.

---

## Принципы
- Mobile-first UX: основной пользователь работает с телефона.
- Backend-first: мобильное приложение использует существующий API проекта.
- Быстрый MVP, затем расширение функционала без переписывания ядра.
- Единые бизнес-правила между web и mobile.
- Offline-first для критичных сценариев (создание/изменение заявки и задач контакта).

---

## Стек (рекомендуемый)
- Expo (managed workflow)
- React Native
- Expo Router (навигация)
- Zustand или Jotai (состояние)
- TanStack Query (кэш/синхронизация API)
- expo-notifications (push-уведомления)
- expo-linking (deep links)
- expo-secure-store (хранение токенов)
- react-hook-form + zod (формы/валидация)

---

## Архитектура слоев
- `app` (screens/routes)
- `features` (доменная логика: leads/events/finance/reminders/profile)
- `entities` (типы и базовые модели)
- `shared/api` (http client, auth headers, error mapping)
- `shared/ui` (базовые компоненты)
- `shared/lib` (date, phone, formatters, validators)
- `shared/config` (env, endpoints, feature flags)

Рекомендованная структура:
```text
mobile/
  app/
    (auth)/
    (tabs)/
    event/[id].tsx
    lead/[id].tsx
  src/
    features/
      reminders/
      events/
      leads/
      finance/
    entities/
    shared/
      api/
      ui/
      lib/
      config/
```

---

## Навигация (MVP)
- Auth stack:
  - `Login`
- Main tabs:
  - `Задачи` (просрочено/сегодня/завтра)
  - `Мероприятия`
  - `Финансы`
  - `Профиль`
- Detail screens:
  - `Lead/Event Detail`
  - `Редактирование события`
  - `Быстрый лог контакта`

---

## Auth и безопасность
- Авторизация через существующий backend (NextAuth/API-слой).
- Access token хранить в `SecureStore`.
- Refresh/renew сессии централизованно в API client.
- Автовыход при 401 + редирект на login.
- Минимизация персональных данных в локальном кэше.

---

## API-контракт для mobile (минимум)
- `GET /api/events`
- `POST /api/events`
- `PUT /api/events/:id`
- `GET /api/transactions`
- `POST /api/transactions`
- `POST /api/phone/verify/*` (если нужен onboarding/восстановление в app)
- `GET /api/events/reminders/due` (добавить в backend под mobile/web)
- Единый формат ошибок:
```json
{
  "success": false,
  "error": {
    "code": "SOME_CODE",
    "type": "validation|auth|rate_limit|unknown",
    "message": "Текст ошибки"
  }
}
```

---

## Уведомления и deep links

### Push-уведомления
- Типы:
  - просроченный перезвон;
  - событие скоро, задаток не получен;
  - напоминание по подготовке документов.
- Данные уведомления должны содержать:
  - `type`
  - `entityId`
  - `route` (например `event/123`)

### Deep links
- Схема: `artistcrm://event/:id`, `artistcrm://lead/:id`
- При тапе по уведомлению:
  - открыть приложение;
  - перейти на конкретную карточку.

---

## Виджеты и звонки (важные ограничения)

### Виджеты
- Виджеты (home screen widgets) добавляются отдельным этапом.
- Для managed Expo может потребоваться config plugin или переход на prebuild.
- MVP не должен зависеть от виджетов.

### Звонки
- Прямой “перехват звонков” на iOS/Android ограничен системно.
- Реалистичный MVP:
  - кнопка `Позвонить` (tel link/intents);
  - после возврата в приложение быстрый лог результата звонка (`дозвонился/не дозвонился/перенес`).
- “Полный call interception” рассматривать отдельно как R&D с platform constraints.

---

## Offline и синхронизация
- MVP:
  - read-through cache (TanStack Query);
  - optimistic update на быстрых действиях;
  - retry при сетевых ошибках.
- Этап 2:
  - outbox-очередь для офлайн-изменений;
  - конфликт-резолв на уровне updatedAt/version.

### Обязательный offline-сценарий (must-have)
- Если сети нет, создание заявки НЕ должно падать ошибкой для пользователя.
- Действие сохраняется локально в `outbox` со статусом `pending`.
- В UI заявка помечается как `Ожидает синхронизации`.
- При восстановлении сети запускается авто-синхронизация:
  - отправка операций из outbox по порядку;
  - после успешной отправки статус `synced`;
  - при ошибке валидации статус `failed` + возможность вручную исправить и повторить.

### Локальное хранилище
- Mobile (Expo): SQLite (через expo-sqlite) или MMKV + сериализованная очередь.
- Web/PWA (если делать offline в web): IndexedDB (например через Dexie).

### Технический контракт для sync
- Каждая офлайн-операция имеет:
  - `operationId` (uuid)
  - `entityType`
  - `entityLocalId`
  - `payload`
  - `createdAt`
  - `attempts`
  - `status` (`pending|syncing|failed|synced`)
- Серверные endpoint'ы для create/update должны поддерживать идемпотентность:
  - заголовок `Idempotency-Key` или поле `operationId`.

### Конфликты
- Базовая стратегия MVP: `last write wins` + журнал изменений.
- Для важных полей (дата, статус, сумма) в будущем добавить merge-диалог.

---

## Наблюдаемость и качество
- Sentry (mobile crashes + API errors).
- Analytics событий:
  - `contact_planned`, `contact_done`, `deposit_marked`, `notification_opened`.
- Тесты:
  - unit: форматтеры/валидация/маппинг API
  - e2e smoke: login -> open task -> mark done.

---

## План реализации (M1)
- M1-T1: архитектурный каркас + API client + auth
- M1-T2: экран `Задачи контактов`
- M1-T3: карточка события и быстрые действия
- M1-T4: push + deep links
- M1-T5: бета-релиз (TestFlight/Android Internal)

Критерии готовности M1:
- можно войти;
- видно просроченные/сегодня задачи;
- можно позвонить и залогировать контакт;
- приходят push-уведомления;
- переход из push ведет в нужную карточку.

---

## Release pipeline
- Environments: `dev`, `staging`, `prod`
- EAS Build profiles:
  - `preview` (внутренние сборки)
  - `production`
- EAS Submit:
  - TestFlight
  - Google Play Internal Testing

---

## Риски и решения
- Push-стабильность: обязательно серверный retry и дедупликация.
- Разница платформ: не обещать функционал, запрещенный ОС.
- Скорость разработки: сначала MVP на managed Expo, сложные native-вещи после подтверждения ценности.
- Offline-конфликты: с первого релиза хранить `operationId` и лог синхронизации, чтобы не терять/не дублировать заявки.

---

## Связанные документы
- `docs/ROADMAP.md`
- `docs/TELEFONIP_PORTING_GUIDE.md`
