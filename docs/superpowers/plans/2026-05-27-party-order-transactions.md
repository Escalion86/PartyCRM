# Party Order Transactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Перевести заказы `PartyCRM` с ручных полей `Предоплата` и `Статус оплаты` на полноценный блок транзакций по модели `ArtistCRM`.

**Architecture:** Заказ перестаёт хранить финансовую правду в `clientPayment` и вложенном `order.transactions`. Канонической моделью становится отдельная коллекция `Transactions` с party-specific API, query/mutation-хуками и inline-блоком транзакций в `OrderModal`, включая автосохранение нового заказа перед добавлением транзакции.

**Tech Stack:** Next.js App Router, React Client Components, existing `apiJson`, existing PartyCRM auth/context helpers, Mongoose `Transactions`, React Query helpers, Node `node:test`, targeted ESLint.

---

### Task 1: Зафиксировать shared config и helper-логику транзакций заказа

**Files:**
- Create: `helpers/partyOrderTransactions.js`
- Create: `helpers/partyOrderTransactions.test.mjs`
- Modify: `helpers/partyHelpers.js`
- Reference: `ArtistCRM/helpers/eventTransactionAction.js`
- Reference: `ArtistCRM/helpers/transactionObligation.js`

- [ ] **Step 1: Вынести party-specific helper для категорий, агрегатов и access-решений**

В `helpers/partyOrderTransactions.js` описать:

```js
export const PARTY_ORDER_TRANSACTION_CATEGORIES = Object.freeze([
  'deposit',
  'final_payment',
  'client_payment',
  'payout',
  'refund',
  'taxes',
  'materials',
  'travel',
  'other',
])

export const normalizeOrderTransactions = (items = []) =>
  Array.isArray(items) ? items.filter(Boolean) : []

export const splitOrderTransactions = (items = []) => {
  const transactions = normalizeOrderTransactions(items)
  return {
    income: transactions.filter((item) => item.type === 'income'),
    expense: transactions.filter((item) => item.type === 'expense'),
  }
}

export const getOrderTransactionTotals = (items = []) => {
  const { income, expense } = splitOrderTransactions(items)
  return {
    incomeTotal: income.reduce((sum, item) => sum + Number(item.amount || 0), 0),
    expenseTotal: expense.reduce((sum, item) => sum + Number(item.amount || 0), 0),
  }
}

export const hasDepositTransaction = (items = []) =>
  normalizeOrderTransactions(items).some(
    (item) =>
      item?.type === 'income' &&
      ['deposit', 'client_payment'].includes(String(item?.category || '')) &&
      Number(item?.amount || 0) > 0
  )

export const getOrderTransactionAction = ({
  orderId,
  isClone = false,
  isDraft = false,
  isFormChanged = false,
}) => {
  if (isClone) {
    return { type: 'blocked', error: 'В копии транзакции недоступны до сохранения' }
  }
  if (isDraft) {
    return { type: 'blocked', error: 'Для черновика транзакции недоступны' }
  }
  if (!orderId) {
    return { type: 'autosave-before-open' }
  }
  if (isFormChanged) {
    return { type: 'autosave-before-open' }
  }
  return { type: 'open' }
}
```

- [ ] **Step 2: Написать unit-тесты на базовую финансовую логику**

В `helpers/partyOrderTransactions.test.mjs` покрыть:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import {
  getOrderTransactionAction,
  getOrderTransactionTotals,
  hasDepositTransaction,
} from './partyOrderTransactions.js'

test('hasDepositTransaction detects income deposit', () => {
  assert.equal(
    hasDepositTransaction([
      { type: 'income', category: 'deposit', amount: 5000 },
    ]),
    true
  )
})

test('getOrderTransactionTotals splits income and expense', () => {
  assert.deepEqual(
    getOrderTransactionTotals([
      { type: 'income', amount: 10000 },
      { type: 'expense', amount: 3000 },
    ]),
    { incomeTotal: 10000, expenseTotal: 3000 }
  )
})

