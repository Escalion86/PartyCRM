// Isolated integration regression runner, alongside interactive CUA validation.
// The caller owns the temporary MongoDB. No credentials or working data are used.
import assert from 'node:assert/strict'
import { createHmac, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { readdir } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Types } from 'mongoose'

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const loadPlaywright = async () => {
  const require = createRequire(import.meta.url)
  if (process.env.PLAYWRIGHT_MODULE)
    return require(process.env.PLAYWRIGHT_MODULE)
  try {
    return require('playwright')
  } catch {}
  const cache = path.join(process.env.LOCALAPPDATA || '', 'npm-cache', '_npx')
  for (const entry of await readdir(cache).catch(() => [])) {
    try {
      return require(path.join(cache, entry, 'node_modules', 'playwright'))
    } catch {}
  }
  throw Error('Укажите PLAYWRIGHT_MODULE: путь к установленному Playwright')
}

export async function runPartyBookingBrowserTest({
  connection,
  uri,
  company,
  type,
  location,
  client,
  service,
  root,
}) {
  const { chromium } = await loadPlaywright()
  const port = await new Promise((resolve) => {
    const server = net.createServer().listen(0, '127.0.0.1', () => {
      const value = server.address().port
      server.close(() => resolve(value))
    })
  })
  const userId = new Types.ObjectId(),
    staffId = new Types.ObjectId(),
    secret = randomBytes(32).toString('hex')
  await connection.db
    .collection('users')
    .insertOne({
      _id: userId,
      phone: '79990000099',
      firstName: 'Проверка',
      role: 'user',
      status: 'active',
      interfaceRoles: ['company'],
      lastWorkspace: 'company',
    })
  await connection.db
    .collection('staff')
    .insertOne({
      _id: staffId,
      tenantId: company._id,
      authUserId: String(userId),
      firstName: 'Проверка',
      role: 'owner',
      status: 'active',
      locationIds: [],
    })
  const origin = `http://127.0.0.1:${port}`
  const child = spawn(
    process.execPath,
    [
      'node_modules/next/dist/bin/next',
      'start',
      '-H',
      '127.0.0.1',
      '-p',
      String(port),
    ],
    {
      cwd: fileURLToPath(root),
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        NODE_ENV: 'production',
        AUTH_SECRET: secret,
        PARTYCRM_MONGODB_URI: uri,
        PARTYCRM_MONGODB_DBNAME: 'partycrm_booking_test',
        ARTISTCRM_MONGODB_URI: uri,
        ARTISTCRM_MONGODB_DBNAME: 'unused_artist_test',
        MONGODB_URI: uri,
        MONGODB_DBNAME: 'unused_artist_test',
        DOMAIN: '127.0.0.1',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    }
  )
  let log = '',
    startError
  child.stdout.on('data', (data) => {
    log = (log + data).slice(-30000)
  })
  child.stderr.on('data', (data) => {
    log = (log + data).slice(-30000)
  })
  child.on('error', (error) => {
    startError = error
  })
  let browser, activePage
  try {
    for (let i = 0; i < 80; i++) {
      if (startError) throw startError
      if (child.exitCode !== null)
        throw Error('Next server exited: ' + log.slice(-1000))
      try {
        if ((await fetch(origin + '/party/login')).ok) break
      } catch {}
      if (i === 79) throw Error('Next server did not start')
      await wait(250)
    }
    browser = await chromium.launch({
      headless: true,
      ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
        : {}),
    })
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: 'ru-RU',
      timezoneId: 'Asia/Krasnoyarsk',
    })
    const payload = Buffer.from(
      JSON.stringify({
        uid: String(userId),
        phone: '79990000099',
        iat: Date.now(),
      })
    ).toString('base64url')
    await context.addCookies([
      {
        name: 'partycrm_session',
        value: `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`,
        url: origin,
      },
    ])
    const page = await context.newPage(),
      errors = []
    activePage = page
    page.setDefaultTimeout(12000)
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(origin + '/company/work', { waitUntil: 'domcontentloaded' })
    await page.setViewportSize({ width: 390, height: 844 })
    await page.getByRole('button', { name: 'Ещё', exact: true }).click()
    await page.waitForFunction(() => document.activeElement?.closest('#party-primary-mobile-menu'))
    assert.equal(await page.getByRole('button', { name: 'Закрыть меню', exact: true }).getAttribute('aria-expanded'), 'true')
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('button', { name: 'Ещё', exact: true }).getAttribute('aria-expanded'), 'false')
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Ещё')
    await page.setViewportSize({ width: 1280, height: 844 })
    console.log('PASS browser: mobile menu announces state, receives focus and closes with Escape')
    await page.getByRole('button', { name: '+ Заказ', exact: true }).click()
    await page.getByRole('dialog').last().waitFor()
    const dialog = page.getByRole('dialog').last()
    const clientTrigger = dialog.getByRole('button', { name: /^Основной клиент/ })
    const clientPicker = page.getByRole('dialog', { name: 'Выбор клиента', exact: true })
    const newClientDialog = page.getByRole('dialog', { name: 'Новый клиент', exact: true })
    const clientSearch = clientPicker.getByLabel('Поиск клиента', { exact: true })
    const clientOptionsPath = '/api/party/order-options/clients'
    const searchClients = async (query) => {
      const [response] = await Promise.all([
        page.waitForResponse((candidate) => {
          const url = new URL(candidate.url())
          return url.pathname === clientOptionsPath &&
            url.searchParams.get('q') === query &&
            candidate.request().method() === 'GET'
        }),
        clientSearch.fill(query),
      ])
      assert.equal(response.ok(), true)
      return (await response.json()).data
    }
    const selectExistingClient = async () => {
      await clientTrigger.click()
      const matches = await searchClients(`8 ${String(client.phone).slice(1)}`)
      assert.ok(matches.some((person) => String(person._id) === String(client._id)))
      await clientPicker.getByRole('button', { name: client.firstName }).click()
      await clientPicker.waitFor({ state: 'hidden' })
      assert.ok((await clientTrigger.textContent()).includes(client.firstName))
    }
    const checkLayout = async () => {
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 844 })
        assert.ok(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), 'Dialog overflows horizontally')
        const bounds = await dialog.boundingBox()
        assert.ok(bounds.x >= -1 && bounds.width <= width + 1)
        if (width === 390) assert.ok(bounds.height >= 840, 'Mobile dialog should fill screen')
      }
    }
    await dialog.getByRole('button', { name: 'Сохранить заявку', exact: true }).click()
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-invalid') === 'true')
    const leadComment = 'Проверка короткой заявки и восстановления'
    await dialog.getByLabel('Суть обращения').fill(leadComment)
    await clientTrigger.click()
    await page.waitForFunction(() => document.activeElement?.type === 'search')
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 })
      assert.ok(await clientPicker.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
    }
    await page.setViewportSize({ width: 390, height: 844 })
    const newClientQuery = '8 (900) 000-04-67'
    const newClientName = 'Клиент браузерной проверки'
    assert.deepEqual(await searchClients(newClientQuery), [])
    const createClient = clientPicker.getByRole('button', { name: 'Создать клиента', exact: true })
    await createClient.click()
    const clientPhone = newClientDialog.getByLabel('Телефон', { exact: true })
    assert.equal((await clientPhone.inputValue()).replace(/\D/g, ''), '9000000467')
    const clientName = newClientDialog.getByLabel('Имя', { exact: true })
    await clientName.fill('Черновик имени')
    await newClientDialog.getByRole('button', { name: 'Отмена', exact: true }).click()
    assert.equal(await clientSearch.inputValue(), newClientQuery)
    await page.waitForFunction(() => document.activeElement?.type === 'search')
    await createClient.click()
    assert.equal((await clientPhone.inputValue()).replace(/\D/g, ''), '9000000467')
    assert.equal(await clientName.inputValue(), 'Черновик имени')
    await clientName.fill(newClientName)
    const [createdClientResponse] = await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname === clientOptionsPath &&
        response.request().method() === 'POST'
      ),
      newClientDialog.getByRole('button', { name: 'Создать и выбрать', exact: true }).click(),
    ])
    assert.equal(createdClientResponse.status(), 201)
    const { data: createdClient } = await createdClientResponse.json()
    const savedClient = await connection.db.collection('clients').findOne({
      _id: new Types.ObjectId(createdClient._id),
      tenantId: company._id,
    })
    assert.equal(savedClient?.firstName, newClientName)
    assert.equal(String(savedClient?.phone), '79000000467')
    await newClientDialog.waitFor({ state: 'hidden' })
    assert.ok((await clientTrigger.textContent()).includes(newClientName))
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label')?.startsWith('Основной клиент:'))
    await selectExistingClient()
    assert.equal(await dialog.getByLabel('Суть обращения').inputValue(), leadComment)
    console.log('PASS browser: client phone search, prefill, cancel and create-and-select')
    await dialog.getByText('Черновик сохранён в этой вкладке на сутки.', { exact: true }).waitFor()
    const acceptReload = (notice) => notice.accept()
    page.on('dialog', acceptReload)
    await page.reload({ waitUntil: 'domcontentloaded' })
    page.off('dialog', acceptReload)
    await page.getByRole('button', { name: '+ Заказ', exact: true }).click()
    await dialog.getByRole('button', { name: 'Восстановить черновик', exact: true }).click()
    assert.ok((await clientTrigger.textContent()).includes(client.firstName))
    assert.equal(await dialog.getByLabel('Суть обращения').inputValue(), leadComment)
    const leadSaved = page.waitForResponse((response) => response.url().endsWith('/api/party/orders') && response.request().method() === 'POST')
    await dialog.getByRole('button', { name: 'Сохранить заявку', exact: true }).click()
    const leadResponse = await leadSaved
    assert.equal(leadResponse.ok(), true)
    const leadBody = await leadResponse.json()
    const lead = await connection.db.collection('orders').findOne({ _id: new Types.ObjectId(leadBody.data._id) })
    assert.equal(String(lead.clientId), String(client._id))
    assert.equal(lead.eventDate, null)
    assert.equal(lead.orderTypeId, null)
    assert.equal(lead.adminComment, leadComment)
    await page.getByRole('dialog').getByRole('button', { name: 'К списку', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    console.log('PASS browser: contact lead saves without type/place/time, restores after reload and focuses validation')
    await page.getByRole('button', { name: '+ Заказ', exact: true }).click()
    await dialog.getByRole('button', { name: 'Оформить бронирование', exact: true }).click()
    await dialog
      .getByLabel('Тип заказа', { exact: true })
      .selectOption(String(type._id))
    await checkLayout()
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    await dialog
      .getByLabel('Помещение', { exact: true })
      .selectOption(String(location._id))
    await checkLayout()
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    await dialog
      .getByLabel('Добавить услугу', { exact: true })
      .selectOption(String(service._id))
    await dialog.getByLabel('Количество', { exact: true }).fill('2')
    await checkLayout()
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    let failAvailability = true
    await page.route('**/api/party/orders/availability', async (route) => {
      if (failAvailability && route.request().postDataJSON()?.dateFrom === '2027-11-01') {
        failAvailability = false
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'qa_booking_unavailable', message: 'Проверка временно недоступна' } }) })
      } else await route.continue()
    })
    await dialog.getByLabel('Месяц', { exact: true }).fill('2027-11')
    await dialog.getByText('Проверка временно недоступна', { exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Повторить проверку', exact: true }).click()
    await dialog
      .getByRole('button', { name: /2027-11-15: есть свободное время/ })
      .click()
    await dialog.getByRole('button', { name: /^10:00 — 11:00$/ }).click()
    await checkLayout()
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    await selectExistingClient()
    await dialog.getByLabel(/^Пожелания/).fill('Длинный бриф: '.repeat(80))
    await checkLayout()
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    await dialog.getByLabel('Получено, ₽', { exact: true }).fill('400')
    await dialog
      .getByRole('button', { name: 'Добавить ожидаемый платёж', exact: true })
      .click()
    await dialog.getByLabel('Сумма, ₽', { exact: true }).fill('800')
    await dialog
      .getByLabel('Крайний срок', { exact: true })
      .fill('2027-11-10T12:00')
    await dialog.getByRole('button', { name: '2. Место', exact: true }).click()
    assert.equal(await dialog.getByRole('button', { name: '6. Финансы', exact: true }).isEnabled(), true)
    await dialog.getByRole('button', { name: '6. Финансы', exact: true }).click()
    console.log('PASS browser: visited steps remain directly reachable after going back')
    const focused = await page.evaluate(() =>
      Boolean(document.activeElement?.closest('[role="dialog"]'))
    )
    assert.equal(focused, true)
    await checkLayout()
    for (let index = 0; index < 24; index++) {
      await page.keyboard.press('Tab')
      assert.ok(await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))), 'Keyboard focus left modal')
    }
    if (typeof process.partyBookingPreview === 'function') {
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 844 })
        await process.partyBookingPreview(await page.screenshot({ type: 'png' }))
      }
    }
    let committedOrderId = ''
    let dropCreateResponse = true
    await page.route('**/api/party/orders', async (route) => {
      if (route.request().method() !== 'POST' || !dropCreateResponse) return route.continue()
      dropCreateResponse = false
      const committed = await route.fetch()
      const result = await committed.json()
      assert.equal(committed.ok(), true, JSON.stringify(result))
      committedOrderId = result.data._id
      await route.abort('failed')
    })
    await dialog.getByRole('button', { name: 'Проверить и создать заказ', exact: true }).click()
    await dialog.getByText(/Связь прервалась/).waitFor()
    page.on('dialog', acceptReload)
    await page.reload({ waitUntil: 'domcontentloaded' })
    page.off('dialog', acceptReload)
    await page.getByRole('button', { name: '+ Заказ', exact: true }).click()
    await dialog.getByRole('button', { name: 'Восстановить черновик', exact: true }).click()
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith('/api/party/orders') &&
        response.request().method() === 'POST'
    )
    await dialog
      .getByRole('button', { name: 'Проверить сохранение', exact: true })
      .click()
    const response = await saved,
      body = await response.json()
    assert.equal(response.ok(), true, JSON.stringify(body))
    const orderId = body.data?._id || body.data?.order?._id
    assert.ok(orderId, 'Created order id missing')
    assert.equal(orderId, committedOrderId, 'Interrupted create must recover the original order')
    await page.unroute('**/api/party/orders')
    console.log('PASS browser: committed create with lost response recovers the same order and advance after reload')
    await page
      .getByRole('dialog', { name: 'Бронирование', exact: true })
      .waitFor({ state: 'hidden' })
    let editor = page.getByRole('dialog').last()
    await editor.getByRole('tab', { name: 'Финансы', exact: true }).click()
    await editor
      .getByRole('button', { name: 'Записать исполнение', exact: true })
      .click()
    await editor
      .getByLabel('Фактически исполнено, ₽', { exact: true })
      .fill('500')
    const fulfilled = page.waitForResponse(
      (response) =>
        response.url().includes('/payment-expectations/') &&
        response.request().method() === 'PATCH'
    )
    await editor
      .getByRole('button', {
        name: 'Подтвердить фактический платёж',
        exact: true,
      })
      .click()
    assert.equal((await fulfilled).ok(), true)
    const expected = await connection.db
      .collection('paymentExpectations')
      .findOne({ orderId: new Types.ObjectId(orderId) })
    assert.equal(expected.paidKopecks, 50000)
    assert.equal(expected.status, 'pending')
    const cash = await connection.db
      .collection('transactions')
      .find({ orderId: new Types.ObjectId(orderId) })
      .toArray()
    assert.equal(cash.length, 2)
    assert.equal(
      cash.reduce((sum, row) => sum + row.amount, 0),
      900
    )
    console.log(
      'PASS browser: actual advance and partial expected payment keep cash distinct'
    )
    await editor.getByRole('tab', { name: 'Приглашение', exact: true }).click()
    await editor
      .getByRole('button', { name: 'Создать приглашение', exact: true })
      .click()
    await editor
      .getByRole('button', { name: 'Опубликовать', exact: true })
      .click()
    const invitation = editor.getByLabel('Публичная ссылка', { exact: true })
    await invitation.waitFor()
    const publicUrl = await invitation.inputValue()
    const publicPage = await context.newPage()
    assert.equal((await publicPage.goto(publicUrl)).status(), 200)
    assert.doesNotMatch(
      await publicPage.locator('body').innerText(),
      /79991234567|Внутреннее имя|Длинный бриф/
    )
    await editor
      .getByRole('button', { name: 'Отключить ссылку', exact: true })
      .click()
    await editor
      .getByRole('button', { name: 'Опубликовать', exact: true })
      .waitFor()
    assert.equal((await publicPage.goto(publicUrl)).status(), 404)
    await publicPage.close()
    console.log(
      'PASS browser: invitation preview/publish/revoke hides internal fields'
    )
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'К списку', exact: true })
      .click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    console.log(
      'PASS browser: six-step creation, long brief, mobile/desktop bounds, keyboard focus'
    )
    await page.getByLabel(/^Сортировка/).selectOption('event_asc')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('label')]
          .find((label) => label.textContent.startsWith('Сортировка'))
          ?.querySelector('select')?.value === 'event_asc'
    )
    await page.goto(
      `${origin}/company/work?companyId=${company._id}&orderId=${orderId}&mode=view`,
      { waitUntil: 'domcontentloaded' }
    )
    await page
      .getByRole('dialog')
      .getByText('Редактировать', { exact: true })
      .waitFor()
    assert.equal(
      await page
        .getByRole('dialog')
        .locator('input:not([readonly]),select,textarea')
        .count(),
      0
    )
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await page.getByRole('button', { name: '+ Заказ', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Оформить бронирование', exact: true }).click()
    await page
      .getByLabel('Тип заказа', { exact: true })
      .selectOption(String(type._id))
    page.once('dialog', (notice) => notice.dismiss())
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('dialog').isVisible(), true)
    page.once('dialog', (notice) => notice.accept())
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await connection.db
      .collection('tasks')
      .insertOne({
        tenantId: company._id,
        title: 'Браузерная проверка переходов',
        orderId: new Types.ObjectId(orderId),
        status: 'new',
        assigneeStaffIds: [staffId],
        createdByStaffId: staffId,
        revision: 0,
        descriptionHtml: '',
        dueAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    await page.goto(`${origin}/company/tasks`, {
      waitUntil: 'domcontentloaded',
    })
    await page
      .getByPlaceholder('Найти по названию или заказу')
      .fill('Браузерная проверка')
    await page
      .getByRole('button', { name: 'Посмотреть заказ', exact: true })
      .first()
      .click()
    await page
      .getByRole('dialog')
      .getByText('Редактировать', { exact: true })
      .waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    assert.equal(
      await page.getByPlaceholder('Найти по названию или заказу').inputValue(),
      'Браузерная проверка'
    )
    await page
      .getByRole('button', { name: 'Карточка клиента', exact: true })
      .first()
      .click()
    await page
      .getByRole('dialog')
      .getByText('Внутреннее имя', { exact: true })
      .waitFor()
    await page.keyboard.press('Escape')
    console.log(
      'PASS browser: sorting preference, read-only deep link, dirty guard and task/client overlays'
    )
    await context.close()
    assert.deepEqual(errors, [], 'Browser runtime errors')
  } catch (error) {
    console.error('Browser check failed:', error.message.slice(0, 1800))
    console.error(
      'Visible UI:',
      await activePage
        ?.locator('body')
        .innerText()
        .then((value) => value.slice(-3000))
        .catch(() => 'Unavailable')
    )
    console.error(
      'Next diagnostics:',
      log
        .split('\n')
        .filter((line) => /Error|failed|Cannot|TypeError/.test(line))
        .slice(-12)
        .join('\n')
    )
    throw error
  } finally {
    await browser?.close()
    child.kill()
    if (child.exitCode === null)
      await new Promise((resolve) => child.once('exit', resolve))
  }
}
