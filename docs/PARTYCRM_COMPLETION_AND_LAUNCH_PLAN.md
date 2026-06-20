# PartyCRM Completion And Launch Plan

Дата аудита: 2026-06-07.

Этот документ фиксирует, что нужно доделать в PartyCRM до полноценного продукта и публичного запуска. Основание: текущий `docs/PARTYCRM_ROADMAP.md`, `docs/PARTYCRM_CONTEXT.md`, `app/company`, `app/party`, `app/performer`, `app/api/party/**`, `schemas/party*`, `server/party*`, настройки компании и сравнение с реализованным ядром ArtistCRM.

## Короткий вывод

PartyCRM уже вышел за рамки идеи и имеет рабочий technical preview: отдельная авторизация PartyCRM, отдельные пользователи, multi-company memberships, компании, точки, клиенты, услуги, сотрудники/подрядчики, заказы, проверки конфликтов, кабинет исполнителя, базовые финансы и отдельные настройки компании.

До полноценного анонса еще рано. Самые важные пробелы: performer-уведомления не завершены, VK/Avito/Novofon настройки не дают полного PartyCRM lead-flow, персональный календарь исполнителя не реализован, а публичный лендинг обещает часть функций, которые еще не готовы.

Рекомендация: позиционировать PartyCRM как закрытый pilot/preview, а официальный запуск делать после закрытия P0/P1 ниже.

## Что уже реализовано

- Отдельная PartyCRM auth-модель: `/party/login`, `/api/party/auth/*`, `PartyUsers`, cookie `partycrm_session`.
- Multi-company слой: `getPartyMembershipContext()`, `/api/party/memberships`, `x-partycrm-company-id`, переключение активной компании.
- Company workspace: `/company`, `/company/orders`, `/company/orders-past`, `/company/clients`, `/company/finance`, `/company/services`, `/company/locations`, `/company/staff`.
- Performer workspace: `/performer`, назначения из нескольких компаний, фильтр по компании и статусу участия.
- Базовые доменные модели: `partyCompaniesSchema`, `partyUsersSchema`, `partyStaffSchema`, `partyLocationsSchema`, `partyClientsSchema`, `partyServicesSchema`, `partyOrdersSchema`, `partyTariffsSchema`, `partyPaymentsSchema`.
- Заказы: клиент, точка или выездной адрес, услуги, исполнители, выплаты, сумма клиента, статусы, доп. события.
- Проверка конфликтов: по точке и исполнителям через `server/partyOrderConflicts.js`.
- Ручная привязка подрядчика к аккаунту: link request от компании и подтверждение исполнителем.
- Настройки компании: вкладки `Общие`, `Интеграции`, `Списки`, `Уведомления`, `Документы`, `Тарифы`.
- Биллинг PartyCRM: тарифы, YooKassa endpoints, Tochka endpoints, платежная модель и базовый tariff purchase flow.
- Публичный лендинг PartyCRM с тарифами, SEO metadata, FAQ и CTA.

## Сравнение с ArtistCRM

