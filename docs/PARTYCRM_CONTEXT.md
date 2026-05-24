# PartyCRM Context

Этот файл нужен для быстрого восстановления контекста по PartyCRM после потери истории диалога.

Основной roadmap: `docs/PARTYCRM_ROADMAP.md`.

Главный roadmap проекта: `docs/ROADMAP.md`.

## Продуктовое решение

PartyCRM — отдельный продукт для компаний event-сегмента:

- праздничные агентства;
- детские игровые и развлекательные точки;
- анимационные команды;
- фотостудии и студии с несколькими залами;
- площадки под мероприятия и мастер-классы.

ArtistCRM остается solo-продуктом для артиста. PartyCRM не должен усложнять solo-кабинет ArtistCRM.

## Текущая архитектура

PartyCRM пока живет в том же Next.js приложении, что и ArtistCRM, но считается отдельным продуктом.

Текущая схема:

```txt
Один репозиторий
Один Next.js build/runtime

artistcrm.ru -> ArtistCRM
partycrm.ru  -> PartyCRM

ArtistCRM DB -> отдельный env набор ArtistCRM
PartyCRM DB  -> MONGODB_URI / MONGODB_DBNAME
```

Auth/users тоже разделены:

```txt
ArtistCRM auth -> /login, /api/auth/*, Users, next-auth cookies
PartyCRM auth  -> /party/login, /api/party/auth/*, PartyUsers, partycrm_session
```

В будущем возможен переход к monorepo:

```txt
apps/artistcrm
apps/partycrm
packages/shared-*
```

Резкий split в отдельный репозиторий пока не сделан, чтобы не плодить копипасту общего auth/db/ui/integration-кода.

## Данные и membership

Целевое решение: один аккаунт входа не равен одной компании.

```txt
User
- глобальный аккаунт авторизации;
- может быть связан с несколькими компаниями;
- может быть владельцем, администратором и исполнителем в разных компаниях.

PartyCompany
- компания внутри PartyCRM;
- имеет свои точки, сотрудников, заказы и финансы.

PartyStaff
- membership/card человека внутри конкретной компании;
- всегда принадлежит одному tenantId;
- может иметь authUserId;
- может быть подрядчиком без аккаунта.
```

Правила:

- Один `authUserId` может иметь несколько `PartyStaff` записей в разных `tenantId`.
- Подрядчиков не привязываем автоматически по телефону.
- Привязка подрядчика к аккаунту должна быть ручной и подтверждаемой.
- Кабинет компании работает в контексте активной компании.
- Кабинет исполнителя показывает назначения из всех компаний пользователя.
- Карточка подрядчика без аккаунта хранится как `PartyStaff` без `authUserId`; обязательны имя и телефон, дополнительно доступны специализация и описание.

## Основные файлы

Product/domain context:

- `server/productContext.js`
- `server/productDbConnect.js`
- `server/partyModels.js`
- `server/partyApi.js`
- `server/getPartyTenantContext.js` — legacy helper; company API больше не должны зависеть от него.
- `server/getPartyMembershipContext.js` — новый multi-company слой.

Schemas:

- `schemas/partyCompaniesSchema.js`
- `schemas/partyUsersSchema.js`
- `schemas/partyStaffSchema.js`
- `schemas/partyLocationsSchema.js`
- `schemas/partyAssignmentsSchema.js`
- `schemas/partyOrdersSchema.js`

Pages:

- `app/party/page.js` — PartyCRM landing.
- `app/company/page.js`
- `app/company/CompanyWorkspaceClient.js`
- `app/performer/page.js`
- `app/performer/PerformerWorkspaceClient.js`

API:

- `app/api/party/health/route.js`
- `app/api/party/auth/login/route.js`
- `app/api/party/auth/register/route.js`
- `app/api/party/auth/logout/route.js`
- `app/api/party/auth/me/route.js`
- `app/api/party/bootstrap/route.js`
- `app/api/party/companies/route.js`
- `app/api/party/me/route.js`
- `app/api/party/memberships/route.js`
- `app/api/party/locations/**`
- `app/api/party/staff/**`
- `app/api/party/orders/**`
- `app/api/party/performer/orders/**`
- `docs/PARTYCRM_ROLES.md` — роли v1 и правила видимости данных.

