# План интеграции IP-телефонии и AI-разбора звонков

## Цель

Сделать так, чтобы после телефонного разговора ArtistCRM помогала артисту не потерять потенциальную заявку:

- фиксировала входящий/исходящий звонок;
- связывала звонок с клиентом по номеру телефона;
- получала запись разговора, если провайдер дает доступ;
- расшифровывала разговор в текст;
- предлагала создать заявку/мероприятие или добавить заметку к существующему клиенту;
- предлагала следующий контакт (`additionalEvents`) на основе договоренности в разговоре.

Ключевое UX-правило: AI готовит черновик, пользователь подтверждает и правит. Автоматически создавать заявки без подтверждения не нужно.

---

## Зависимость от ответа Telefon-IP

Текущий `TELEFONIP` в проекте используется для подтверждения номера через Flash Call. Для новой интеграции нужна отдельная возможность виртуальной АТС.

Нужно подтвердить у Telefon-IP:

- есть ли webhook после завершения звонка;
- какие поля приходят в webhook: `callId`, номер, направление, дата, длительность, статус, ссылка на запись;
- можно ли получить историю звонков через API;
- можно ли скачать запись разговора через API;
- как авторизуется API виртуальной АТС: текущий `TELEFONIP` token или отдельный ключ;
- сколько хранится запись и можно ли копировать ее в наше хранилище;
- есть ли подпись webhook'ов или другой способ проверить источник запроса;
- есть ли тестовый режим/песочница.

Если у Telefon-IP нет webhook/API для записей, план остается применимым для другого провайдера: Zadarma, Mango, UIS/CoMagic, Телфин, МТТ или собственного Asterisk.

---

## Продуктовый сценарий

1. Клиент звонит артисту или артист звонит клиенту.
2. После завершения звонка провайдер отправляет webhook в ArtistCRM.
3. ArtistCRM создает запись звонка в статусе `new`.
4. Backend ищет клиента по телефону.
5. Если доступна запись, backend ставит задачу на обработку:
   - скачать аудио;
   - сохранить ссылку/ключ записи;
   - сделать speech-to-text;
   - извлечь структурированные поля через AI.
6. В кабинете появляется уведомление/виджет:
   - "Новый звонок с номера +7...";
   - "Похоже, это заявка";
   - кнопки: `Создать заявку`, `Добавить заметку`, `Запланировать контакт`, `Игнорировать`.
7. Пользователь открывает черновик, проверяет поля и сохраняет мероприятие.

---

## Модель данных

Новая сущность `Call`:

```js
{
  tenantId,
  provider: 'telefonip',
  providerCallId,
  direction: 'incoming' | 'outgoing',
  phone,
  normalizedPhone,
  startedAt,
  endedAt,
  durationSec,
  status: 'new' | 'processing' | 'ready' | 'linked' | 'ignored' | 'failed',
  recordingUrl,
  recordingStorageKey,
  recordingExpiresAt,
  transcript,
  aiSummary,
  aiExtractedFields: {
    clientName,
    eventType,
    eventDate,
    eventCity,
    eventLocation,
    guestCount,
    budget,
    nextContactAt,
    nextContactReason,
    objections,
    confidence
  },
  linkedClientId,
  linkedEventId,
  processingError,
  createdAt,
  updatedAt
}
```

Индексы:

- `{ tenantId: 1, provider: 1, providerCallId: 1 }` unique;
- `{ tenantId: 1, normalizedPhone: 1, startedAt: -1 }`;
- `{ tenantId: 1, status: 1, createdAt: -1 }`.

---

## Backend/API

Минимальные endpoint'ы:

- `POST /api/telephony/generic/webhook`
  - provider-neutral webhook для будущих adapter'ов IP-телефонии;
  - требует `TELEPHONY_WEBHOOK_SECRET` через `x-telephony-secret` или `Authorization: Bearer ...`;
  - принимает нормализованный payload с `tenantId`, телефоном, датой, направлением, transcript и provider call id;
  - делает upsert по `tenantId + provider + providerCallId`.

- `POST /api/telephony/novofon/webhook`
  - adapter под Novofon/Zadarma HTTP-уведомления;
  - принимает JSON или `application/x-www-form-urlencoded`;
  - основной режим: проверяет индивидуальный secret пользователя из `SiteSettings.custom.novofonWebhookSecret`;
  - fallback для dev-тестов: `NOVOFON_WEBHOOK_SECRET` или общий `TELEPHONY_WEBHOOK_SECRET`;
  - секрет можно передать через `x-novofon-secret`, `x-telephony-secret`, `Authorization: Bearer ...`, `secret` или `token`;
  - `tenantId` можно передать в query/body как `tenantId`, `tenant_id` или `crm_tenant_id`;
  - сохраняет ссылку записи из `file_link`/`record_file_link`/`recording_url`/`record_link`.

