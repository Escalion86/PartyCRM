# SEO and optimization audit

Дата: 2026-04-27

## Краткий вывод

Проект уже имеет хорошую базу для публичной главной страницы: `metadata`, canonical, Open Graph/Twitter, `robots.js`, `sitemap.js` и JSON-LD (`Organization`, `SoftwareApplication`, `FAQPage`). Главные точки роста сейчас не в "добавить meta description", а в расширении индексируемых посадочных страниц, стабильности домена/canonical, снижении initial payload кабинета и разделении серверного cache/data layer от UI state.

## SEO

### P0

- Закрыть приватные разделы кабинета от индексации явно: добавить `robots: { index: false, follow: false }` или `generateMetadata` для `/cabinet/**`, `/login`, `/request`, внутренних страниц с пользовательскими данными. Сейчас `robots.js` разрешает весь сайт, а sitemap включает `/login`.
- Убрать `/login` из `sitemap.js` или выставить низкий приоритет без индексации. Для SEO ценности у страницы входа почти нет, а в индексе она размывает релевантность сайта.
- Проверить `DOMAIN` в production. В `app/page.js`, `robots.js`, `sitemap.js` canonical строится из `process.env.DOMAIN`; при неверном значении можно получить неправильный canonical/host.
- Добавить человекочитаемые посадочные страницы под спрос:
  - `/crm-dlya-artistov`
  - `/crm-dlya-vedushchih`
  - `/crm-dlya-muzykantov`
  - `/google-calendar-crm`
  - `/crm-dlya-tilda-zayavok`
  Каждая страница должна иметь уникальный `h1`, title, description, FAQ и внутренние ссылки на главную/тарифы.

### P1

- Добавить хлебные крошки JSON-LD для публичных страниц после появления посадочных.
- Добавить `WebSite` schema с `name`, `url`, `inLanguage`.
- Добавить `lastModified` не как `new Date()` на каждый sitemap-запрос, а из константы релиза/изменения контента. Сейчас sitemap может постоянно выглядеть обновленным без фактических изменений.
- Проверить OG-картинку: сейчас используется app icon 512x512. Для соцсетей лучше отдельная 1200x630 PNG/JPG с названием и продуктовым скрином.
- Убрать декоративные/неинформативные блоки с первого экрана, которые не усиливают запрос. На главной есть сильные фразы, но можно сделать первый экран более конкретным: "CRM для артистов: заявки, оплаты, договоры и напоминания".

## Производительность web

### P0

- Разделить `fetchProps` по страницам. Сейчас почти для всех страниц грузятся `clients`, `transactions`, `services`, `tariffs`, `users`, `siteSettings`, а для кабинета это быстро становится тяжелым initial payload. Минимум:
  - `eventsUpcoming`: события + клиенты для этих событий + транзакции только по этим событиям + services/siteSettings.
  - `eventsPast`: уже есть пагинация событий, но транзакции всё равно грузятся целиком.
  - `clients`: клиенты + агрегированные счетчики/последние события, а события/транзакции клиента догружать при открытии.
  - `transactions`: отдельная пагинация `/api/transactions?limit&cursor`.
- Не грузить `users` всем пользователям без необходимости. Для обычной роли список пользователей чаще не нужен на большинстве страниц.
- Добавить серверные агрегаты для статистики. `StatisticsContent` сейчас считает много на клиенте поверх всех событий/транзакций; при росте данных это лучше перенести в `/api/statistics`.

### P1

- Включить оптимизацию изображений Next.js, если deployment позволяет. Сейчас `next.config.js` содержит `images.unoptimized: true`, что ухудшает LCP на публичных страницах.
- Отключить `productionBrowserSourceMaps: true` в production, если нет обязательного процесса загрузки sourcemaps в error tracking. Это увеличивает артефакты сборки и может раскрывать исходники.
- Разделить тяжелые клиентские блоки через dynamic import: статистика (`@nivo/bar`), rich text/editor, crop/image components, документы DOCX, календарный month-view.
- Проверить PWA precache: не кэшировать приватные API-ответы и крупные runtime-чанки без стратегии обновления. Для CRM важнее надежный shell и offline queue, чем агрессивный precache всего.

## State и TanStack Query

Jotai здесь хорошо подходит для UI state: модалки, тема, размеры окна, локальные фильтры, временная форма, offline/privacy режим. Но серверные коллекции сейчас тоже лежат в Jotai и вручную мутируются через `itemsFuncGenerator`, из-за чего сложнее кешировать, инвалидировать и дозагружать данные.

### Что перевести на TanStack Query

- `events`, `clients`, `transactions`, `services`, `tariffs`, `users`, `siteSettings` как server state.
- Мутации create/update/delete через `useMutation` с `onMutate/onError/onSettled`.
- Инвалидации:
  - событие изменено -> `events`, `event(id)`, связанные `transactions`, `statistics`.
  - транзакция изменена -> `transactions`, `event(id)`, `statistics`, виджеты задатка.
  - клиент изменен -> `clients`, `client(id)`, карточки событий клиента.
- Ключи:
  - `['events', { scope, status, cursor }]`
  - `['event', eventId]`
  - `['transactions', { eventId, clientId, cursor }]`
  - `['clients', { search, cursor }]`
  - `['statistics', filters]`

### Что оставить в Jotai

- `modalsAtom`, `modalsFuncAtom`
- `isSiteLoadingAtom` или заменить точечными query loading states
- локальные фильтры и view mode, если они не должны жить в URL
- offline queue/privacy mode
- window dimensions/device selectors

## UX и продуктовые улучшения

- Добавить сохранение фильтров в URL для событий/транзакций/статистики. Это даст воспроизводимые ссылки и меньше скрытого состояния.
- В карточке мероприятия показывать явный финансовый прогресс: `получено / сумма договора`, расход, чистый итог, наличие задатка.
- Для транзакций добавить быстрые пресеты: `Задаток`, `Полная оплата`, `Налог 6%`, `Комиссия`, `Расход`.
- В редактировании мероприятия не давать добавлять транзакции при несохраненных изменениях формы. Это уже исправлено в коде после аудита: иначе API может видеть старый статус `draft`.
- Для incoming leads добавить экран "Новые заявки" или отдельный бейдж, чтобы public/Tilda лиды не терялись среди будущих мероприятий.
- Добавить "следующее действие" на карточку клиента: ближайшее доп. событие, последний контакт, сумма открытых сделок.
- Для mobile-first: закрепить нижнюю панель быстрых действий в карточке события (`позвонить`, `написать`, `перенести контакт`, `добавить оплату`).

## Технический backlog

- Ввести единый формат ошибок `{ success:false, error:{ code,type,message } }` для старых endpoints, где сейчас возвращается строка.
- Добавить пагинацию и фильтры в `/api/transactions`, `/api/clients`.
- Добавить projection/select в `fetchProps`, не отдавать поля, которые не нужны текущей странице.
- Добавить индексы под фактические запросы:
  - `Events`: `{ tenantId: 1, status: 1, dateEnd: -1, eventDate: -1 }`
  - `Events`: `{ tenantId: 1, 'additionalEvents.date': 1, 'additionalEvents.done': 1 }` для напоминаний/виджетов.
  - `Transactions`: `{ tenantId: 1, eventId: 1, date: -1 }`
  - `Transactions`: `{ tenantId: 1, clientId: 1, date: -1 }`
- Добавить performance budget для публичной главной: Lighthouse mobile, LCP/CLS/TBT, bundle analyzer по PR.