| Блок               | ArtistCRM                                                      | PartyCRM сейчас                                                            | Что нужно сделать в PartyCRM                                                                |
| ------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Auth               | NextAuth, телефон, VK ID, восстановление пароля                | Отдельная Party auth и phone verify endpoints                              | Довести rate-limit, восстановление доступа, юридические согласия, session security          |
| Tenant model       | Tenant в рамках пользователя/аккаунта                          | Multi-company membership с `x-partycrm-company-id`                         | Протестировать прямые URL/API, убрать противоречия env-документации                         |
| Заявки/мероприятия | Стабильные Events, statuses, additionalEvents                  | PartyOrders, точки, исполнители, конфликты                                 | Довести order lifecycle: заявка -> бронь -> предоплата -> проведение -> выплаты -> закрытие |
| Финансы            | Отдельные Transactions, категории, статистика                  | В `partyOrdersSchema` есть nested transactions, в `OrderModal` UI-заглушка | Сделать полноценный UI/API транзакций, выплаты, расходы, статусы оплат                      |
| Документы          | Договор/акт, DOCX, реквизиты клиента/артиста                   | Company-реквизиты, пользовательские DOCX и встроенные PartyCRM-шаблоны     | Проверить шаблоны на данных пилотной компании                                                |
| Google Calendar    | Подключение, import/export/sync, reminders                     | Company OAuth и односторонний export заказов готовы; performer export отсутствует | Отдельный безопасный календарь исполнителя без финансов компании                            |
| Public leads/Tilda | `/api/public/lead`, `/api/public/lead/tilda`, API keys         | `/api/party/public/lead`, `/api/party/public/lead/tilda`, company API keys, маршрутизация и push по новым заявкам | Проверить сценарий на pilot-данных                                                          |
| VK/Avito           | Tenant-aware webhooks, conversations, messages, lead creation  | Поля настроек есть, webhook URL указывает на общие `/api/integrations/*`   | Party-specific webhooks, создание PartyOrder/PartyClient, переписки в Party DB              |
| Телефония/AI       | Calls, Novofon, transcription, AI draft                        | Настройки Novofon/AI есть, но нет Party call/order flow                    | Party calls, AI draft order, связь звонка с клиентом и заказом                              |
| Push/offline       | Push subscribe/test/reminders, public lead push, offline queue | Party push subscriptions, push по новым leads, ежедневные reminders и cron с дедупликацией готовы | Performer push и offline queue                                                               |
| Тарифы/биллинг     | Пользовательские тарифы и платежи                              | Party tariffs/payments есть, billing привязан к PartyCompany               | Feature flags и реальные E2E-платежи                                                        |
| Настройки          | Профиль, услуги, интеграции, документы, списки, уведомления    | Есть shell и часть полей                                                   | Расширить company profile, roles, requisites, integrations diagnostics                      |
| SEO/landing        | Несколько посадочных, sitemap, OG, monitoring                  | Один лендинг с обещаниями                                                  | Привести обещания к факту или ускорить реализацию обещанных функций                         |
| Тесты              | Несколько helper unit tests                                    | Точечные tests для настроек и логина                                       | Добавить API/unit/E2E по core flows                                                         |

## P0: довести до надежного закрытого pilot

### 1. Четко зафиксировать scope pilot

- [ ] Решить, что PartyCRM публично называется именно PartyCRM или временно остается рабочим названием.
- [ ] Зафиксировать сегмент первого pilot: праздничные агентства, игровые комнаты, фотостудии или event-команды.
- [ ] Описать один основной happy path: заявка -> заказ -> точка/выезд -> исполнитель -> предоплата -> проведение -> выплата -> закрытие.
- [ ] На лендинге временно убрать или смягчить обещания функций, которые еще не закрыты: персональный календарь исполнителя, телефония и входящие интеграции.
- [ ] Подготовить список того, что входит в pilot, и список того, что осознанно не входит.

### 2. Привести env и DB isolation к одному правилу

Поддерживаются два явных режима: общий runtime использует отдельные `PARTYCRM_MONGODB_*`, а отдельный PartyCRM runtime может использовать обычные `MONGODB_*` как fallback.

- [x] Зафиксировать оба режима: shared runtime с двумя DB env наборами и standalone PartyCRM с обычными `MONGODB_*`.
- [x] Изменить `productDbConnect`, чтобы PartyCRM предпочитал `PARTYCRM_MONGODB_URI/PARTYCRM_MONGODB_DBNAME`.
- [x] Обновить local/deploy/env документацию и описать fallback standalone runtime.
- [x] Добавить startup check: итоговая пара URI+DB ArtistCRM и PartyCRM не совпадает в shared runtime.
- [x] Исправить определение standalone/shared runtime: проверка изоляции включается флагом `PARTYCRM_SHARED_RUNTIME=true` или двумя явными product-specific наборами.
- [x] Проверить `/api/party/health`, `/api/party/memberships`, `/api/party/me` с валидным и чужим `x-partycrm-company-id`: добавлены `server/partyApiCore.test.mjs` и `server/partyApiRoutes.test.mjs`; неактивный membership теперь возвращает `403 partycrm_membership_inactive`.
- [x] Подготовить backup/restore отдельно для PartyCRM DB: `docs/PARTYCRM_BACKUP_RESTORE_RUNBOOK.md`.