- `POST /api/telephony/telefonip/webhook`
  - принимает событие звонка от Telefon-IP;
  - проверяет подпись/секрет;
  - создает или обновляет `Call`;
  - не логирует телефон и персональные данные в открытом виде.

- `GET /api/calls`
  - список звонков текущего tenant;
  - фильтры: `status`, `phone`, `linkedClientId`, `linkedEventId`.

- `GET /api/calls/[id]`
  - карточка звонка с transcript, summary, extracted fields.

- `POST /api/calls/[id]/process`
  - ручной запуск/повтор обработки записи.

- `POST /api/calls/[id]/process-recording`
  - скачивает запись по `recordingUrl`;
  - распознает аудио через `AI_TRANSCRIPTION_PROVIDER`;
  - сохраняет transcript;
  - запускает AI-анализ transcript и обновляет поля звонка.

- `POST /api/calls/[id]/ignore`
  - пометить звонок как не относящийся к клиентам.

- `POST /api/calls/[id]/create-event-draft`
  - вернуть предзаполненный черновик формы мероприятия;
  - не сохранять мероприятие без подтверждения пользователя.

- `POST /api/calls/[id]/link`
  - связать звонок с существующим клиентом/мероприятием.

Все endpoint'ы, кроме provider webhook, должны использовать `getTenantContext()` и фильтровать данные по `tenantId`.

---

## Обработка записи и AI

Рекомендуемый pipeline:

1. Webhook создает `Call`.
2. Фоновая задача скачивает запись, если есть URL.
3. Запись сохраняется во внутреннее хранилище или используется временная ссылка провайдера.
4. Speech-to-text превращает аудио в transcript.
5. LLM получает transcript и возвращает строгий JSON.
6. Backend валидирует JSON, нормализует даты/телефоны/суммы и сохраняет результат.
7. UI показывает черновик с подсветкой уверенности.

Важно:

- при низкой уверенности AI не должен сам подставлять критичные поля без явной пометки;
- даты и суммы нужно показывать пользователю для проверки;
- transcript и аудио являются персональными данными.

---

## UI в кабинете

Первый MVP:

- виджет "Последние звонки" на главном экране кабинета;
- бейдж нового звонка в существующем разделе интеграций/уведомлений;
- модалка звонка:
  - номер;
  - найденный клиент, если есть;
  - дата/длительность;
  - краткое AI-резюме;
  - transcript при раскрытии;
  - кнопки действий.

Действия:

- `Создать заявку`;
- `Добавить заметку к клиенту`;
- `Запланировать контакт`;
- `Связать с мероприятием`;
- `Не клиент`.

Mobile-first:

- модалка должна быть удобна на телефоне;
- основные действия должны помещаться в нижней sticky-зоне;
- transcript по умолчанию скрыт, чтобы не перегружать экран.

---

## Безопасность и персональные данные

Нужно заложить до реализации:

- явное согласие/основание на запись и обработку разговора;
- настройку хранения записей: не хранить, хранить N дней, хранить ссылку провайдера;
- удаление transcript/audio по запросу пользователя;
- безопасные логи без телефонов, transcript и ссылок на записи;
- проверку webhook-подписи или shared secret;
- rate limit на webhook и ручную обработку;
- доступ к звонкам только в рамках tenant.

---

## Этапы реализации

### Этап 0. Уточнение провайдера

- Получить ответ Telefon-IP по webhook/API/записям.
- Выбрать provider adapter contract.
- Определить env-переменные:
  - `TELEPHONY_PROVIDER`;
  - `TELEPHONY_WEBHOOK_SECRET`;
  - `TELEFONIP_PBX_API_TOKEN` или аналог;
  - `AI_TRANSCRIPTION_PROVIDER`;
  - `AI_ANALYSIS_PROVIDER`.

### Этап 1. Call log без AI

- [x] Добавить `Call` schema/model.
- [x] Добавить provider-neutral webhook endpoint.
- [x] Сохранять звонки.
- [x] Показывать список последних звонков.
- [x] Связывать звонок с клиентом по телефону.
- [x] Дать ручные действия: создать заявку, создать клиента, игнорировать.

Критерий готовности: после тестового webhook звонок появляется в CRM и может быть вручную связан с клиентом/заявкой.

### Этап 2. Записи и transcript

- Получать ссылку на запись.
- Скачивать или регистрировать запись.
- Добавить статус обработки.
- Подключить speech-to-text.
- Показывать transcript в карточке звонка.
- Добавить повтор обработки при ошибке.