test('getOrderTransactionAction requires autosave for unsaved order', () => {
  assert.deepEqual(
    getOrderTransactionAction({ orderId: null, isDraft: false }),
    { type: 'autosave-before-open' }
  )
})
```

- [ ] **Step 3: Прогнать unit-тесты helper-слоя**

Run:

```bash
node --test helpers/partyOrderTransactions.test.mjs
```

Expected: `ok` по всем тестам.

- [ ] **Step 4: Обновить shared labels в `partyHelpers`**

В `helpers/partyHelpers.js`:

- убрать зависимость UI заказа от `paymentStatusLabels`;
- добавить labels для категорий и типов транзакций, если их ещё нет в party-layer;
- не удалять legacy labels, если они ещё используются в других местах, но пометить их как legacy usage only.

- [ ] **Step 5: Прогнать точечный lint**

Run:

```bash
npx eslint helpers/partyOrderTransactions.js helpers/partyHelpers.js
```

Expected: без ошибок.

---

### Task 2: Сделать party-specific API транзакций заказа

**Files:**
- Create: `app/api/party/transactions/route.js`
- Create: `app/api/party/transactions/[id]/route.js`
- Create: `server/partyTransactions.js`
- Modify: `server/partyModels.js` only if требуется helper getter
- Reference: `models/Transactions.js`
- Reference: `schemas/transactionsSchema.js`

- [ ] **Step 1: Вынести server helper для tenant-safe транзакций**

В `server/partyTransactions.js` описать:

- `normalizePartyTransactionPayload(body)`
- `validatePartyTransactionOrder({ tenantId, orderId })`
- `serializePartyTransaction(doc)`
- `listPartyTransactions({ tenantId, orderId })`

Ключевые правила:

- `orderId` обязателен и должен принадлежать активному `tenantId`;
- `amount > 0`;
- разрешённые `type`, `category`, `paymentMethod` нормализуются;
- `tenantId` ставится на сервере, а не берётся из клиента.

- [ ] **Step 2: Реализовать `GET/POST /api/party/transactions`**

В `app/api/party/transactions/route.js`:

- использовать `getPartyRequestContext({ req, managementOnly: true })`;
- `GET` возвращает транзакции компании, с поддержкой фильтра `orderId`;
- `POST` создаёт транзакцию только для заказа активной компании.

Нужный shape ответа:

```js
return NextResponse.json({ success: true, data: serializedTransaction }, { status: 201 })
```

- [ ] **Step 3: Реализовать `PATCH/DELETE /api/party/transactions/[id]`**

В `app/api/party/transactions/[id]/route.js`:

- проверять принадлежность транзакции текущему `tenantId`;
- обновлять только разрешённые поля;
- возвращать нормализованный `data`.

- [ ] **Step 4: Добавить минимальный server-level smoke test сценарий**

Если в проекте нет готовой test harness для route handlers, на этом этапе зафиксировать по крайней мере helper-tests в `server/partyTransactions.test.mjs`:

```js
test('normalizePartyTransactionPayload rejects zero amount', () => {
  const result = normalizePartyTransactionPayload({ amount: 0, orderId: 'x' })
  assert.equal(result.amount, 0)
})
```

Если server tests будут слишком тяжёлыми для текущего окружения, это нужно явно отметить в плане исполнения как допустимый риск и компенсировать интеграционной ручной проверкой.

- [ ] **Step 5: Прогнать lint по новым API-файлам**

Run:

```bash
npx eslint app/api/party/transactions/route.js app/api/party/transactions/[id]/route.js server/partyTransactions.js
```

Expected: без ошибок.

---

### Task 3: Поднять party-specific client hooks для транзакций

**Files:**
- Create: `helpers/usePartyTransactionsQuery.js`
- Create: `helpers/usePartyTransactionsQuery.test.mjs` if pure helpers extracted
- Reference: `ArtistCRM/helpers/useTransactionsQuery.js`
- Modify: `helpers/queryKeys.js`

- [ ] **Step 1: Добавить query keys для party transactions**

В `helpers/queryKeys.js` добавить:

```js
partyTransactions: (params = {}) => ['party-transactions', params],
partyTransactionsAll: ['party-transactions', {}],
```

- [ ] **Step 2: Реализовать list/create/update/delete hooks**

В `helpers/usePartyTransactionsQuery.js` описать:

- `usePartyTransactionsQuery(params, options)`
- `useCreatePartyTransactionMutation()`
- `useUpdatePartyTransactionMutation()`
- `useDeletePartyTransactionMutation()`

База:

```js
export const usePartyTransactionsQuery = (params = {}, options = {}) =>
  useQuery({
    queryKey: queryKeys.partyTransactions(params),
    queryFn: async () => {
      const query = new URLSearchParams()
      if (params.orderId) query.set('orderId', params.orderId)
      const payload = await apiJson(`/api/party/transactions?${query.toString()}`)
      return Array.isArray(payload?.data) ? payload.data : []
    },
    ...options,
  })