### 3. Довести финансы заказов

Сейчас в `partyOrdersSchema` есть `transactions[]`, а `components/party/modals/OrderModal.js` прямо содержит заглушку транзакций. Это главный функциональный разрыв с ArtistCRM.

- [x] Сделать первый инкремент UI/API добавления/редактирования/удаления транзакций внутри сохраненного заказа: отдельная коллекция `transactions`, `/api/party/transactions`, секция `PartyOrderTransactionsSection` в `OrderModal`.
- [x] Поддержать типы `income` и `expense`, категории `deposit`, `final_payment`, `client_payment`, `payout`, `refund`, `taxes`, `materials`, `travel`, `other`.
- [x] В модалке заказа отдельно показывать: договорная сумма, получено, остаток, расходы и валовая маржа по новым транзакциям.
- [x] Добавить статусы выплат исполнителям: запланировано, готово к выплате, выплачено, отменено.
- [x] При закрытии заказа проверять: получены деньги, выплаты исполнителям отмечены, открытые задачи обработаны.
- [x] Дать владельцу/админу фильтры: ждет предоплату, есть долг, есть невыплаченные исполнители, отрицательная маржа.
- [x] Добавить автосохранение нового заказа перед первой транзакцией.
- [x] Перевести summary списков/дашборда с legacy `order.transactions/clientPayment` на отдельную коллекцию `transactions`: `/api/party/orders` прикрепляет актуальные транзакции к заказам.
- [x] Сделать экспорт финансов за период в CSV.
- [x] Покрыть unit-тестами расчет маржи и статусов оплаты.

### 4. Усилить роли и доступы

- [x] Завершить документацию прав в `docs/PARTYCRM_ROLES.md`: кто видит клиентские суммы, выплаты, контакты, настройки, тарифы, интеграции.
- [x] Проверить route guard на прямые URL `/company/settings/integrations`, `/company/settings/documents`, `/company/settings/notifications`, `/company/settings/tariffs`.
- [x] Разделить глобальную роль PartyUser (`admin/dev`) и роль в компании (`owner/admin/performer`) во всех settings/API flow: настройки компании доступны `owner/admin`, а глобальная роль сама по себе доступ не даёт.
- [x] Добавить тесты для `companySettingsTabs`, `getPartyRequestContext`, API management-only endpoints через общий `resolvePartyRequestContext`.
- [x] Запретить исполнителю доступ к `/company/*`, если режим интерфейса только performer.
- [x] Запретить показ полной клиентской суммы и внутренних заметок исполнителю во всех endpoints, не только в UI.

### 5. Сделать company settings полноценными

- [x] `Общие`: добавить профиль компании, контакты, юридическое название, город по умолчанию, формат нумерации заказов.
- [x] `Списки`: добавить типы услуг/мероприятий, статусы подготовки, источники заявок, способы оплаты, категории расходов.
- [x] `Документы`: переименовать `artist*` поля в company/provider terms, сохранить backward-compatible migration.
- [x] `Интеграции`: добавить кнопки `Проверить`, `Подключить`, `Отключить`, `Скопировать webhook`, последняя ошибка, последнее событие.
- [x] `Уведомления`: связать флаг push с реальными подписками и доставкой.
- [x] `Тарифы`: показывать текущий тариф компании, лимиты, окончание периода, историю платежей и CTA оплаты/подключения тарифа.
- [x] `Тарифы`: добавить поле выбора тарифа компании для owner/admin с подключением бесплатного тарифа и оплатой платного тарифа.
- [x] Добавить dev-only раздел `Настройка сайта` в сайдбаре с пунктами `Тарифы`, `Пользователи`, `Компании`, `Разработчик`.
- [x] `Настройка сайта -> Тарифы`: создать dev-only CRUD для тарифных планов PartyCRM.
- [x] `Настройка сайта -> Пользователи/Компании`: добавить dev-only списки с безопасной выдачей пользователей без паролей и обзором тарифов компаний.
- [x] `Настройка сайта -> Компании`: добавить dev-only назначение тарифа выбранной компании.

