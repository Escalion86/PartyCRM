# PartyCRM Public Leads API и Tilda

## Назначение

Public Leads API принимает заявки с сайта, Tilda и внешних форм в PartyCRM. Заявка создается как `PartyOrder` со статусом `draft`, клиент создается или обновляется по телефону или email, а администраторы компании получают push, если push-уведомления включены в настройках компании.

## Где включить

1. Откройте `Компания -> Настройки -> Интеграции`.
2. Раскройте блок `Входящие заявки API / Tilda`.
3. Включите `Принимать заявки по API`.
4. Нажмите `Создать API key`.
5. Назовите ключ по источнику, например `Tilda`, `Сайт`, `Квиз`.
6. Скопируйте ключ и используйте его только на стороне формы или backend-интеграции.

Один ключ относится к одной компании. Если ключ отключен или удален, новые заявки с ним перестанут приниматься.

## Endpoints

Для обычных JSON-интеграций:

```text
POST https://partycrm.ru/api/party/public/lead
```

Для Tilda и форм, которые отправляют `form-data`:

```text
POST https://partycrm.ru/api/party/public/lead/tilda
```

В локальной разработке замените домен на адрес dev-сервера, например `http://localhost:3000`.

## Авторизация

Передайте API key одним из способов:

- header `x-partycrm-api-key`;
- header `x-public-api-key`;
- header `x-api-key`;
- поле body `apiKey`;
- поле body `api_key`.

Рекомендуемый вариант для backend-интеграции:

```http
x-partycrm-api-key: party_lead_...
```

## Минимальный JSON-запрос

```bash
curl -X POST "https://partycrm.ru/api/party/public/lead" \
  -H "Content-Type: application/json" \
  -H "x-partycrm-api-key: party_lead_..." \
  -d '{
    "name": "Анна",
    "phone": "+7 999 111-22-33",
    "serviceTitle": "День рождения",
    "date": "2026-07-15T15:00:00+07:00",
    "source": "site",
    "comment": "Нужен праздник на 12 детей"
  }'
```

У заявки должно быть хотя бы одно поле клиента: имя, телефон или email.

## Поля JSON API

| Поле | Алиасы | Назначение |
| --- | --- | --- |
| `clientName` | `name`, `fullName`, `contactName` | Имя клиента. |
| `phone` | `clientPhone`, `tel` | Телефон клиента. Сохраняются только цифры. |
| `whatsapp` | `whatsApp` | WhatsApp клиента. Сохраняются только цифры. |
| `telegram` |  | Telegram клиента. |
| `email` |  | Email клиента. |
| `eventDate` | `date`, `datetime` | Дата и время начала заказа. |
| `dateEnd` | `endDate` | Дата и время окончания заказа. |
| `town` | `city` | Город. |
| `address` | `place` | Адрес или комментарий по месту проведения. |
| `comment` | `message`, `description` | Комментарий администратора в заказе. |
| `source` | `utm_source` | Источник заявки. По умолчанию `public_api`. |
| `serviceTitle` | `service`, `product` | Название услуги. |
| `serviceId` |  | ID услуги PartyCRM для явной маршрутизации. |
| `locationId` | `location` | ID точки PartyCRM для явной маршрутизации. |
| `locationTitle` | `placeTitle` | Название точки для маршрутизации по названию. |
| `contractAmount` | `amount`, `price`, `payment` | Договорная сумма в рублях. |

`eventDate`, `dateEnd` передавайте в ISO-формате с часовым поясом. Например: `2026-07-15T15:00:00+07:00`.

## Tilda

Для Tilda используйте endpoint:

```text
https://partycrm.ru/api/party/public/lead/tilda
```

В настройках формы Tilda добавьте webhook и передайте API key. Если Tilda не позволяет задать headers, добавьте скрытое поле формы:

```text
api_key = party_lead_...
```

Endpoint Tilda понимает стандартные поля:

| Поле Tilda | Куда попадет |
| --- | --- |
| `Name`, `name`, `Имя` | имя клиента |
| `Phone`, `phone`, `Телефон` | телефон |
| `Email`, `email`, `Email` | email |
| `Date`, `date`, `Дата` | дата заказа |
| `Service`, `service`, `Услуга` | услуга |
| `Payment`, `payment`, `price`, `Сумма` | договорная сумма |
| `Comment`, `comment`, `Message`, `message` | комментарий |

Источник у Tilda-заявок сохраняется как `Tilda`.

## Маршрутизация по точке, услуге и источнику

PartyCRM выбирает точку и услугу в таком порядке:

1. Явные `locationId` и `serviceId` из payload.
2. Правила `publicLeadRoutingRules` в настройках компании.
3. Совпадение по названиям `locationTitle` и `serviceTitle` среди активных точек и услуг.
4. Fallback: заказ создается без точки и без услуги, но с текстовым `serviceTitle`.

Пример правила в настройках компании:

```json
{
  "publicLeadRoutingRules": [
    {
      "id": "tilda-center-birthday",
      "source": "Tilda",
      "matchLocationTitle": "Центр",
      "matchServiceTitle": "День рождения",
      "locationId": "66...",
      "serviceId": "77...",
      "enabled": true
    }
  ]
}
```

Правило применяется только к активным точкам и услугам. Если ID больше не существует или сущность архивирована, заявка не отклоняется: PartyCRM создаст черновик с fallback и сохранит данные заявки для ручной обработки.

Результат маршрутизации сохраняется в заказе:

- `locationId`;
- `servicesIds`;
- `serviceTitle`;
- `leadSource`;
- `leadSourceLabel`;
- `leadMeta.routing`;
- `leadMeta.raw`.

## Ответы API

Успешный ответ:

```json
{
  "success": true,
  "data": {
    "clientId": "66...",
    "orderId": "77...",
    "status": "draft"
  }
}
```

Ошибки:

| HTTP | Ошибка | Причина |
| --- | --- | --- |
| `400` | `Укажите имя, телефон или email клиента` | В заявке нет данных клиента. |
| `401` | `API key обязателен` | Ключ не передан. |
| `403` | `API key отключен` | Ключ найден, но выключен. |
| `403` | `Неверный API key` | Ключ не найден или прием заявок отключен. |

## Что создается в PartyCRM

1. `PartyClient` создается или обновляется по телефону, если телефон есть.
2. Если телефона нет, клиент ищется по email.
3. `PartyOrder` создается в статусе `draft`.
4. Сумма попадает в `contractAmount` и `clientPayment.totalAmount`.
5. Если сумма больше нуля, статус оплаты становится `wait_prepayment`.
6. Исходный payload сохраняется в `leadMeta.raw`.
7. Если push включен, администраторам компании отправляется уведомление о новой заявке.

## Проверка интеграции

1. Создайте отдельный API key с названием тестового источника.
2. Отправьте тестовый `curl` или заявку из Tilda.
3. Откройте `Компания -> Заказы`.
4. Найдите новый заказ в статусе `draft`.
5. Проверьте клиента, источник, дату, сумму, точку и услугу.
6. После проверки отключите или удалите тестовый ключ, если он больше не нужен.

## Безопасность

- Не публикуйте API key в открытом HTML, если форму можно отправлять напрямую без backend-контроля.
- Для публичных сайтов лучше использовать backend-proxy или скрытое поле Tilda только для low-risk форм.
- Создавайте отдельный ключ на каждый источник, чтобы можно было отключить один источник без остановки остальных.
- Не передавайте в `comment` паспортные данные, банковские карты и другие лишние персональные данные.
