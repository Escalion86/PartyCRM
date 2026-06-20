# Дизайн: маршрутизация входящих заявок PartyCRM

## Контекст

PartyCRM уже умеет принимать входящие заявки через `/api/party/public/lead` и `/api/party/public/lead/tilda`, проверять company API key, создавать или обновлять `PartyClient`, создавать `PartyOrder` в статусе `draft` и отправлять push администраторам компании. В roadmap остается незакрытым пункт PC-LI3: маршрутизация входящих заявок по источнику, точке и услуге.

## Цель

Сделать минимальную маршрутизацию public lead без нового сложного UI: входящая заявка должна уметь выбрать точку и услугу по явным полям payload или по простым правилам в настройках компании, сохраняя безопасный fallback на текущий сценарий создания черновика без точки и услуги.

## Архитектура

Маршрутизация остается в `server/partyPublicLeadCore.js` как чистая логика:

- нормализация route rules из `PartyCompany.settings.publicLeadRoutingRules`;
- резолв явных `locationId`, `locationTitle`, `serviceId`, `serviceTitle`, `source`;
- выбор первого подходящего правила по source/location/service;
- формирование `locationId`, `servicesIds`, `serviceTitle`, `placeType` и route metadata для заказа.

`server/partyPublicLeadService.js` будет загружать активные точки и услуги текущей компании, вызывать helper и передавать результат в `buildPartyPublicLeadOrderPayload`. Обе ручки API используют один service, поэтому JSON API и Tilda получат одинаковое поведение.

## Формат правил

Настройки компании поддерживают массив:

```js
settings.publicLeadRoutingRules = [
  {
    id: 'tilda-birthday',
    source: 'Tilda',
    matchLocationTitle: 'Центр',
    matchServiceTitle: 'День рождения',
    locationId: '<PartyLocation _id>',
    serviceId: '<PartyService _id>',
    enabled: true,
  },
]
```

Все поля кроме `enabled` опциональны. Правило подходит, если все заполненные `source`, `matchLocationTitle`, `matchServiceTitle` совпали с нормализованной заявкой. Если правило не подошло или ведет на несуществующую/архивную сущность, заявка создается без ошибки с текущим fallback.

## Payload

Заявка может передавать явные поля:

- `locationId` или `location`;
- `locationTitle` или `placeTitle`;
- `serviceId`;
- `serviceTitle`, `service` или `product`;
- `source` или `utm_source`.

Явные id имеют приоритет над title-matching и правилами. Title-matching используется только по активным точкам и услугам текущей компании.

## Проверка

Добавляются unit-тесты в `server/partyPublicLeadCore.test.mjs`:

- нормализация явных location/service полей;
- выбор активной точки и услуги по source rule;
- fallback при неизвестной точке/услуге;
- `buildPartyPublicLeadOrderPayload` выставляет `placeType`, `locationId`, `servicesIds`, `serviceTitle` и route metadata.

Точечная проверка: `node --test server/partyPublicLeadCore.test.mjs` и `npx eslint server/partyPublicLeadCore.js server/partyPublicLeadService.js server/partyPublicLeadCore.test.mjs`.