## P1: функции, без которых публичный запуск будет слабым

### 1. Документы PartyCRM

Переносить основу из ArtistCRM, но не копировать без адаптации.

- [x] Использовать `helpers/generateContractTemplate.js`, `helpers/generateActTemplate.js`, `helpers/exportDocxFromTemplate.js` как техническую основу.
- [x] Добавить Party-specific переменные: компания, клиент, заказ, точка, адрес, услуги, исполнители, суммы, предоплата, остаток, дата/время, реквизиты.
- [x] В заказе добавить кнопки: сформировать договор, сформировать акт, скачать DOCX.
- [x] Поддержать стандартные шаблоны PartyCRM и пользовательские DOCX-шаблоны компании.
- [x] Добавить реквизиты клиента в `partyClientsSchema`, если текущих полей недостаточно.
- [x] Добавить документацию по переменным шаблона в `docs/PARTYCRM_DOCUMENTS_GUIDE.md`.

### 2. Входящие лиды и Tilda

Это один из самых ценных блоков ArtistCRM, его нужно перенести раньше сложных интеграций.

- [x] Создать `/api/party/public/lead` с API-key авторизацией на уровне компании.
- [x] Создать `/api/party/public/lead/tilda` с нормализацией payload Tilda.
- [x] Добавить несколько именованных API-ключей источников в settings компании.
- [x] Создавать или обновлять `PartyClient` по телефону/контактам.
- [x] Создавать `PartyOrder` в статусе `draft` с источником, точкой, услугой, датой/временем и комментарием.
- [x] Добавить маршрутизацию по точке/услуге/источнику.
- [x] Добавить push/in-app уведомление администраторам компании о новой заявке.
- [x] Подготовить пользовательскую инструкцию по API и Tilda: `docs/PARTYCRM_PUBLIC_LEADS_API.md`.

### 3. Push и напоминания

- [x] Создать Party push subscription model или расширить существующую модель с product/company context.
- [x] Добавить `/api/party/push/public-key`, `/subscribe`, `/unsubscribe`, `/test`.
- [x] Отправлять push по новым Party leads.
- [x] Отправлять ежедневные reminders по `PartyOrder.additionalEvents`.
- [ ] Отправлять performer push: новое назначение, изменение даты/адреса, запрос привязки.
- [x] Сделать cron endpoint с company timezone и дедупликацией отправок.

### 4. Google Calendar для PartyCRM

- [x] Выбрать модель v1: один company calendar на компанию, управляемый `owner/admin`.
- [x] Подключить OAuth flow на уровне компании.
- [x] Синхронизировать `PartyOrder` и `additionalEvents` только в направлении PartyCRM -> Google Calendar.
- [x] В событии календаря показывать настраиваемые точку/адрес, услуги, исполнителей и финансовый статус.
- [x] Учитывать изменения заказа, транзакций, даты, исполнителя, точки, удаление и отмену.
- [x] Добавить ручную первичную синхронизацию текущих и будущих заказов с подтверждением.
- [ ] Реализовать отдельный OAuth и ограниченный calendar export для кабинета исполнителя без клиентской суммы.

### 5. VK, Avito, Novofon и AI

Сейчас settings в PartyCRM частично используют helpers ArtistCRM, а webhook URL строятся как `/api/integrations/*`, то есть не являются полноценными Party endpoints.

- [ ] Сделать Party-specific webhooks: `/api/party/integrations/vk/webhook/[token]`, `/api/party/integrations/avito/webhook/[token]`.
- [ ] Хранить и искать настройки в `PartyCompany.settings.integrations`, а не в `SiteSettings`.
- [ ] Создавать `PartyClient` и `PartyOrder`, а не ArtistCRM `Client/Event`.
- [ ] Добавить Party conversation/message models для VK/Avito или product-aware переиспользование существующих моделей.
- [ ] Добавить UI переписки в карточку Party заказа/клиента.
- [ ] Для Novofon создать Party calls flow: звонок -> клиент -> AI draft order.
- [ ] Для AI сделать company-level keys/providers и подтверждаемый черновик заказа.