Критерий готовности: пользователь видит текст разговора и ошибку обработки, если запись недоступна.

### Этап 3. AI-черновик заявки

- [x] Из transcript получать structured JSON через AI adapter.
- [x] Маппить поля в текущую форму мероприятия.
- [x] Предлагать `additionalEvents` для следующего контакта.
- [x] Создавать мероприятие только после подтверждения пользователя.

Критерий готовности: из звонка можно открыть предзаполненную форму заявки и сохранить ее без ручного копирования текста.

---

## Текущее состояние реализации

Реализован provider-neutral MVP без привязки к Telefon-IP:

- модель `Calls`;
- защищенные API `/api/calls`, доступные только при тарифном доступе `allowTelephony` в рамках своего `tenantId`;
- generic webhook `/api/telephony/generic/webhook`, доступный только для tenant'ов разработчика;
- Novofon webhook `/api/telephony/novofon/webhook` с индивидуальной настройкой tenant'а;
- настройки Novofon в `Интеграции`: включение, API key, webhook secret и готовый webhook URL;
- тарифный доступ: IP-телефония доступна только на тарифах с `allowTelephony=true`;
- AI-возможности доступны только на тарифах с `allowAi=true`;
- экран кабинета `Звонки` для журнала звонков пользователя;
- ручное добавление звонка/transcript;
- ручной запуск распознавания записи из карточки звонка;
- AI-анализ transcript через AITunnel/DeepSeek/OpenAI-compatible adapter;
- fallback-черновик без внешнего AI, если ключ не настроен;
- создание клиента и подтверждаемой заявки из звонка.
- push по записи Novofon с действиями `Да`/`Нет`: `Нет` помечает звонок как не требующий заявки, `Да` связывает/создает клиента, распознает запись и создает draft-мероприятие;
- Novofon-звонки показываются в общем диалоге клиента вместе с Avito/VK как сообщения с аудиоплеером записи.

Нужные env для текущего MVP:

- `TELEPHONY_WEBHOOK_SECRET` — секрет generic webhook;
- `NOVOFON_WEBHOOK_SECRET` — fallback-секрет Novofon webhook для dev-тестов, необязательно;
- `AITUNNEL_KEY` — fallback-ключ AITunnel для dev/default сценариев;
- `AI_ANALYSIS_PROVIDER=deepseek` — fallback-провайдер AI-анализа, если у tenant не задан AITunnel key;
- `DEEPSEEK_API_KEY` — ключ DeepSeek для AI-анализа transcript;
- `DEEPSEEK_CALL_ANALYSIS_MODEL=deepseek-v4-flash` — модель DeepSeek, необязательно;
- `AI_ANALYSIS_API_URL` — кастомный endpoint OpenAI-compatible API, необязательно.
- `AI_TRANSCRIPTION_PROVIDER=aitunnel` — fallback-провайдер speech-to-text для записей;
- `OPENAI_API_KEY` — ключ для speech-to-text, если выбран OpenAI;
- `OPENAI_TRANSCRIPTION_MODEL=whisper-1` — модель speech-to-text, необязательно.

В пользовательском сценарии AITunnel key хранится индивидуально в `SiteSettings.custom.aitunnelKey`. Если ключ задан у tenant, распознавание и AI-анализ по умолчанию используют AITunnel.

Для fallback на OpenAI можно использовать:

- `AI_ANALYSIS_PROVIDER=openai`;
- `OPENAI_API_KEY`;
- `OPENAI_CALL_ANALYSIS_MODEL=gpt-4o-mini`.

### Этап 4. Уведомления и умные напоминания

- Push/PWA уведомление о новом звонке с вероятной заявкой.
- Уведомление о необработанных звонках.
- Автопредложение переноса/создания следующего контакта.

Критерий готовности: артист не теряет звонки, по которым нужно перезвонить или создать заявку.

---

## Риски

- Telefon-IP может не дать API для записи звонков.
- Качество аудио может быть недостаточным для надежного извлечения дат/сумм.
- Стоимость transcription/AI может стать заметной при длинных звонках.
- Нужно аккуратно решить юридическую часть записи разговоров.
- Нельзя делать полностью автоматическое создание заявок без подтверждения: ошибки AI будут слишком дорогими.

---

## Ближайшие решения после ответа Telefon-IP

1. Если есть webhook и API записи: делаем provider adapter под Telefon-IP.
2. Если есть только история звонков без webhook: делаем polling endpoint/cron.
3. Если есть запись, но нет API скачивания: MVP ограничить call log и ручными заметками.
4. Если API виртуальной АТС слабый: выбрать другого провайдера или Asterisk как backend телефонии.
