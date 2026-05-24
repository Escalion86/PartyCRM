# Дизайн: общий `AddressPoolPicker` для ArtistCRM и PartyCRM

## Контекст

Сейчас в проекте есть:

- общий `components/AddressPoolPicker.js`, используемый в ArtistCRM;
- legacy party-specific picker, который дублировал похожую логику для PartyCRM.

Это создает расхождение поведения и увеличивает стоимость поддержки. Цель задачи: сделать один каноничный компонент выбора адреса с пулом сохраненных адресов и переиспользовать его в обоих продуктах, оставив различия только в визуальном оформлении и источнике данных.

## Цель

Сделать единый `AddressPoolPicker`, который:

- одинаково работает в ArtistCRM и PartyCRM по UX;
- сохраняет стилистику PartyCRM через color/theme-адаптацию;
- не смешивает API и хранилища двух продуктов;
- поддерживает адресные поля PartyCRM без регрессии ArtistCRM.

## Нецели

- не делать большой рефакторинг всех адресных компонентов проекта;
- не менять схему хранения данных ArtistCRM;
- не переносить PartyCRM на пользовательские настройки вместо настроек компании;
- не вводить новый сложный theme-system для всего UI.

## Решение

Выбран вариант 3: расширить текущий `components/AddressPoolPicker.js` и использовать его как единый каноничный компонент.

Компонент будет разделен концептуально на два слоя:

1. Общий UI и поведение:
   - выбор сохраненного адреса из пула;
   - раскрытие ручного ввода;
   - сохранение нового адреса в пул;
   - индикация, что адрес уже сохранен.

2. Product-specific адаптация:
   - источник данных пула адресов и городов;
   - способ сохранения данных;
   - цветовые классы и подписи при необходимости.

## Архитектура

### 1. Каноничный `AddressPoolPicker`

`components/AddressPoolPicker.js` становится переиспользуемым компонентом, который умеет работать как в self-managed режиме ArtistCRM, так и в controlled/adapted режиме PartyCRM.

Поддерживаемые группы пропсов:

- данные:
  - `address`
  - `onChange`
  - `poolAddresses`
  - `townOptions`
- действия:
  - `onSaveAddress`
  - `onCreateTown`
- конфигурация:
  - `allowTownCreate`
  - `fieldsVariant`
  - `tone`
  - `label`
  - `wrapperClassName`
  - `labelClassName`
  - `errors`
  - `required`

Если `poolAddresses` и `onSaveAddress` не переданы, компонент использует текущую artist-логику через `siteSettingsAtom` и `POST /api/site`, что сохраняет обратную совместимость для ArtistCRM.

### 2. Party-обертка

Создается тонкая обертка `components/party/inputs/PartyAddressPoolPicker.js`.

Она отвечает только за party-специфику:

- читает `addresses` и `towns` из `companySettings`;
- сохраняет изменения в `PATCH /api/party/company-settings`;
- передает `x-partycrm-company-id`;
- прокидывает в общий `AddressPoolPicker` `tone="party"` и party-классы.

Старый party-specific picker удаляется или заменяется на новую обертку без собственной UI-логики.

## Данные

### ArtistCRM

Хранение остается как есть:

- источник: `siteSettings.addresses`;
- сохранение: `POST /api/site` с `addAddress`.

### PartyCRM

Хранение остается на уровне активной компании:

- источник: `companySettings.addresses` и `companySettings.towns`;
- сохранение: `PATCH /api/party/company-settings`.

Это соответствует продуктовой модели PartyCRM: пул адресов общий для компании, а не для конкретного пользователя.

## Формат адреса

Нужно поддержать различие полей:

- ArtistCRM: `town`, `street`, `house`, `entrance`, `floor`, `flat`, `comment`
- PartyCRM: `town`, `street`, `house`, `room`, `comment`

Поэтому общий компонент не должен быть жестко зашит под один набор полей.

Решение:

- `AddressPoolPicker` использует конфигурацию `fieldsVariant`;
- для `artist` рендерятся текущие artist-поля через существующий `AddressPicker`;
- для `party` рендерится party-набор полей, совместимый с текущим заказом.

Это предотвращает потерю поля `room` в PartyCRM и не тащит party-поля в ArtistCRM.

## UX

В PartyCRM интерфейс должен стать максимально похожим на ArtistCRM по структуре:

- сверху выбор из пула;
- рядом иконка редактирования;
- ниже ручной ввод при раскрытии;
- кнопка сохранения адреса в пул;
- индикатор "уже в пуле".

Но визуально PartyCRM остается party-версией:

- голубая палитра;
- party-стили кнопок и границ;
- party-тон инпутов/селектов.

## Изменения по файлам

- `components/AddressPoolPicker.js`
  - расширить API компонента;
  - вынести различающиеся стили и сохранение в пропсы/адаптацию;
  - добавить поддержку party-варианта полей.
- `components/party/inputs/PartyAddressPoolPicker.js`
  - новая тонкая party-обертка над общим компонентом.
- `components/party/modals/OrderModal.js`
  - заменить использование legacy party picker на новую party-обертку.
- `components/party/inputs/PartyAddressPoolPicker.js`
  - использовать как единственную party-обертку над общим компонентом.

## Риски

1. Регрессия ArtistCRM из-за расширения общего компонента.
   Снижение риска: сохранить backward compatibility по умолчанию и не менять существующий вызов в `eventFunc.js`.

2. Потеря поля `room` в PartyCRM.
   Снижение риска: отдельный `fieldsVariant="party"` и отдельная сигнатура адреса для PartyCRM.

3. Расхождение поведения сохранения адресов между продуктами.
   Снижение риска: общий UI вызывает product-specific `onSaveAddress`, а не содержит party-API внутри себя.

## Тестирование

Нужно проверить вручную:

- ArtistCRM:
  - выбор адреса из пула;
  - ручной ввод адреса;
  - сохранение нового адреса в пул;
  - отсутствие регрессии в форме мероприятия.

- PartyCRM:
  - выбор адреса из company pool;
  - ручной ввод и редактирование;
  - сохранение нового адреса в `companySettings`;
  - сохранение/отображение поля `room`;
  - корректная сборка `customAddress` в модалке заказа.

Нужно прогнать точечный lint по измененным файлам.

## Итог

В проекте остается один каноничный `AddressPoolPicker` с общей логикой и двумя режимами использования:

- ArtistCRM: текущее поведение через `siteSettings`;
- PartyCRM: company-scoped данные и party-оформление через тонкую обертку.
