# AGENTS.md — руководство для Codex и других агентов

## Описание проекта
- ArtistCRM: CRM для соло-артистов (основной продукт).
- PartyCRM: отдельная система для агентств/мероприятий (заказы), код существует параллельно в `app/company`.
- Ключевая ценность: не терять заявки, не забывать перезвоны, контролировать задатки/оплаты и сроки мероприятий.

## Язык
- Используй в ответах русский язык.

## Главный рабочий план
- Файл: `docs/ROADMAP.md`.
- Это единый источник правды по roadmap, backlog и статусам выполнения.
- Перед началом крупных задач:
  - проверь релевантные пункты в этом файле;
  - если задача закрывает пункт плана, обнови чекбокс и кратко добавь запись в раздел `Выполнено` или `Журнал изменений плана`.
- Статусы в плане:
  - `[ ]` не начато
  - `[-]` в работе
  - `[x]` выполнено
  - `[*]` отложено

## Быстрый вход в проект (5-10 минут)
- 1) Прочитай `docs/ROADMAP.md` (приоритеты, активные эпики, что уже сделано).
- 2) Прочитай `app/cabinet/[page]/page.js` и `app/cabinet/[page]/cabinet.js` (основной entry в кабинет).
- 3) Прочитай `components/StateLoader.js` (инициализация состояния, модалок и `itemsFunc`).
- 4) Прочитай `state/itemsFuncGenerator.js` (CRUD-действия фронта и куда они отправляют запросы).
- 5) Для задач по мероприятиям сразу смотри:
  - `layouts/modals/modalsFunc/eventFunc.js` (редактор события),
  - `layouts/modals/modalsFunc/eventViewFunc.js` (просмотр),
  - `app/api/events/route.js` и `app/api/events/[id]/route.js` (серверная логика),
  - `server/CRUD.js` (синхронизация Google Calendar).
- 6) Для задач по UI-роутингу кабинета смотри `layouts/content/contentsMap.js` и `helpers/constants.js` (`pages`, `pagesGroups`).

## Структура проекта
- `/app`: исходные страницы
- `/app/api`: API
- `/components`: компоненты
- `/schemas`: схемы БД
- `/models`: модели БД
- `/layouts`: крупные компоненты, модальные окна, карточки, листы, контент
- `/svg`: svg-файлы
- `/state`: atom/selectors Jotai и хелперы загрузок
- `/server`: серверные компоненты/логика
- `/helpers`: вспомогательные функции
- `/docs`: документация и рабочие планы
- `/mobile`: отдельный Expo/React Native клиент (параллельный трек, разработка запланирована на будущее, сохраняй обратную совместимость API)

## Текущая архитектура (кратко)
- Web: Next.js App Router + client-side UI на React.
- UI Stack: Смешанный подход. MUI (Material UI) используется для сложных виджетов, компонентов данных и форм; Tailwind CSS — для базовой верстки и утилитарных стилей.
- State: Jotai (`state/atoms`, `state/selectors`, `state/store.js`).
- PWA: Настроен через `@ducanh2912/next-pwa`. Оффлайн-режим и кэширование активны, соблюдай осторожность при изменении статических ассетов и API-роутов.
- Данные в кабинет загружаются серверно через `server/fetchProps.js`, затем кладутся в атомы через `components/StateLoader.js`.
- Модалки: централизованы через `modalsAtom` + `layouts/modals/ModalsPortal.js` + `layouts/modals/modalsFuncGenerator.js`.
- API: `app/api/**/route.js` (tenant-aware через `server/getTenantContext.js`).
- БД: MongoDB + Mongoose (`models/*`, `schemas/*`).

## Текущие продуктовые приоритеты
- P0:
  - контроль следующего контакта по заявке (`nextContactAt` и просрочки);
  - контроль задатка и финансовых статусов;
  - напоминания артисту о важных действиях.
- P1:
  - документы (стандартный договор с автоподстановкой);
  - входящие лиды через API/Tilda.
- Mobile-first обязателен: основные действия должны быть удобны с телефона.

## Стиль кода
- Следуй текущему стилю и принятым правилам именования.
- Делай минимально достаточные изменения без лишних рефакторингов.
- Не ломай существующие рабочие сценарии без явной причины.

## Работа с компонентами
- Используй React-функциональные компоненты и Next.js.
- Применяй проп-тайпинг там, где это уже принято в контексте файла/модуля.
- Для кнопок и интерактивных элементов обеспечивай `cursor: pointer`.

## Куда вносить правки по типовым задачам
- Мероприятия (форма/валидация/доп. поля): `layouts/modals/modalsFunc/eventFunc.js`.
- Просмотр мероприятия и быстрые действия: `layouts/modals/modalsFunc/eventViewFunc.js`, `layouts/cards/EventCard.js`, `layouts/content/EventsContent.js`.
- Логика дополнительных событий и виджетов сроков: `helpers/additionalEvents.js`.
- Синхронизация события и доп. событий с Google Calendar: `server/CRUD.js` (`updateEventInCalendar`).
- Настройки/статус Google Calendar: `app/api/google-calendar/*`, `server/googleUserCalendarClient.js`.
- Импорт из Google Calendar: `app/api/events/google-sync/route.js`, парсинг в `helpers/googleCalendarParsers.js`.
- Публичные лиды/API/Tilda: `app/api/public/lead/route.js`, `app/api/public/lead/tilda/route.js`, документация `docs/PUBLIC_LEADS_API.md`.
- Документы DOCX: `helpers/generateContractTemplate.js`, `helpers/generateActTemplate.js`, `helpers/exportDocxFromTemplate.js`, `docs/DOCX_DOCUMENTS_GUIDE.md`.