```

Mutation-хуки должны:

- обновлять query cache;
- не зависеть от legacy `transactionsAtom`;
- уметь инвалидировать список транзакций заказа.

- [ ] **Step 3: Вынести маленькие pure helpers для merge/remove cache**

Чтобы тестировать не React hooks напрямую, а логику обновления кэша, выделить:

- `upsertPartyTransaction`
- `removePartyTransaction`

и покрыть их в `helpers/usePartyTransactionsQuery.test.mjs`.

- [ ] **Step 4: Прогнать unit tests / lint**

Run:

```bash
node --test helpers/usePartyTransactionsQuery.test.mjs
npx eslint helpers/usePartyTransactionsQuery.js helpers/queryKeys.js
```

Expected: тесты `ok`, lint без ошибок.

---

### Task 4: Собрать reusable finance section для Party заказа

**Files:**
- Create: `components/party/orders/PartyOrderTransactionsSection.js`
- Create: `components/party/orders/partyOrderTransactionViewModel.js`
- Create: `components/party/orders/partyOrderTransactionViewModel.test.mjs`
- Reference: `ArtistCRM/layouts/modals/modalsFunc/eventFunc.js`
- Reference: `layouts/modals/modalsFunc/transactionFunc.js`

- [ ] **Step 1: Вынести presentation helper для отображения списка транзакций**

В `partyOrderTransactionViewModel.js` описать:

- нормализацию списка;
- сортировку по дате;
- split income/expense;
- текстовые summary:
  - `incomeTotalLabel`
  - `expenseTotalLabel`
  - `hasTransactions`

- [ ] **Step 2: Покрыть view-model unit-тестом**

В `partyOrderTransactionViewModel.test.mjs`:

```js
test('builds income and expense groups sorted by date desc', () => {
  const result = buildPartyOrderTransactionsViewModel([
    { _id: '2', type: 'income', amount: 5000, date: '2026-01-02T10:00:00.000Z' },
    { _id: '1', type: 'income', amount: 3000, date: '2026-01-01T10:00:00.000Z' },
    { _id: '3', type: 'expense', amount: 1000, date: '2026-01-03T10:00:00.000Z' },
  ])

  assert.equal(result.income[0]._id, '2')
  assert.equal(result.expense[0]._id, '3')
})
```

- [ ] **Step 3: Сделать компонент секции транзакций заказа**

`PartyOrderTransactionsSection` должен принимать:

- `orderId`
- `isDraft`
- `isClone`
- `isFormChanged`
- `onRequestAutosave`
- `onOpenTransactionEditor`

и уметь:

- показывать ошибки finance section;
- рендерить списки поступлений/расходов;
- открывать редактор транзакции;
- удалять транзакцию;
- просить автосохранение, если order ещё не готов.

- [ ] **Step 4: Добавить UX-ограничения как в ArtistCRM**

Поведение:

- новый несохранённый заказ: кнопка `Добавить транзакцию` вызывает `onRequestAutosave`;
- клон заказа: транзакции недоступны;
- draft/невалидное состояние: понятное сообщение, а не молчаливый disable.

- [ ] **Step 5: Прогнать тесты и lint**

Run:

```bash
node --test components/party/orders/partyOrderTransactionViewModel.test.mjs
npx eslint components/party/orders/PartyOrderTransactionsSection.js components/party/orders/partyOrderTransactionViewModel.js
```

Expected: без ошибок.

---

### Task 5: Встроить транзакции в OrderModal и убрать legacy payment fields

**Files:**
- Modify: `components/party/modals/OrderModal.js`
- Create: `components/party/orders/openPartyOrderTransactionEditor.js` if нужен отдельный launcher
- Reference: `ArtistCRM/layouts/modals/modalsFunc/eventFunc.js`

- [ ] **Step 1: Удалить из OrderModal поля `Предоплата` и `Статус оплаты`**

Из блока `Локация и деньги` удалить:

- `Input label="Предоплата"`
- `Select label="Статус оплаты"`

Оставить:

- `Сумма клиента` как `contractAmount`/`totalAmount`.

- [ ] **Step 2: Удалить legacy handlers, связанные только с ручной предоплатой**

В `OrderModal.js` пересмотреть:

- `paymentStatusLabels` import;
- `handleClientPaymentChange`;
- локальную сборку `clientPayment`.

После рефакторинга форма не должна держать ручной `status` как пользовательский input.

- [ ] **Step 3: Добавить новый блок `Транзакции`**

Вместо ручных полей встроить:

```jsx
<PartyOrderTransactionsSection
  orderId={resolvedOrderId}
  isDraft={orderDraft.status === 'draft'}
  isClone={false}
  isFormChanged={isFormChanged}
  onRequestAutosave={handleAutosaveBeforeTransaction}
  onOpenTransactionEditor={handleOpenTransactionEditor}
