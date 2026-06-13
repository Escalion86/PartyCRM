# PartyCRM Local Development

PartyCRM на старте живет в том же репозитории, что и ArtistCRM, но должен использовать отдельную БД.

## Локальные маршруты

Запуск остается прежним:

```bash
npm run dev
```

Локальная навигация:

```txt
http://localhost:3000/party      публичная страница PartyCRM
http://localhost:3000/company    кабинет компании PartyCRM
http://localhost:3000/performer  кабинет исполнителя PartyCRM
```

В production корень домена `partycrm.ru` переписывается на PartyCRM landing.
Локально для проверки доменной логики можно добавить в `hosts`:

```txt
127.0.0.1 partycrm.local
```

И временно указать:

```env
DOMAIN=partycrm.local
```

Тогда `http://partycrm.local:3000` откроет PartyCRM landing.

ArtistCRM продолжает работать по текущим маршрутам:

```txt
http://localhost:3000
http://localhost:3000/cabinet
```

## Переменные окружения

При запуске обоих продуктов одним локальным process ArtistCRM использует
текущие переменные:

```env
MONGODB_URI=...
MONGODB_DBNAME=artistcrm_dev
DOMAIN=artistcrm.ru
```

PartyCRM использует отдельные переменные:

```env
PARTYCRM_SHARED_RUNTIME=true
PARTYCRM_MONGODB_URI=...
PARTYCRM_MONGODB_DBNAME=partycrm_dev
DOMAIN=partycrm.ru
AUTH_SECRET=local-partycrm-secret
```

Если запускается отдельный process только для PartyCRM, product-specific
переменные можно не задавать: `MONGODB_URI/MONGODB_DBNAME` становятся
fallback и должны указывать на PartyCRM DB. `PARTYCRM_SHARED_RUNTIME` в этом
режиме не задаётся.

Для локальной проверки подключения:

```txt
http://localhost:3000/api/party/health
```

Если PartyCRM БД не настроена, endpoint вернет `503` с кодом `partycrm_db_unavailable`.

## Первый tenant PartyCRM

После настройки PartyCRM БД зарегистрируйся или войди через отдельную страницу PartyCRM:

```txt
http://localhost:3000/party/login?callbackUrl=/company
```

Затем открой:

```txt
http://localhost:3000/company
```

Если для аккаунта еще нет PartyCRM-компании, UI покажет кнопку `Создать компанию`. После нажатия текущий пользователь получит роль `owner`.

Тот же сценарий можно дернуть API-запросом только при наличии активной сессии браузера:

```bash
curl -X POST http://localhost:3000/api/party/bootstrap \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Моя компания\"}"
```

Проверить текущий PartyCRM-доступ:

```txt
http://localhost:3000/api/party/memberships
```

`/api/party/memberships` возвращает список доступных компаний и их `tenantId`.
Для запросов company API и `GET /api/party/me` активную компанию теперь нужно передавать явно через header:

```txt
x-partycrm-company-id: <tenantId из /api/party/memberships>
```

## Первые защищенные API

После создания компании текущий пользователь получает роль `owner` в PartyCRM tenant.

Точки:

```txt
GET    /api/party/locations
POST   /api/party/locations
GET    /api/party/locations/:id
PATCH  /api/party/locations/:id
DELETE /api/party/locations/:id
```

Сотрудники:

```txt
GET    /api/party/staff
POST   /api/party/staff
GET    /api/party/staff/:id
PATCH  /api/party/staff/:id
DELETE /api/party/staff/:id
```

Заказы:

```txt
GET    /api/party/orders
POST   /api/party/orders
GET    /api/party/orders/:id
PATCH  /api/party/orders/:id
DELETE /api/party/orders/:id
POST   /api/party/orders/check-conflicts
```

Кабинет исполнителя:

```txt
GET /api/party/performer/orders
```

Endpoint возвращает только заказы, назначенные текущему `PartyStaff`, и не отдает клиентскую сумму/предоплату.

Правила доступа:

- `owner` и `admin` могут управлять точками и сотрудниками.
- `performer` не может управлять точками и сотрудниками.
- Все company API требуют `x-partycrm-company-id` и фильтруются по `tenantId` выбранной PartyCRM-компании.
- `DELETE` архивирует запись через `status: archived`.
- Последнего `owner` нельзя удалить или понизить.
- Заказ может быть без исполнителей, с точкой компании или с выездным адресом.
- Конфликты проверяются по пересечению интервалов `eventDate` / `dateEnd` для точки и назначенных исполнителей.
- Кабинет исполнителя не показывает полную клиентскую сумму заказа.

## Правило изоляции

- ArtistCRM API должны работать только с ArtistCRM БД.
- PartyCRM API должны работать только с PartyCRM БД.
- Даже в PartyCRM БД все сущности компаний должны хранить `tenantId`.
- Общие схемы и helpers можно переиспользовать, но подключение к БД должно явно получать product context.
- В общем runtime одинаковая пара URI+DB для ArtistCRM и PartyCRM блокируется до подключения.