## Важное по событиям и календарю
- Каноничные статусы события: `draft`, `active`, `canceled`, `closed`.
- Поле `additionalEvents[]` хранит задачи контактов/напоминания (title, description, date, done, googleCalendarEventId).
- Флаг `calendarImportChecked` влияет на поведение синхронизации.
- Ошибки синка хранятся в `calendarSyncError` (`''`, `calendar_sync_unavailable`, `calendar_sync_failed`).
- При правках синка проверяй сразу две ветки:
  - создание события: `app/api/events/route.js`,
  - обновление/удаление: `app/api/events/[id]/route.js`.

## Работа с API и данными
- Для новых endpoint'ов придерживайся безопасного и единообразного JSON-формата ошибок.
- Не логируй секреты, токены и чувствительные персональные данные.
- Учитывай требования законодательства РФ по работе с персональными данными.
- Любой защищенный API должен проверять tenant через `getTenantContext()`.
- Все CRUD-операции должны учитывать `tenantId` в фильтрах БД.

## Запреты для ИИ
- Запрещено создавать бинарные файлы (картинки, аудио и т.п.), если пользователь явно не запросил и это не согласовано.

## Практика обновления документации
- При заметных изменениях UX/API обновляй соответствующие документы в `/docs`.
- Если изменение относится к roadmap/backlog, синхронизируй `docs/ROADMAP.md` в этом же PR/коммите.

## Команды и проверка
- Web dev: `npm run dev`
- Mobile dev: `cd mobile && npm run start`
- Точечная проверка измененных JS-файлов: `npx eslint <file1> <file2> ...`
- Важно: в текущем состоянии `npm run lint` может работать нестабильно в локальной среде; при необходимости используй точечный `eslint` по измененным файлам.

## Переменные окружения (минимум)
- `MONGODB_URI`, `MONGODB_DBNAME`
- `NEXTAUTH_SECRET` (или fallback через `LOGIN` + `PASSWORD`, но это нежелательно для production)
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`
- `DOMAIN`
- Дополнительно для телефонии/ботов: `TELEFONIP`, `PHONE_SMS_SEND_WEBHOOK`, `TELEGRAM_TOKEN`
- Дополнительно для биллинга (YooKassa/Tochka): `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `TOCHKA_API_TOKEN`, `TOCHKA_MERCHANT_ID`

## Известные особенности кода
- `server/CRUD.js` содержит рабочие экспортируемые функции календаря и legacy-обработчик; в App Router активно используются именно экспортируемые функции (`updateEventInCalendar`, `deleteEventFromCalendar`).
- В проекте есть исторические слои/комментарии, поэтому делай минимальные точечные изменения без массовой «чистки».
- Для удаления сущностей сначала часто вызываются `delete-check` endpoints (events/services/clients) из `modalsFuncGenerator`.

## Версионирование (обязательно)
- Если в рамках задачи закрыт любой пункт roadmap (`[x]`) в `docs/ROADMAP.md`, обязательно обнови версию приложения в `package.json` в этом же наборе изменений.
- По умолчанию используй patch-bump (например, `1.4.2 -> 1.4.3`), если пользователь явно не просил minor/major.

### SemVer правила
- `patch` (`X.Y.Z -> X.Y.(Z+1)`):
  - багфиксы, косметические UI/UX-правки, небольшие доработки без breaking changes.
- `minor` (`X.Y.Z -> X.(Y+1).0`):
  - новая функциональность с обратной совместимостью (новые экраны, виджеты, фильтры, интеграции без ломки текущих API/потоков).
- `major` (`X.Y.Z -> (X+1).0.0`):
  - любые несовместимые изменения (breaking changes): изменение контрактов API, обязательные миграции, удаление/ломка существующего поведения.

### Практика для roadmap
- Закрыт один обычный roadmap-пункт без breaking changes: `patch`.
- Закрыт крупный функциональный блок/эпик (несколько связанных задач с новой ценностью): `minor`.
- Есть breaking changes: `major`.
- Перед любым повышением `major` версии обязательно запросить подтверждение у пользователя и выполнить bump только после явного согласия.

## Мини-чеклист перед завершением задачи
- Изменения не ломают mobile-first сценарии (особенно модалки и карточки на узком экране).
- Для API-правок учтен `tenantId` и авторизация.
- Для изменений событий проверены:
  - форма редактирования,
  - карточка/просмотр,
  - API update/create,
  - синхронизация с Google Calendar (если затронута).
- Если затронута документация/интеграции/roadmap — обновлены соответствующие файлы в `/docs`.
