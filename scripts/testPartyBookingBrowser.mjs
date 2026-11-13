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
import { getPartyOrderWizardDraftScope } from '../helpers/partyOrderWizardDraft.js'

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
    const refreshSession = async () => {
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
    }
    await refreshSession()
    const page = await context.newPage(),
      errors = []
    activePage = page
    page.setDefaultTimeout(12000)
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto(origin + '/company/work', { waitUntil: 'domcontentloaded' })
    await page.setViewportSize({ width: 390, height: 844 })
    const boardRegion = page.locator('[aria-label="Колонки доски заказов"]')
    await boardRegion.waitFor()
    assert.ok(await boardRegion.evaluate((board) => board.scrollWidth > board.clientWidth))
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
    const directClient = dialog.getByRole('button', { name: 'Создать клиента', exact: true })
    await directClient.click()
    await newClientDialog.getByLabel('ФИО', { exact: true }).fill('Новый Клиент')
    await newClientDialog.getByLabel('Телефон', { exact: true }).fill('900000046')
    await newClientDialog.getByRole('button', { name: 'Создать и выбрать', exact: true }).click()
    await newClientDialog.getByRole('alert').filter({ hasText: 'Введите полный номер телефона или очистите поле.' }).waitFor()
    await newClientDialog.getByRole('button', { name: 'Отмена', exact: true }).click()
    await newClientDialog.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => document.activeElement?.textContent.trim() === 'Создать клиента')
    assert.equal(await clientPicker.count(), 0)
    console.log('PASS browser: direct client creation checks partial phone and returns to the lead')
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
    const newClientName = 'Проверочный'
    assert.deepEqual(await searchClients(newClientQuery), [])
    const createClient = clientPicker.getByRole('button', { name: 'Создать клиента', exact: true })
    await createClient.click()
    const clientPhone = newClientDialog.getByLabel('Телефон', { exact: true })
    assert.equal((await clientPhone.inputValue()).replace(/\D/g, ''), '9000000467')
    const clientName = newClientDialog.getByLabel('ФИО', { exact: true })
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
    const { key: draftKey } = getPartyOrderWizardDraftScope({ tenantId: company._id, staff: { _id: staffId } })
    await page.waitForFunction(({ key, clientId, comment }) => {
      const saved = sessionStorage.getItem(key)
      if (!saved) return false
      const { draft } = JSON.parse(saved).value
      return draft.clientId === clientId && draft.adminComment === comment
    }, { key: draftKey, clientId: String(client._id), comment: leadComment })
    assert.equal(await dialog.getByText('Черновик сохранён в этой вкладке на сутки.', { exact: true }).count(), 0)
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
    await page.getByRole('dialog').getByRole('button', { name: 'Отмена', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    console.log('PASS browser: contact lead saves without type/place/time, restores after reload and focuses validation')
    await page.getByRole('button', { name: '+ Заказ', exact: true }).click()
    await selectExistingClient()
    const bookingLeadComment = 'Заметка для проверки создания типа заказа'
    await dialog.getByLabel('Суть обращения').fill(bookingLeadComment)
    const beginBooking = dialog.getByRole('button', { name: 'Оформить бронирование', exact: true })
    await beginBooking.click()
    await dialog.getByRole('heading', { name: 'Тип', exact: true }).waitFor()

    const orderTypeSelect = dialog.getByLabel('Тип заказа', { exact: true })
    const addOrderType = dialog.getByRole('button', { name: 'Добавить тип заказа', exact: true })
    const newTypeDialog = page.getByRole('dialog', { name: 'Новый тип заказа', exact: true })
    const typeTitle = newTypeDialog.getByLabel('Название типа', { exact: true })
    const newTypeTitle = 'Тип браузерной проверки'
    const newTypeOption = orderTypeSelect.locator('option').filter({ hasText: newTypeTitle })
    const originalTypeId = String(type._id)
    const [selectBounds, plusBounds] = await Promise.all([orderTypeSelect.boundingBox(), addOrderType.boundingBox()])
    assert.ok(selectBounds && plusBounds && plusBounds.x >= selectBounds.x + selectBounds.width - 1)
    await orderTypeSelect.selectOption(originalTypeId)
    await addOrderType.click()
    await typeTitle.fill(newTypeTitle)
    const cancelType = newTypeDialog.getByRole('button', { name: 'Отмена', exact: true })
    const discardType = page.getByRole('alertdialog')
    await cancelType.click()
    await discardType.waitFor()
    await page.keyboard.press('Escape')
    await discardType.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => document.activeElement?.textContent.trim() === 'Отмена')
    assert.equal(await typeTitle.inputValue(), newTypeTitle)
    await cancelType.click()
    await discardType.getByRole('button', { name: 'Закрыть без сохранения', exact: true }).click()
    await newTypeDialog.waitFor({ state: 'hidden' })
    assert.equal(await orderTypeSelect.inputValue(), originalTypeId)
    assert.equal(await newTypeOption.count(), 0)

    await addOrderType.click()
    await typeTitle.fill(newTypeTitle)
    const [createdTypeResponse] = await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname === '/api/party/order-types' &&
        response.request().method() === 'POST'
      ),
      newTypeDialog.getByRole('button', { name: 'Добавить тип', exact: true }).click(),
    ])
    assert.equal(createdTypeResponse.status(), 201)
    const { data: createdType } = await createdTypeResponse.json()
    const storedType = await connection.db.collection('orderTypes').findOne({
      _id: new Types.ObjectId(createdType._id),
      tenantId: company._id,
    })
    assert.equal(storedType?.title, newTypeTitle)
    await newTypeDialog.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Добавить тип заказа')
    assert.equal(await orderTypeSelect.inputValue(), String(createdType._id))
    assert.equal(await newTypeOption.count(), 1)

    await dialog.getByRole('button', { name: 'Назад', exact: true }).click()
    assert.ok((await clientTrigger.textContent()).includes(client.firstName))
    assert.equal(await dialog.getByLabel('Суть обращения').inputValue(), bookingLeadComment)
    await beginBooking.click()
    assert.equal(await orderTypeSelect.inputValue(), String(createdType._id))
    console.log('PASS browser: adding an order type restores focus, selects the type and preserves the lead')

    await orderTypeSelect.selectOption(originalTypeId)
    await checkLayout()
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    const place = dialog.getByLabel('Место проведения', { exact: true })
    await place.selectOption('client_address')
    const addressEditor = dialog.getByRole('group', { name: 'Адрес выезда', exact: true })
    await addressEditor.getByLabel('Город', { exact: true }).fill('Красноярск')
    await addressEditor.getByLabel('Улица', { exact: true }).fill('Тестовая')
    await addressEditor.getByLabel('Дом', { exact: true }).fill('12')
    await place.selectOption('company_location')
    await place.selectOption('client_address')
    assert.equal(await addressEditor.getByLabel('Улица', { exact: true }).inputValue(), 'Тестовая')
    await place.selectOption('company_location')
    await dialog
      .getByLabel('Помещение', { exact: true })
      .selectOption(String(location._id))
    await checkLayout()
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    await dialog.getByRole('button', { name: /^Добавить «Программа»/ }).click()
    await dialog.getByRole('button', { name: 'Убрать', exact: true }).click()
    await dialog.getByRole('button', { name: 'Создать услугу', exact: true }).click()
    const newService = page.getByRole('dialog', { name: 'Новая услуга', exact: true })
    const newServiceTitle = 'Услуга проверки мастера'
    await newService.getByLabel('Название услуги', { exact: true }).fill(newServiceTitle)
    await newService.getByLabel('Длительность, мин', { exact: true }).fill('45')
    await newService.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await newService.waitFor({ state: 'hidden' })
    await dialog.getByRole('button', { name: `Редактировать услугу ${newServiceTitle}`, exact: true }).click()
    const editService = page.getByRole('dialog', { name: 'Редактировать услугу', exact: true })
    await editService.getByLabel('Длительность, мин', { exact: true }).fill('50')
    await editService.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await editService.waitFor({ state: 'hidden' })
    await dialog.getByText('Программа: 50 мин', { exact: false }).waitFor()
    await dialog.getByRole('button', { name: 'Убрать', exact: true }).click()
    await dialog
      .getByLabel('Добавить услугу', { exact: true })
      .selectOption(String(service._id))
    await dialog.getByLabel('Количество', { exact: true }).fill('2')
    await checkLayout()
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    await dialog.getByRole('button', { name: /^Настроить график/ }).click()
    const scheduleDialog = page.getByRole('dialog', { name: /^График/ })
    await scheduleDialog.getByRole('button', { name: 'Добавить исключение', exact: true }).click()
    await scheduleDialog.getByRole('group', { name: /^Исключение/ }).last().getByLabel('Дата', { exact: true }).fill('2031-11-05')
    await scheduleDialog.getByRole('button', { name: 'Сохранить график', exact: true }).click()
    await scheduleDialog.waitFor({ state: 'hidden' })
    console.log('PASS browser: structured address, catalog service editing and schedule inside the order wizard')
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
    await dialog.getByLabel(/^Пожелания/).waitFor()
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    await dialog.getByRole('alert').filter({ hasText: 'Заполните поле «Пожелания», чтобы продолжить бронирование.' }).waitFor()
    await page.waitForFunction(() =>
      document.activeElement?.getAttribute('aria-invalid') === 'true' &&
      document.activeElement?.closest('label')?.textContent.includes('Пожелания')
    )
    await dialog.getByLabel(/^Пожелания/).fill('Длинный бриф: '.repeat(80))
    await checkLayout()
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    assert.equal(await dialog.getByLabel('Получено, ₽', { exact: true }).isVisible(), false)
    await dialog.getByText('Записать полученный аванс', { exact: true }).click()
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
      .getByRole('button', { name: 'Отмена', exact: true })
      .click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    console.log(
      'PASS browser: six-step creation, long brief, mobile/desktop bounds, keyboard focus'
    )
    const leadCard = page.locator(`article[data-party-order-board-id="${leadBody.data._id}"]`)
    const [briefGate] = await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname === `/api/party/orders/${leadBody.data._id}/stage` &&
        response.request().method() === 'PATCH'
      ),
      leadCard.getByRole('combobox').selectOption('discussion'),
    ])
    assert.equal(briefGate.status(), 409)
    assert.equal((await briefGate.json()).error.code, 'partycrm_brief_required')
    await page.getByRole('button', { name: 'Открыть бриф', exact: true }).click()
    const briefPanel = page.getByRole('dialog').getByRole('tabpanel', { name: 'Бриф', exact: true })
    await briefPanel.waitFor()
    const briefPanelId = await briefPanel.getAttribute('id')
    await page.waitForFunction((id) => document.activeElement?.id === id, briefPanelId)
    assert.ok(await page.getByRole('dialog').getByRole('tablist').evaluate((tablist) =>
      [...tablist.querySelectorAll('[aria-controls]')].every((tab) =>
        document.getElementById(tab.getAttribute('aria-controls'))?.getAttribute('role') === 'tabpanel'
      )
    ))
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    console.log('PASS browser: an incomplete brief blocks a move and opens the focused Brief tab')

    await page.getByRole('button', { name: 'Список', exact: true }).click()
    await page.getByLabel(/^Сортировка/).selectOption('event_asc')
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForFunction(
      () =>
        [...document.querySelectorAll('label')]
          .find((label) => label.textContent.startsWith('Сортировка'))
          ?.querySelector('select')?.value === 'event_asc'
    )
    const orderDetailsPattern = `**/api/party/orders/${orderId}`
    const longServiceName = 'Оченьдлинноеназваниеуслуги'.repeat(8)
    const longAddress = 'Длинныйадресбезпробелов'.repeat(8)
    const previewDetails = async (route) => {
      const response = await route.fetch()
      const json = await response.json()
      json.data.orderItems[0].title = longServiceName
      json.data.locationId = null
      json.data.customAddress = longAddress
      await route.fulfill({ response, json })
    }
    await page.route(orderDetailsPattern, previewDetails)
    await page.setViewportSize({ width: 320, height: 844 })
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
    const readPreview = page.getByRole('dialog')
    await readPreview.getByText(longAddress, { exact: true }).waitFor()
    const longServiceRow = readPreview.getByText(new RegExp(`^${longServiceName}`)).locator('..')
    assert.ok(await longServiceRow.evaluate((row) => row.scrollWidth <= row.clientWidth + 1))
    assert.ok(await readPreview.evaluate((dialog) => dialog.scrollWidth <= dialog.clientWidth + 1))
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    await page.unroute(orderDetailsPattern, previewDetails)
    await page.setViewportSize({ width: 390, height: 844 })

    const ordinaryEditorUrl = `${origin}/company/work?companyId=${company._id}&orderId=${orderId}&mode=edit`
    const legacyEditorUrl = `${origin}/company/orders?order=${orderId}&company=${company._id}&mode=edit`
    await page.goto(ordinaryEditorUrl)
    const modeEditor = page.getByRole('dialog')
    const advancedMode = modeEditor.getByRole('button', { name: 'Расширенный режим', exact: true })
    const ordinaryMode = modeEditor.getByRole('button', { name: 'Обычный режим', exact: true })
    const teamComment = modeEditor.getByLabel(/^Комментарий для команды/)
    const orderDetails = modeEditor.getByText('Дополнительные поля', { exact: true })
    await modeEditor.locator('dl[aria-label="Параметры заказа"]').waitFor()
    assert.equal(await teamComment.isVisible(), false)
    assert.equal(await modeEditor.getByRole('checkbox', { name: 'Программа', exact: true }).count(), 0)
    assert.equal(await advancedMode.count(), 0)
    assert.equal(await ordinaryMode.count(), 0)

    const statusBadge = modeEditor.getByText('Статус заказа', { exact: true }).locator('..')
    const wizardLauncher = modeEditor.getByRole('button', { name: 'Заполнение заявки по этапам', exact: true })
    assert.equal((await statusBadge.textContent()).trim(), 'Статус заказа Заявка')
    assert.equal(await modeEditor.getByRole('heading', { name: body.data.orderTypeSnapshot, exact: true }).count(), 0)
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: 844 })
      const [launcherBox, badgeBox] = await Promise.all([
        wizardLauncher.boundingBox(),
        statusBadge.boundingBox(),
      ])
      assert.ok(launcherBox && badgeBox)
      assert.ok(launcherBox.x + launcherBox.width <= badgeBox.x)
      assert.ok(Math.abs(launcherBox.y + launcherBox.height / 2 - badgeBox.y - badgeBox.height / 2) <= 2)
    }
    await page.setViewportSize({ width: 390, height: 844 })
    await wizardLauncher.click()
    const bookingWizard = page.getByRole('dialog', { name: 'Параметры заказа', exact: true })
    await bookingWizard.getByLabel('Тип заказа', { exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await bookingWizard.waitFor({ state: 'hidden' })
    await wizardLauncher.waitFor()

    const stage = modeEditor.getByRole('combobox', { name: 'Этап заказа', exact: true })
    assert.equal(await stage.inputValue(), 'new')
    assert.equal(await stage.locator('option[value="new"]').textContent(), 'Новая заявка')
    assert.equal(await stage.locator('option[value="discussion"]').textContent(), 'Уточнение заказа')
    await orderDetails.click()
    const originalTeamComment = await teamComment.inputValue()
    await teamComment.fill('Несохранённые правки перед сменой этапа')
    assert.equal(await stage.isDisabled(), true)
    assert.ok(await stage.evaluate((select) =>
      (select.getAttribute('aria-describedby') || '').split(/\s+/).some((id) =>
        document.getElementById(id)?.textContent.trim() === 'Сначала сохраните изменения.'
      )
    ))
    await teamComment.fill(originalTeamComment)
    const [stageResponse] = await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname === `/api/party/orders/${orderId}/stage` &&
        response.request().method() === 'PATCH'
      ),
      stage.selectOption('discussion'),
    ])
    assert.equal(stageResponse.status(), 200, JSON.stringify(await stageResponse.json()))
    assert.equal(stageResponse.request().postDataJSON().toStageId, 'discussion')
    await page.waitForFunction(() => [...document.querySelectorAll('[role="dialog"] select')].some((select) =>
      select.value === 'discussion' && select.selectedOptions[0]?.textContent.trim() === 'Уточнение заказа'
    ))
    assert.equal(await stage.inputValue(), 'discussion')
    assert.equal((await statusBadge.textContent()).trim(), 'Статус заказа Заявка')
    const transitionedOrder = await connection.db.collection('orders').findOne({
      _id: new Types.ObjectId(orderId),
      tenantId: company._id,
    })
    assert.equal(transitionedOrder?.workflowStageId, 'discussion')
    assert.equal(transitionedOrder?.status, 'draft')
    console.log('PASS browser: booking wizard opens and closes, stage select guards dirty changes and transitions independently of status')

    await modeEditor.getByRole('button', { name: 'Отмена', exact: true }).click()
    await modeEditor.waitFor({ state: 'hidden' })
    const legacyRedirect = await page.goto(legacyEditorUrl)
    const redirectedUrl = new URL(legacyRedirect.url())
    assert.equal(redirectedUrl.pathname, '/company/work')
    assert.equal(redirectedUrl.searchParams.get('orderId'), orderId)
    assert.equal(redirectedUrl.searchParams.get('companyId'), String(company._id))
    assert.equal(redirectedUrl.searchParams.get('mode'), 'edit')
    await wizardLauncher.waitFor()
    assert.equal(await page.getByRole('dialog', { name: 'Редактировать заказ', exact: true }).count(), 0)
    assert.equal(await advancedMode.count(), 0)
    assert.equal(await ordinaryMode.count(), 0)

    const users = connection.db.collection('users')
    assert.equal((await users.updateOne({ _id: userId, role: 'user' }, { $set: { role: 'dev' } })).modifiedCount, 1)
    await refreshSession()
    await page.goto(`${origin}/company/work`)
    await page.getByRole('button', { name: 'Доска', exact: true }).click()
    const boardCard = page.locator(`article[data-party-order-board-id="${orderId}"]`)
    await boardCard.getByRole('button', { name: /^Открыть заказ/ }).click()
    const originalBoard = await boardRegion.elementHandle()
    const originalWorkUrl = page.url()
    const checkModeFooter = async (modeLink) => {
      const cancel = modeEditor.getByRole('button', { name: 'Отмена', exact: true })
      const save = modeEditor.getByRole('button', { name: 'Сохранить', exact: true })
      await modeLink.waitFor()
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 844 })
        await page.evaluate(() => document.fonts.ready.then(() =>
          new Promise((resolve) => requestAnimationFrame(() => resolve()))
        ))
        const [modeBox, cancelBox, saveBox, editorBox] = await Promise.all([
          modeLink.boundingBox(), cancel.boundingBox(), save.boundingBox(), modeEditor.boundingBox(),
        ])
        assert.ok(modeBox && cancelBox && saveBox && editorBox)
        assert.ok(
          modeBox.x + modeBox.width <= cancelBox.x && cancelBox.x + cancelBox.width <= saveBox.x,
          JSON.stringify({ width, modeBox, cancelBox, saveBox })
        )
        assert.ok(Math.abs(modeBox.y - cancelBox.y) <= 2)
        const bottomInset = editorBox.y + editorBox.height - modeBox.y - modeBox.height
        assert.ok(bottomInset >= 0 && bottomInset <= 18 && saveBox.x + saveBox.width <= width)
      }
      await page.setViewportSize({ width: 390, height: 844 })
    }
    await checkModeFooter(advancedMode)
    await orderDetails.click()
    const devTeamComment = await teamComment.inputValue()
    await teamComment.fill('Несохранённый комментарий в обычном режиме')
    page.once('dialog', (notice) => notice.dismiss())
    await advancedMode.click()
    assert.equal(await teamComment.inputValue(), 'Несохранённый комментарий в обычном режиме')
    await teamComment.fill(devTeamComment)
    await advancedMode.click()
    await checkModeFooter(ordinaryMode)
    assert.equal(page.url(), originalWorkUrl)
    assert.ok(await originalBoard.evaluate((element) => element.isConnected))
    await modeEditor.locator('details[data-order-section="Комментарии"] > summary').click()
    const advancedComment = modeEditor.getByLabel('Комментарий для администратора', { exact: true })
    await advancedComment.fill('Несохранённый комментарий в расширенном режиме')
    page.once('dialog', (notice) => notice.dismiss())
    await ordinaryMode.click()
    assert.equal(await advancedComment.inputValue(), 'Несохранённый комментарий в расширенном режиме')
    const [advancedSave] = await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname === `/api/party/orders/${orderId}` &&
        response.request().method() === 'PATCH'
      ),
      modeEditor.getByRole('button', { name: 'Сохранить', exact: true }).click(),
    ])
    assert.equal(advancedSave.status(), 200, JSON.stringify(await advancedSave.json()))
    assert.equal((await advancedSave.json()).data.adminComment, 'Несохранённый комментарий в расширенном режиме')
    await ordinaryMode.click()
    await advancedMode.waitFor()
    assert.equal(page.url(), originalWorkUrl)
    assert.ok(await originalBoard.evaluate((element) => element.isConnected))
    console.log('PASS browser: dev editor modes keep the board mounted and guard unsaved changes')

    await modeEditor.getByRole('button', { name: 'Отмена', exact: true }).click()
    await modeEditor.waitFor({ state: 'hidden' })
    await page.setViewportSize({ width: 1280, height: 844 })
    const preparationColumn = page.getByRole('region', { name: 'Подготовка', exact: true })
    const [dragResponse] = await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname === `/api/party/orders/${orderId}/stage` &&
        response.request().method() === 'PATCH'
      ),
      boardCard.locator('[draggable="true"]').dragTo(preparationColumn, {
        targetPosition: { x: 20, y: 20 },
      }),
    ])
    assert.equal(dragResponse.status(), 200, JSON.stringify(await dragResponse.json()))
    assert.equal(dragResponse.request().postDataJSON().toStageId, 'preparation')
    await preparationColumn.locator(`article[data-party-order-board-id="${orderId}"]`).waitFor()
    console.log('PASS browser: dragging a card changes its stage and renders it in the next column')
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal((await users.updateOne({ _id: userId, role: 'dev' }, { $set: { role: 'user' } })).modifiedCount, 1)
    await refreshSession()

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

    const services = connection.db.collection('services')
    const serviceFilter = { _id: service._id, tenantId: company._id }
    const previousService = await services.findOne(serviceFilter)
    assert.equal(previousService?.availabilityConfigured, true)
    await page.goto(`${origin}/company/services?companyId=${company._id}`, {
      waitUntil: 'domcontentloaded',
    })
    const serviceCard = page.getByText(service.title, { exact: true })
    const serviceRow = page.locator('article').filter({ has: serviceCard })
    await page.setViewportSize({ width: 390, height: 844 })
    const [priceBounds, editBounds] = await Promise.all([
      serviceRow.getByText(/₽$/).boundingBox(),
      serviceRow.getByRole('button', { name: 'Редактировать услугу', exact: true }).boundingBox(),
    ])
    assert.ok(priceBounds && editBounds && (
      priceBounds.x + priceBounds.width <= editBounds.x || priceBounds.y + priceBounds.height <= editBounds.y
    ), 'Service price overlaps its edit button')
    const serviceEditor = page.getByRole('dialog', { name: 'Редактировать услугу', exact: true })
    const limitAvailability = serviceEditor.getByRole('checkbox', {
      name: 'Ограничить типы и места проведения',
      exact: true,
    })
    await serviceCard.click()
    assert.equal(await limitAvailability.isChecked(), true)
    await limitAvailability.uncheck()
    const [updatedServiceResponse] = await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname === `/api/party/services/${service._id}` &&
        ['PUT', 'PATCH'].includes(response.request().method())
      ),
      serviceEditor.getByRole('button', { name: 'Сохранить', exact: true }).click(),
    ])
    assert.equal(updatedServiceResponse.request().method(), 'PUT')
    assert.equal(updatedServiceResponse.status(), 200)
    const updatedService = await services.findOne(serviceFilter)
    assert.equal(updatedService?.availabilityConfigured, false)
    for (const field of [
      'orderTypeIds', 'locationIds', 'offsiteAllowed', 'repeatable',
      'maxQuantity', 'includedRentalMinutes', 'title', 'price', 'duration',
    ]) {
      assert.deepEqual(updatedService[field], previousService[field], `Service field changed: ${field}`)
    }
    await serviceEditor.waitFor({ state: 'hidden' })
    await serviceCard.click()
    await limitAvailability.waitFor()
    assert.equal(await limitAvailability.isChecked(), false)
    await serviceEditor.getByRole('button', { name: 'Отмена', exact: true }).click()
    console.log('PASS browser: service restrictions can be disabled without losing availability settings')

    await page.goto(`${origin}/company/settings/order-types`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Добавить тип', exact: true }).click()
    await page.getByRole('dialog', { name: 'Новый тип заказа', exact: true }).getByLabel('Название типа').waitFor()
    console.log('PASS browser: settings opens the order-type creation dialog')

    await page.goto(`${origin}/company`, { waitUntil: 'domcontentloaded' })
    const onboarding = page.getByRole('heading', { name: 'Первые шаги компании', exact: true }).locator('../../..')
    const staffAction = onboarding.getByRole('button', { name: 'Новый сотрудник', exact: true })
    await staffAction.click()
    const staffEditor = page.getByRole('dialog', { name: 'Новый сотрудник', exact: true })
    await staffEditor.getByLabel('Имя', { exact: true }).fill('Второй сотрудник')
    await staffEditor.getByLabel('Телефон', { exact: true }).fill('9000000439')
    await staffEditor.getByRole('button', { name: 'Добавить сотрудника', exact: true }).click()
    await staffEditor.waitFor({ state: 'hidden' })
    await onboarding.getByText('5 из 5 выполнено', { exact: true }).waitFor()
    for (const name of ['Новая точка', 'Новая услуга', 'Новый сотрудник', 'Добавить тип заказа']) {
      assert.ok(await onboarding.getByRole('button', { name, exact: true }).isEnabled(), name)
    }
    console.log('PASS browser: onboarding actions remain available after completing the setup')

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