### 6. Биллинг и тарифы

Текущее ядро Party billing привязано к компании. Пользователь только инициирует платеж как owner/admin выбранной компании.

- [x] Зафиксировать модель: тариф на компанию, плательщик owner/admin, история платежей у компании.
- [x] Убрать привязку тарифа к PartyUser в billing-сценариях.
- [x] Добавить административное назначение тарифа компании через `Настройка сайта -> Компании`.
- [x] Вернуть company tariff access из billing/settings API и привязать UI документов, телефонии и AI к флагам тарифа.
- [x] Добавить backend-enforcement лимитов заказов и сотрудников по тарифу компании.
- [x] Привязать статистику/финансы к `allowStatistics` и calendar id в заказах к `allowCalendarSync`.
- [x] Добавить trial period для новой компании: 14 дней при bootstrap, отображение в настройках тарифа, завершение trial при покупке платного тарифа.
- [x] Добавить onboarding-подсказки следующих шагов в кабинете компании: точка, услуга, сотрудник, первый заказ.
- [x] Добавить welcome-блок после оплаты/активации во вкладке тарифов: статус trial/активного тарифа и следующие шаги.
- [ ] Доделать welcome-сценарии после оплаты/активации: события аналитики, письма/push/in-app уведомления.
- [x] Привязать company Google Calendar к `allowCalendarSync` с API-enforcement во всех календарных endpoints.
- [x] Закрыть billing code risks PartyCRM: тарифные платежи используют цену тарифа, YooKassa successful sync/webhook получает атомарный pending-lock, добавлен контур Tochka create/webhook/sync.
- [ ] Проверить YooKassa create/webhook/sync/renew на реальном тестовом платеже.
- [ ] Проверить Tochka create/JWT webhook/sync на реальном тестовом платеже.
- [x] Добавить страницу истории платежей и текущего тарифа в `/company/settings/tariffs`.
- [ ] Согласовать тексты оплаты/возвратов для PartyCRM отдельно от ArtistCRM.

## P2: развитие после первого pilot

- [x] Invite-flow сотрудников: одноразовые ссылки на 7 дней, вход/регистрация, автоматическая привязка, push управляющим и ручная отправка через SMS/email/Telegram/WhatsApp.
- [ ] Каталог исполнителей: статус доступности, специализация, история выполненных заказов, публичный профиль.
- [ ] Admin checklist: пункты подготовки заказа, назначение администратору, фильтр заказов с открытыми пунктами.
- [ ] Расширенные роли: администратор точки, бухгалтер, менеджер заявок.
- [ ] Платежная ведомость исполнителей за период.
- [ ] Аналитика по точкам, услугам, исполнителям, источникам, конверсии заявок и марже.
- [ ] Расширенный календарь ресурсов: точки, исполнители, выезды, несколько залов внутри одной точки.
- [ ] Импорт клиентов/заказов/сотрудников из CSV/Excel для подключения пилотных компаний.
- [ ] Offline/PWA режим для администратора на выездных мероприятиях.

## Рекомендуемый порядок спринтов

### Sprint 0: Audit и честный preview

- [ ] Смягчить лендинг под фактическое состояние или закрыть обещанные блоки.
- [x] Закрыть env/DB contradiction.
- [x] Подготовить pilot checklist и ручной smoke-test (`docs/PARTYCRM_PILOT_CHECKLIST.md`).
- [ ] Пройти регистрацию, создание компании, точек, услуг, сотрудников, заказа, исполнителя и закрытие заказа.

### Sprint 1: Финансы заказов

- [x] Реализовать UI транзакций в `OrderModal`.
- [x] Добавить операции доход/расход/выплата/возврат.
- [x] Обновить `CompanyWorkspaceClient` finance summary.
- [x] Добавить фильтры долгов и невыплаченных исполнителей.
- [x] Добавить тесты расчетов.

### Sprint 2: Settings, роли и документы

- [ ] Расширить company profile и реквизиты.
- [ ] Исправить artist-терминологию в Party documents.
- [x] Добавить генерацию договора/акта из заказа.
- [ ] Завершить docs по ролям и прямым URL guards.

