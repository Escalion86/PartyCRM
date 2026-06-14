# PartyCRM Legal Pages and Google Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Актуализировать публичные документы PartyCRM для Google OAuth verification, требовать три согласия при регистрации без хранения consent-полей и дополнить privacy policy ArtistCRM разделом о Google Calendar.

**Architecture:** Публичные документы остаются статическими Next.js страницами. Регистрация передает три подтверждения в Party API, который валидирует их до создания пользователя, но не сохраняет отдельные consent-флаги или timestamps; существующие аккаунты не затрагиваются. Изменение ArtistCRM изолировано одним документом.

**Tech Stack:** Next.js App Router, React, Mongoose, Node test runner, ESLint.

---

### Task 1: Контракт согласий регистрации PartyCRM

**Files:**
- Modify: `app/api/party/auth/register/route.js`
- Modify: `app/party/login/PartyLoginClient.js`
- Modify: `schemas/partyUsersSchema.js`
- Create: `server/partyRegistrationConsent.test.mjs`

- [ ] **Step 1: Написать failing-тест контракта**

Тест должен прочитать route/client/schema и проверить:

```js
assert.match(routeSource, /consentTerms/)
assert.match(routeSource, /consentPrivacyPolicy/)
assert.match(routeSource, /consentPersonalData/)
assert.doesNotMatch(schemaSource, /consentPrivacyPolicyAccepted/)
assert.doesNotMatch(schemaSource, /consentPersonalDataAccepted/)
assert.doesNotMatch(schemaSource, /privacyPolicyAcceptedAt/)
assert.match(clientSource, /href="\/terms"/)
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `node --test server/partyRegistrationConsent.test.mjs`

Expected: FAIL, потому что `consentTerms` отсутствует, а consent-поля еще есть в schema.

- [ ] **Step 3: Обновить клиент регистрации**

Добавить состояние `termsAccepted`, отдельный checkbox со ссылкой `/terms`, отправку `consentTerms: termsAccepted`. Не объединять три документа в одну галочку.

- [ ] **Step 4: Обновить серверную проверку**

До любых запросов создания пользователя вычислить:

```js
const consentTerms = body?.consentTerms === true
const consentPrivacyPolicy = body?.consentPrivacyPolicy === true
const consentPersonalData = body?.consentPersonalData === true

if (!consentTerms || !consentPrivacyPolicy || !consentPersonalData) {
  return Response.json(
    { error: 'Для регистрации необходимо принять пользовательское соглашение, политику конфиденциальности и согласие на обработку персональных данных' },
    { status: 400 },
  )
}
```

Не добавлять эти значения в объект `PartyUser.create()`.

- [ ] **Step 5: Удалить consent-поля PartyUser**

Удалить из `schemas/partyUsersSchema.js` три поля старого хранения. Не менять ArtistCRM `schemas/usersSchema.js`.

- [ ] **Step 6: Запустить проверки**

Run:

```powershell
node --test server/partyRegistrationConsent.test.mjs
npx eslint app/api/party/auth/register/route.js app/party/login/PartyLoginClient.js schemas/partyUsersSchema.js server/partyRegistrationConsent.test.mjs
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add app/api/party/auth/register/route.js app/party/login/PartyLoginClient.js schemas/partyUsersSchema.js server/partyRegistrationConsent.test.mjs
git commit -m "feat: require PartyCRM legal consents"
```

### Task 2: Публичные документы PartyCRM

**Files:**
- Modify: `app/privacy/page.js`
- Modify: `app/terms/page.js`
- Modify: `app/personal-data-consent/page.js`
- Create: `server/partyLegalPages.test.mjs`

- [ ] **Step 1: Написать failing-тест документов**

Проверить дату `15.06.2026`, отсутствие `ArtistCRM` и `artistcrm.` во всех трех PartyCRM-файлах, наличие `partycrm.ru`, реквизитов ИП и текста Google Calendar в privacy.

```js
assert.doesNotMatch(combined, /ArtistCRM|artistcrm\.(?:com|ru)/)
assert.match(combined, /15\.06\.2026/)
assert.match(privacy, /Google Calendar/)
assert.match(privacy, /Google API Services User Data Policy/)
assert.match(privacy, /Limited Use/)
assert.match(privacy, /удален/i)
```

- [ ] **Step 2: Убедиться, что тест падает**

Run: `node --test server/partyLegalPages.test.mjs`

Expected: FAIL на старой дате и остаточных упоминаниях ArtistCRM.

- [ ] **Step 3: Обновить privacy policy**

Использовать PartyCRM и `https://partycrm.ru`. Добавить отдельный раздел о Google Calendar:

- OAuth email и токены;
- чтение списка доступных календарей;
- создание, изменение и удаление событий выбранного календаря;
- содержание событий формируется из заказов компании;
- данные не используются для рекламы и не продаются;
- Limited Use compliance со ссылкой `https://developers.google.com/terms/api-services-user-data-policy`;
- отключение в настройках и отзыв через Google Account;
- удаление аккаунта по `Escalion86@gmail.com`.

- [ ] **Step 4: Обновить terms и consent**