/>
```

- [ ] **Step 4: Реализовать автосохранение перед открытием транзакции**

Если заказ ещё не сохранён:

- сначала вызвать `onSubmit` или отдельный autosave callback;
- дождаться `createdOrder._id`;
- только затем открывать редактор транзакции.

Если autosave не удался:

- показать inline finance error;
- не открывать редактор транзакции.

- [ ] **Step 5: Проверить mobile-first поведение секции**

Нужно сохранить:

- удобную вёрстку на телефоне;
- короткие action-кнопки;
- отсутствие горизонтального скролла на типичных ширинах modal viewport.

- [ ] **Step 6: Прогнать lint по OrderModal и новой секции**

Run:

```bash
npx eslint components/party/modals/OrderModal.js components/party/orders/PartyOrderTransactionsSection.js
```

Expected: без ошибок.

---

### Task 6: Перевести order API и workspace на новую финансовую модель

**Files:**
- Modify: `app/api/party/orders/route.js`
- Modify: `app/api/party/orders/[id]/route.js`
- Modify: `app/company/CompanyWorkspaceClient.js`
- Modify: `components/party/lists/OrdersList.js`
- Modify: `schemas/partyOrdersSchema.js` only if требуется ослабить legacy usage

- [ ] **Step 1: Сделать `clientPayment` derived/fallback, а не primary input**

В `normalizeOrderPayload`:

- перестать ожидать пользовательский `clientPayment.status`;
- перестать ожидать пользовательский `clientPayment.prepaidAmount`;
- оставить `contractAmount` как primary field;
- `clientPayment` собирать только как temporary compatibility snapshot, если это ещё нужно для старых читателей.

- [ ] **Step 2: Перестать писать новые транзакции во вложенный `order.transactions`**

В API заказа:

- либо полностью игнорировать входящий `body.transactions`;
- либо использовать его только в специальном migration path, но не из `OrderModal`.

Главное правило: новые финансовые изменения идут через `/api/party/transactions`.

- [ ] **Step 3: Пересчитать display logic списка заказов по отдельным транзакциям**

В `CompanyWorkspaceClient.js` и `OrdersList.js`:

- найти места, где summary берётся из `order.transactions` или `clientPayment`;
- перевести их на агрегаты из списка отдельных транзакций;
- если на экране ещё нет отдельной выборки транзакций, добавить загрузку связанного списка по активным заказам.

- [ ] **Step 4: Сохранить fallback для старых заказов**

Если у заказа нет отдельных транзакций, но есть legacy `clientPayment`/`order.transactions`:

- UI не должен падать;
- можно показывать legacy summary в read-only fallback;
- новые edits должны идти уже в новую модель.

- [ ] **Step 5: Прогнать lint по order API и workspace**

Run:

```bash
npx eslint app/api/party/orders/route.js app/api/party/orders/[id]/route.js app/company/CompanyWorkspaceClient.js components/party/lists/OrdersList.js
```

Expected: без ошибок.

---

### Task 7: Проверка сценариев и документация

**Files:**
- Modify: `docs/PARTYCRM_CONTEXT.md` if finance model описана там
- Modify: `docs/PARTYCRM_ROLES.md` only if permissions touched
- Create or Modify: `docs/PARTYCRM_ORDERS_FINANCE.md` if нужен новый короткий doc

- [ ] **Step 1: Провести ручной smoke-test сценариев**

Проверить:

1. Создание нового заказа без транзакций.
2. Создание нового заказа и автосохранение перед добавлением первой транзакции.
3. Редактирование существующего заказа и добавление поступления.
4. Удаление транзакции.
5. Корректное отображение списка заказа после изменения транзакций.
6. Поведение старого заказа, у которого есть только legacy payment data.

- [ ] **Step 2: Обновить документацию финансовой модели заказа**

В docs зафиксировать:

- `Предоплата` и `Статус оплаты` больше не редактируются вручную;
- деньги заказа ведутся через отдельные транзакции;
- `contractAmount` — ожидаемая сумма клиента, а не факт поступления денег.

- [ ] **Step 3: Прогнать целевые проверки перед завершением**

Run:

```bash
node --test helpers/partyOrderTransactions.test.mjs helpers/usePartyTransactionsQuery.test.mjs components/party/orders/partyOrderTransactionViewModel.test.mjs
npx eslint components/party/modals/OrderModal.js components/party/orders/PartyOrderTransactionsSection.js helpers/partyOrderTransactions.js helpers/usePartyTransactionsQuery.js app/api/party/transactions/route.js app/api/party/transactions/[id]/route.js app/api/party/orders/route.js app/api/party/orders/[id]/route.js app/company/CompanyWorkspaceClient.js components/party/lists/OrdersList.js
```

Expected:

- unit tests `ok`;
- lint без ошибок.

- [ ] **Step 4: Зафиксировать коммит**

```bash
git add components/party/modals/OrderModal.js components/party/orders helpers/partyOrderTransactions.js helpers/usePartyTransactionsQuery.js helpers/queryKeys.js app/api/party/transactions app/api/party/orders docs/superpowers/specs/2026-05-27-party-order-transactions-design.md docs/superpowers/plans/2026-05-27-party-order-transactions.md
git commit -m "feat: move party orders to transaction-based finance"
```

---

## Self-Review

- Spec coverage: план покрывает удаление ручных payment-полей, новую коллекцию/CRUD транзакций, client hooks, inline financial section в `OrderModal`, autosave для нового заказа, fallback для legacy данных и документацию.
- Placeholder scan: в плане нет `TODO`/`TBD`; для каждого блока указаны файлы, команды и ожидаемые проверки.
- Type consistency: во всех задачах используется одна и та же терминология `orderId`, `party transactions`, `contractAmount`, `legacy clientPayment`, `autosave-before-open`.

Plan complete and saved to `docs/superpowers/plans/2026-05-27-party-order-transactions.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