### Sprint 3: Leads, Tilda и уведомления

- [x] Добавить Party public lead API.
- [x] Добавить Tilda adapter.
- [x] Добавить API keys источников.
- [x] Подключить reminders по задачам.

### Sprint 4: Интеграции

- [ ] Party VK webhook и lead/order flow.
- [ ] Party Avito webhook и lead/order flow.
- [ ] Party Novofon calls.
- [ ] AI draft order.
- [x] Company Google Calendar sync.

### Sprint 5: Биллинг и тарифные ограничения

- [x] Решить company-vs-user billing: тариф хранится на PartyCompany.
- [ ] Проверить YooKassa E2E.
- [ ] Добавить trial и лимиты тарифов.
- [ ] Обновить `/company/settings/tariffs`.

### Sprint 6: Аналитика и pilot operations

- [ ] Дашборд по заказам/деньгам/точкам/исполнителям.
- [ ] Export CSV.
- [ ] Backup/restore PartyCRM.
- [ ] Error monitoring и alerты.

### Sprint 7: Beta launch

- [ ] Подключить 1-3 пилотные компании.
- [ ] Завести реальные точки, услуги, сотрудников, клиентов.
- [ ] 2-4 недели наблюдать реальные заказы.
- [ ] Собрать список блокеров и закрыть только те, что мешают daily work.

### Sprint 8: Public launch

- [ ] Обновить лендинг и SEO.
- [ ] Подготовить инструкции по входящим заявкам, ролям, документам и интеграциям.
- [ ] Подготовить тарифы, trial и поддержку.
- [ ] Провести full smoke на production.
- [ ] Сделать публичный анонс.

## Минимальная acceptance-матрица PartyCRM

- [ ] Новый пользователь регистрируется в `/party/login`, создает первую компанию и возвращается в `/company`.
- [ ] Owner создает точку, услугу, клиента, сотрудника без аккаунта и заказ.
- [ ] Система показывает конфликт, если точка или исполнитель заняты.
- [ ] Заказ содержит сумму клиента, предоплату, остаток, расходы, выплаты и маржу.
- [ ] Исполнитель видит назначение в `/performer`, подтверждает участие и отмечает выполнение.
- [ ] Owner закрывает прошедший заказ, видит финансовый результат и статус выплат.
- [ ] Входящая заявка из API/Tilda создает PartyOrder `draft` и уведомляет администратора.
- [x] Договор и акт по заказу скачиваются в DOCX с реквизитами компании и клиента.
- [ ] Настройки интеграций показывают реальные статусы и последнюю ошибку.
- [ ] Тариф/оплата работают на тестовом платеже и корректно меняют доступные функции.
- [ ] Исполнитель не видит клиентскую сумму и внутренние заметки ни через UI, ни через API.
- [ ] Чужой `x-partycrm-company-id` возвращает `403 partycrm_company_access_denied`.

## Главные риски

- Публичный лендинг сейчас опережает реализацию. Это создает риск потери доверия при первом demo.
- Интеграционные settings выглядят готовыми, но не все входящие потоки Party-specific.
- Финансы заказов считаются в summary, но транзакции в заказе не имеют законченного UI.
- Billing на PartyUser может не совпасть с ожиданием B2B-продукта "тариф на компанию".
- При общем кодовом ядре есть риск случайно писать Party данные в ArtistCRM модели, особенно в VK/Avito/Novofon helpers.
- Тестовое покрытие PartyCRM пока точечное, а критичные сценарии multi-company и прав требуют E2E.

## Рекомендация по запуску

PartyCRM стоит запускать в три шага:

1. Closed preview: 1-3 компании, ручная поддержка, честный список ограничений.
2. Beta: после финансов, документов, лидов, уведомлений и тарифов.
3. Public launch: после реального pilot, E2E интеграций и production monitoring.

Широкий анонс до закрытия P0/P1 лучше не делать. Оптимальная формулировка сейчас: "PartyCRM в закрытом тестировании для event-команд и праздничных агентств".