Заменить ArtistCRM-терминологию на PartyCRM, исправить абсолютные ссылки и поставить дату 15.06.2026. В terms описать company CRM, заказы, точки, сотрудников и внешние интеграции.

- [ ] **Step 5: Запустить проверки**

Run:

```powershell
node --test server/partyLegalPages.test.mjs
npx eslint app/privacy/page.js app/terms/page.js app/personal-data-consent/page.js server/partyLegalPages.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```powershell
git add app/privacy/page.js app/terms/page.js app/personal-data-consent/page.js server/partyLegalPages.test.mjs
git commit -m "docs: update PartyCRM public legal pages"
```

### Task 3: Ссылки на главной странице PartyCRM

**Files:**
- Modify: `app/party/page.js`
- Modify: `server/partyLegalPages.test.mjs`

- [ ] **Step 1: Расширить failing-тест footer**

```js
assert.match(homeSource, /href="\/privacy"/)
assert.match(homeSource, /href="\/terms"/)
assert.match(homeSource, /href="\/personal-data-consent"/)
```

- [ ] **Step 2: Убедиться, что новый assertion падает**

Run: `node --test server/partyLegalPages.test.mjs`

Expected: FAIL для `/personal-data-consent`.

- [ ] **Step 3: Добавить ссылку в footer**

Добавить рядом с существующими документами ссылку `Согласие на обработку персональных данных`, открываемую в новой вкладке с `rel="noreferrer"`.

- [ ] **Step 4: Запустить тест и ESLint**

Run:

```powershell
node --test server/partyLegalPages.test.mjs
npx eslint app/party/page.js server/partyLegalPages.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add app/party/page.js server/partyLegalPages.test.mjs
git commit -m "feat: link PartyCRM public legal documents"
```

### Task 4: Google Calendar section в ArtistCRM

**Files:**
- Modify: `D:/Programming/Projects/ArtistCRM_PartyCRM/ArtistCRM/app/privacy/page.js`
- Create: `D:/Programming/Projects/ArtistCRM_PartyCRM/ArtistCRM/server/googleCalendarPrivacyPolicy.test.mjs`

- [ ] **Step 1: Написать failing-тест ArtistCRM privacy**

```js
assert.match(source, /Google Calendar/)
assert.match(source, /Google API Services User Data Policy/)
assert.match(source, /Limited Use/)
assert.match(source, /отключ/i)
assert.match(source, /удален/i)
```

- [ ] **Step 2: Убедиться, что тест падает**

Run from ArtistCRM: `node --test server/googleCalendarPrivacyPolicy.test.mjs`

Expected: FAIL на отсутствующем полном Google data section.

- [ ] **Step 3: Дополнить только privacy policy ArtistCRM**

Добавить раздел, аналогичный PartyCRM по требованиям Google, но с терминологией ArtistCRM и существующим доменом ArtistCRM. Не менять дату документа, реквизиты, регистрацию, schema или другие страницы без отдельной необходимости.

- [ ] **Step 4: Проверить ArtistCRM**

Run from ArtistCRM:

```powershell
node --test server/googleCalendarPrivacyPolicy.test.mjs
npx eslint app/privacy/page.js server/googleCalendarPrivacyPolicy.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Commit в ArtistCRM**

```powershell
git add app/privacy/page.js server/googleCalendarPrivacyPolicy.test.mjs
git commit -m "docs: explain ArtistCRM Google Calendar data use"
```

### Task 5: Документация, версия и финальная проверка PartyCRM

**Files:**
- Modify: `docs/PARTYCRM_ROADMAP.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Обновить roadmap**

Добавить запись от 2026-06-15: публичные документы приведены к PartyCRM, добавлен Google data disclosure и три обязательных согласия регистрации без дублирования `createdAt` consent-полями.

- [ ] **Step 2: Повысить patch-версию**

Run: `npm version patch --no-git-tag-version`

Expected: `1.4.0 -> 1.4.1`.

- [ ] **Step 3: Запустить целевые тесты PartyCRM**

Run:

```powershell
node --test server/partyRegistrationConsent.test.mjs server/partyLegalPages.test.mjs
npx eslint app/api/party/auth/register/route.js app/party/login/PartyLoginClient.js schemas/partyUsersSchema.js app/privacy/page.js app/terms/page.js app/personal-data-consent/page.js app/party/page.js server/partyRegistrationConsent.test.mjs server/partyLegalPages.test.mjs
npm run build
git diff --check
```

Expected: tests PASS, ESLint PASS, build PASS, diff check clean.

- [ ] **Step 4: Проверить публичные URL**

При доступном локальном сервере открыть `/privacy`, `/terms`, `/personal-data-consent`, главную и регистрацию. Проверить ссылки, три checkbox и отсутствие горизонтального overflow на мобильной ширине. Если сервер или сессия недоступны, явно зафиксировать ограничение, не подменяя browser check сборкой.

- [ ] **Step 5: Commit PartyCRM**

```powershell
git add docs/PARTYCRM_ROADMAP.md package.json package-lock.json
git commit -m "chore: release PartyCRM legal consent update"
```