Deploy/docs:

- `docs/PARTYCRM_DEPLOY_PREVIEW.md`
- `docs/PARTYCRM_LOCAL_DEV.md`
- `docs/PARTYCRM_NGINX.conf`
- `docs/PRODUCTION_ENV_CHECKLIST.md`

## Активная компания

Новый company API слой поддерживает header:

```txt
x-partycrm-company-id: <PartyCompany _id>
```

Если header передан:

- проверяется формат id;
- проверяется membership текущего пользователя;
- чужая компания возвращает `403 partycrm_company_access_denied`.

Если header не передан:

- company API возвращают `400 partycrm_company_id_required`;
- неявный выбор "первой компании" больше не допускается.

`/company` уже:

- грузит `/api/party/memberships`;
- выбирает активную компанию;
- сохраняет выбор в `localStorage` под ключом `partycrm.activeCompanyId`;
- отправляет company API запросы с `x-partycrm-company-id`.
- умеет создать дополнительную компанию через `POST /api/party/companies` и сразу переключиться на нее.

## Что уже сделано

P0 core:

- отдельная PartyCRM DB;
- отдельные PartyCRM users/auth/session cookie, не связанные с ArtistCRM users;
- модели компаний, сотрудников, точек, заказов;
- company workspace `/company`;
- performer workspace `/performer`;
- базовый onboarding компании;
- первая точка/первый сотрудник при создании компании;
- заказы с точкой/выездом, клиентом, оплатами, исполнителями и выплатами;
- проверки конфликтов по точке и исполнителям;
- фильтры заказов;
- финансовая сводка;
- исполнитель видит только свои назначения и выплату;
- `/performer` показывает назначения из нескольких компаний и умеет фильтровать их по компании и статусу участия;
- исполнитель может подтвердить участие и отметить заказ выполненным;
- карточки подрядчиков без аккаунта в `PartyStaff`;
- специализация и описание сотрудника/подрядчика;
- PWA manifest PartyCRM отделен от ArtistCRM;
- PartyCRM имеет сине-голубую палитру;
- `/party/login?callbackUrl=/company` возвращает пользователя обратно в PartyCRM onboarding.

## Что сейчас в работе/следующее

Смотреть `docs/PARTYCRM_ROADMAP.md`.

Ближайшая архитектурная линия:

1. Продолжить contractor/linking track:
   - поиск похожего User по телефону;
   - ручной запрос на привязку;
   - подтверждение привязки в `/performer`.
2. Подготовить основу будущего каталога исполнителей: специализация, описание, история выполненных заказов, статус доступности.
3. Обновить документацию локального запуска и деплоя под multi-company контекст там, где еще остались старые примеры без `x-partycrm-company-id`.

## Важные ограничения

- Не смешивать ArtistCRM DB и PartyCRM DB.
- Не использовать ArtistCRM `/login` и `/api/auth/*` для PartyCRM.
- Не добавлять company-функции в solo ArtistCRM UI.
- Не делать автоматическую привязку подрядчика к аккаунту по телефону.
- Не возвращать silent fallback на "первую компанию" в company API.
- При закрытии roadmap-пункта обновлять `docs/PARTYCRM_ROADMAP.md`, `docs/ROADMAP.md` и bump версии в `package.json` / `package-lock.json`.
- После `next build` убирать generated PWA artifacts из `public`, если они попали в diff.

## Быстрая проверка

Точечный lint:

```bash
npx eslint <changed-files>
```

Production build:

```bash
NODE_OPTIONS='--max-old-space-size=4096' npx next build --webpack
```

На Windows PowerShell:

```powershell
$env:NODE_OPTIONS='--max-old-space-size=4096'; npx next build --webpack
```
