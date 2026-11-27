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
import { getPartyCompanyBrandingStyle, PARTY_COMPANY_PALETTES } from '../helpers/partyCompanyBranding.js'
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

const seedMultiPlaceBrowserCheckout = async (connection, tenantId) => {
  const roomA = { _id: new Types.ObjectId(), tenantId, title: 'Параллельный зал А', status: 'active', hourlyRentalRate: 1000,
    rentalConfiguration: { extras: { fields: [{ id: 'equipment', title: 'Оборудование', type: 'checkboxes', options: [
      { id: 'projector', title: 'Проектор', priceDelta: 200 },
    ] }] } } }
  const roomB = { _id: new Types.ObjectId(), tenantId, title: 'Параллельный зал Б', status: 'active', hourlyRentalRate: 1500 }
  const activity = { _id: new Types.ObjectId(), tenantId, title: 'Параллельная игра', status: 'active', duration: 30, price: 1000, includedRentalMinutes: 20,
    configuration: { fields: [{ id: 'rounds', title: 'Раунды', type: 'number', unit: 'шт.', required: true, pricePerUnit: 100, durationPerUnit: 10 }] } }
  await connection.db.collection('locations').insertMany([roomA, roomB])
  await connection.db.collection('services').insertOne(activity)
  return { roomA, roomB, activity }
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
  const multiPlace = process.argv.includes('--multi-place-only')
    ? await seedMultiPlaceBrowserCheckout(connection, company._id)
    : null
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
    const addOrder = page.getByRole('button', { name: '+ Заказ', exact: true })
    await addOrder.waitFor()
    const orderContrast = () => addOrder.evaluate((button) => {
      const style = getComputedStyle(button)
      const luminance = (color) => {
        const channels = color.match(/[\d.]+/g).slice(0, 3).map((value) => {
          const channel = Number(value) / 255
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
        })
        return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
      }
      const foreground = luminance(style.color)
      const background = luminance(style.backgroundColor)
      return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05)
    })
    const setPalette = (palette) => page.locator('main[style*="--party-brand-accent"]').evaluate(
      (main, colors) => Object.entries(colors).forEach(([name, value]) => main.style.setProperty(name, value)),
      getPartyCompanyBrandingStyle({ palette })
    )
    for (const { id } of PARTY_COMPANY_PALETTES) {
      await setPalette(id)
      await page.mouse.move(0, 0)
      assert.ok(await orderContrast() >= 4.5, `Add order contrast: ${id}`)
      await addOrder.hover()
      assert.ok(await orderContrast() >= 4.5, `Add order hover contrast: ${id}`)
    }
    await setPalette('sky')
    console.log('PASS browser: Add order has sufficient contrast across all company themes')
    await page.setViewportSize({ width: 390, height: 844 })
    const boardRegion = page.locator('[aria-label="Колонки доски заказов"]')
    await boardRegion.waitFor()
    assert.ok(await boardRegion.evaluate((board) => board.scrollWidth > board.clientWidth))
    const boardFilters = page.getByRole('button', { name: /^Фильтры(?: \(\d+\))?$/ })
    const stageFilter = page.getByRole('combobox', { name: 'Рабочий этап', exact: true })
    assert.equal(await boardFilters.getAttribute('aria-expanded'), 'false')
    assert.equal(await stageFilter.isVisible(), false)
    await boardFilters.click()
    await stageFilter.selectOption('discussion')
    await page.getByRole('button', { name: 'Фильтры (1)', exact: true }).click()
    assert.equal(await stageFilter.isVisible(), false)
    assert.equal(await boardRegion.getByRole('region', { name: 'Уточнение заказа', exact: true }).count(), 1)
    assert.equal(await boardRegion.getByRole('region', { name: 'Новая заявка', exact: true }).count(), 0)
    await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click()
    await boardRegion.getByRole('region', { name: 'Новая заявка', exact: true }).waitFor()
    console.log('PASS browser: board filters are compact, retain selection and can be cleared')
    await page.getByRole('button', { name: 'Ещё', exact: true }).click()
    await page.waitForFunction(() => document.activeElement?.closest('#party-primary-mobile-menu'))
    assert.equal(await page.getByRole('button', { name: 'Закрыть меню', exact: true }).getAttribute('aria-expanded'), 'true')
    await page.keyboard.press('Escape')
    assert.equal(await page.getByRole('button', { name: 'Ещё', exact: true }).getAttribute('aria-expanded'), 'false')
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), 'Ещё')
    await page.setViewportSize({ width: 1280, height: 844 })
    console.log('PASS browser: mobile menu announces state, receives focus and closes with Escape')
    // Count the ordinary successful paths separately from deliberate validation,
    // duplicate, cancellation and reload checks below.
    const leadActions = {
      newClient: { clicks: 0, inputs: 0 },
      existingClient: { clicks: 0, inputs: 0 },
    }
    const leadAction = async (scenario, kind, action) => {
      leadActions[scenario][kind]++
      return action()
    }
    await leadAction('newClient', 'clicks', () => page.getByRole('button', { name: '+ Заказ', exact: true }).click())
    await page.getByRole('dialog').last().waitFor()
    const dialog = page.getByRole('dialog').last()
    const clientTrigger = dialog.getByRole('button', { name: /^Основной клиент/ })
    const clientPicker = page.getByRole('dialog', { name: 'Выбор клиента', exact: true })
    const newClientDialog = page.getByRole('dialog', { name: 'Новый клиент', exact: true })
    const clientSearch = clientPicker.getByLabel('Поиск клиента', { exact: true })
    const clientResults = clientPicker.getByRole('list', { name: 'Клиенты', exact: true })
    const clientOptionsPath = '/api/party/order-options/clients'
    const searchClients = async (query, metric = null) => {
      const fill = () => clientSearch.fill(query)
      const [response] = await Promise.all([
        page.waitForResponse((candidate) => {
          const url = new URL(candidate.url())
          return url.pathname === clientOptionsPath &&
            url.searchParams.get('q') === query &&
            candidate.request().method() === 'GET'
        }),
        metric ? leadAction(metric, 'inputs', fill) : fill(),
      ])
      assert.equal(response.ok(), true)
      return (await response.json()).data
    }
    const selectExistingClient = async (metric = null) => {
      const open = () => clientTrigger.click()
      await (metric ? leadAction(metric, 'clicks', open) : open())
      const matches = await searchClients(`8 ${String(client.phone).slice(1)}`, metric)
      assert.ok(matches.some((person) => String(person._id) === String(client._id)))
      const choose = () => clientResults.getByRole('button', { name: client.firstName }).click()
      await (metric ? leadAction(metric, 'clicks', choose) : choose())
      await clientPicker.waitFor({ state: 'hidden' })
      assert.ok((await clientTrigger.textContent()).includes(client.firstName))
    }
    const checkQuickLeadSaved = async (orderId, clientId) => {
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      const notice = page.getByRole('status').filter({ hasText: 'Заявка сохранена' })
      await notice.waitFor()
      await boardRegion.locator(`article[data-party-order-board-id="${orderId}"]`).waitFor()
      const [opened] = await Promise.all([
        page.waitForResponse((response) =>
          new URL(response.url()).pathname === `/api/party/orders/${orderId}` &&
          response.request().method() === 'GET'
        ),
        page.getByRole('button', { name: 'Открыть сохранённую заявку', exact: true }).click(),
      ])
      assert.equal(opened.ok(), true)
      const { data: lead } = await opened.json()
      assert.equal(lead._id, orderId)
      assert.equal(String(lead.clientId), String(clientId))
      assert.equal(lead.eventDate, null)
      assert.equal(lead.orderTypeId, null)
      const wizard = page.getByRole('dialog', { name: 'Параметры заказа', exact: true })
      await wizard.getByRole('heading', { name: 'Тип', exact: true }).waitFor()
      await wizard.getByRole('button', { name: 'Закрыть', exact: true }).click()
      await wizard.waitFor({ state: 'hidden' })
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
    if (multiPlace) {
      const { roomA, roomB, activity } = multiPlace
      const next = () => dialog.getByRole('button', { name: 'Далее', exact: true }).click()
      const group = (room) => dialog.getByRole('group', { name: room.title, exact: true })
      await selectExistingClient()
      await dialog.getByRole('button', { name: 'Оформить бронирование', exact: true }).click()
      await dialog.getByLabel('Тип заказа', { exact: true }).selectOption(String(type._id))
      await next()
      await dialog.getByLabel('Помещение', { exact: true }).selectOption(String(roomA._id))
      await dialog.getByRole('button', { name: 'Добавить место', exact: true }).click()
      await dialog.getByRole('combobox', { name: /^Помещение 2/ }).selectOption(String(roomB._id))
      await group(roomA).getByRole('checkbox', { name: /Проектор/ }).check()
      await checkLayout()
      await next()

      for (const [room, rounds] of [[roomA, '2'], [roomB, '3']]) {
        await group(room).getByRole('combobox', { name: `Добавить услугу — ${room.title}`, exact: true }).selectOption(String(activity._id))
        const row = group(room).getByRole('listitem').filter({ hasText: activity.title })
        await row.getByRole('spinbutton', { name: 'Раунды', exact: true }).fill(rounds)
      }
      await checkLayout()
      await next()

      const roomATime = group(roomA)
      const roomBTime = group(roomB)
      const fixtureDate = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)
      const [year, month] = fixtureDate.split('-')
      await roomATime.getByLabel('Длительность аренды, минут', { exact: true }).fill('120')
      await roomATime.getByRole('combobox', { name: /^Год/ }).selectOption(year)
      await roomATime.getByRole('combobox', { name: /^Месяц/ }).selectOption(month)
      await roomATime.getByRole('button', { name: `${fixtureDate}: есть свободное время`, exact: true }).click()
      await roomATime.getByRole('button', { name: '14:00 — 16:00', exact: true }).click()
      await roomBTime.getByRole('button', { name: 'То же начало', exact: true }).click()
      await roomBTime.getByText(/Аренда.*14:00.*15:00/).waitFor()
      await checkLayout()
      await next()

      await dialog.getByRole('heading', { name: 'Бриф', exact: true }).waitFor()
      await dialog.getByLabel(/^Пожелания/).fill('Параллельная программа в двух залах')
      await next()
      const breakdown = dialog.getByRole('list', { name: 'Расчёт по местам', exact: true })
      await breakdown.getByRole('listitem').filter({ hasText: roomA.title }).getByText(/3\s*400\s*₽/).waitFor()
      await breakdown.getByRole('listitem').filter({ hasText: roomB.title }).getByText(/2\s*800\s*₽/).waitFor()
      await dialog.getByText(/6\s*200\s*₽/).waitFor()
      await checkLayout()
      const [savedResponse] = await Promise.all([
        page.waitForResponse((response) => new URL(response.url()).pathname === '/api/party/orders' && response.request().method() === 'POST'),
        dialog.getByRole('button', { name: 'Сохранить как заявку', exact: true }).click(),
      ])
      const saved = await savedResponse.json()
      assert.ok(savedResponse.ok(), JSON.stringify(saved.error))
      const orderId = new Types.ObjectId(saved.data._id)
      const stored = await connection.db.collection('orders').findOne({ _id: orderId, tenantId: company._id })
      assert.equal(stored.bookingVersion, 2)
      assert.equal(stored.contractAmount, 6200)
      assert.equal(stored.durationMinutes, 60)
      const [first, second] = stored.places
      assert.deepEqual(stored.places.map(({ locationId }) => String(locationId)), [String(roomA._id), String(roomB._id)])
      assert.equal(+first.rental.startsAt, +second.rental.startsAt)
      assert.deepEqual(stored.places.map(({ rental }) => (+rental.endsAt - +rental.startsAt) / 60000), [120, 60])
      assert.deepEqual(stored.places.map(({ pricingSnapshot }) => pricingSnapshot.includedRentalMinutes), [20, 20])
      assert.deepEqual(stored.orderItems.map(({ placeId, serviceId, serviceConfiguration }) => [placeId, String(serviceId), serviceConfiguration.parameters.values.rounds]), [
        [first.id, String(activity._id), 2], [second.id, String(activity._id), 3],
      ])
      assert.notEqual(stored.orderItems[0].lineId, stored.orderItems[1].lineId)
      assert.equal(await connection.db.collection('venueBookings').countDocuments({ tenantId: company._id, orderId, sourceType: 'order_place' }), 2)

      await page.goto(`${origin}/company/work?companyId=${company._id}&orderId=${orderId}&mode=view`, { waitUntil: 'domcontentloaded' })
      const places = page.getByRole('list', { name: 'Места заказа', exact: true })
      for (const room of [roomA, roomB]) await places.getByRole('heading', { name: room.title, exact: true }).waitFor()
      console.log('PASS browser: one service with independent values at two rooms, copied start, rental extras and totals, persisted atomic bookings and 390/1280 layouts')
      await context.close()
      assert.deepEqual(errors, [], 'Browser runtime errors')
      return
    }
    if (process.argv.includes('--flexible-only')) {
      await selectExistingClient()
      await dialog.getByRole('button', { name: 'Оформить бронирование', exact: true }).click()
      await dialog.getByLabel('Тип заказа', { exact: true }).selectOption(String(type._id))
      await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
      await dialog.getByLabel('Место проведения', { exact: true }).selectOption('company_location')
      await dialog.getByLabel('Помещение', { exact: true }).selectOption(String(location._id))
      await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
      await dialog.getByRole('button', { name: 'Создать услугу', exact: true }).click()

      const editor = page.getByRole('dialog', { name: 'Новая услуга', exact: true })
      const title = 'Игра с гибким расчётом'
      await editor.getByLabel('Название услуги', { exact: true }).fill(title)
      await editor.getByLabel('Длительность, мин', { exact: true }).fill('50')
      const includedRent = editor.getByRole('spinbutton', { name: 'Минут аренды включено в одно выполнение', exact: true })
      assert.equal(await includedRent.getAttribute('step'), '5')
      await includedRent.press('ArrowUp')
      assert.equal(await includedRent.inputValue(), '5')

      const parameter = page.getByRole('dialog', { name: 'Добавить параметр', exact: true })
      const checkEditorWidth = async (editorDialog) => {
        const viewport = page.viewportSize()
        for (const width of [390, 1280]) {
          await page.setViewportSize({ width, height: 844 })
          assert.ok(await editorDialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1))
          const bounds = await editorDialog.boundingBox()
          assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1)
        }
        if (viewport) await page.setViewportSize(viewport)
      }
      const createParameter = async (kind, name, fill) => {
        await editor.getByRole('button', { name: 'Добавить параметр', exact: true }).click()
        await parameter.getByRole('button', { name: new RegExp(`^${kind}`) }).click()
        await parameter.getByLabel('Название параметра', { exact: true }).fill(name)
        await fill()
        await checkEditorWidth(parameter)
        await parameter.getByRole('button', { name: 'Сохранить параметр', exact: true }).click()
        await parameter.waitFor({ state: 'hidden' })
      }
      await createParameter('Число', 'Число раундов', async () => {
        await parameter.getByLabel('Единица измерения', { exact: true }).fill('раунд.')
        await parameter.getByLabel('Цена за единицу, ₽', { exact: true }).fill('50')
        await parameter.getByLabel('Минут за единицу', { exact: true }).fill('5')
      })
      await createParameter('Диапазоны', 'Длина маршрута', async () => {
        await parameter.getByLabel('Единица измерения', { exact: true }).fill('км')
        await parameter.getByRole('combobox', { name: /Как применяется диапазон/ }).selectOption('base')
        const add = parameter.getByRole('button', { name: 'Добавить диапазон', exact: true })
        const range = page.getByRole('dialog', { name: 'Добавить диапазон', exact: true })
        await add.click()
        await range.getByLabel('От', { exact: true }).fill('1')
        await range.getByLabel('До', { exact: true }).fill('10')
        await range.getByLabel('Цена диапазона, ₽', { exact: true }).fill('1000')
        const rangeHelp = [
          ['Включено единиц', [/10\s+единиц/]],
          ['За единицу сверх включённых, ₽', [/\b12\b/, /300\s*₽/]],
          ['Предел цены диапазона, ₽', [/6\s*000\s*₽/]],
        ]
        const rangeFields = ['От', 'До', 'Цена диапазона, ₽', ...rangeHelp.map(([label]) => label)]
        const rangeValues = () => Promise.all(rangeFields.map((label) => range.getByRole('spinbutton', { name: label, exact: true }).inputValue()))
        const beforeHelp = await rangeValues()
        const viewport = page.viewportSize()
        for (const width of [390, 1280]) {
          await page.setViewportSize({ width, height: 844 })
          for (const [label, examples] of rangeHelp) {
            const help = range.getByRole('button', { name: `Подсказка: ${label}`, exact: true })
            if (width === 390) await help.click()
            else await help.press('Enter')
            const tooltip = page.getByRole('tooltip')
            await tooltip.waitFor()
            assert.equal(await help.getAttribute('aria-expanded'), 'true')
            assert.equal(await help.getAttribute('aria-describedby'), await tooltip.getAttribute('id'))
            for (const example of examples) assert.match(await tooltip.innerText(), example)
            const bounds = await tooltip.boundingBox()
            assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= width + 1)
            await help.press('Escape')
            await tooltip.waitFor({ state: 'hidden' })
            assert.equal(await help.getAttribute('aria-expanded'), 'false')
            assert.deepEqual(await rangeValues(), beforeHelp)
          }
        }
        if (viewport) await page.setViewportSize(viewport)
        await checkEditorWidth(range)
        await range.getByRole('button', { name: 'Сохранить диапазон', exact: true }).click()
        await range.waitFor({ state: 'hidden' })
        await parameter.getByRole('button', { name: 'Редактировать диапазон 1', exact: true }).waitFor()

        await add.click()
        const from = range.getByLabel('От', { exact: true })
        assert.equal(await from.inputValue(), '11')
        await from.fill('10')
        await range.getByLabel('До', { exact: true }).fill('20')
        await range.getByLabel('Цена диапазона, ₽', { exact: true }).fill('1300')
        await range.getByRole('button', { name: 'Сохранить диапазон', exact: true }).click()
        await range.getByRole('alert').filter({ hasText: 'не должны пересекаться' }).waitFor()
        await from.fill('11')
        await range.getByRole('button', { name: 'Сохранить диапазон', exact: true }).click()
        await range.waitFor({ state: 'hidden' })

        await parameter.getByRole('button', { name: 'Редактировать диапазон 2', exact: true }).click()
        const editedRange = page.getByRole('dialog', { name: 'Редактировать диапазон', exact: true })
        const price = editedRange.getByLabel('Цена диапазона, ₽', { exact: true })
        assert.equal(await price.inputValue(), '1300')
        await price.fill('1400')
        await editedRange.getByRole('button', { name: 'Сохранить диапазон', exact: true }).click()
        await editedRange.waitFor({ state: 'hidden' })
        await parameter.getByText(/1\s*400\s*₽/).waitFor()
      })
      const addChoice = parameter.getByRole('button', { name: 'Добавить вариант', exact: true })
      const choice = page.getByRole('dialog', { name: 'Добавить вариант', exact: true })
      const fillChoice = async (name, price, minutes) => {
        await addChoice.click()
        await choice.getByLabel('Название варианта', { exact: true }).fill(name)
        await choice.getByLabel('Изменение цены, ₽', { exact: true }).fill(price)
        await choice.getByLabel('Изменение длительности, мин', { exact: true }).fill(minutes)
        await checkEditorWidth(choice)
        await choice.getByRole('button', { name: 'Сохранить вариант', exact: true }).click()
        await choice.waitFor({ state: 'hidden' })
        await parameter.getByRole('button', { name: `Редактировать вариант ${name}`, exact: true }).waitFor()
      }
      await createParameter('Галочки', 'Реквизит', async () => {
        await addChoice.click()
        await choice.getByLabel('Название варианта', { exact: true }).fill('Отменённый вариант')
        await page.keyboard.press('Escape')
        const discard = page.getByRole('alertdialog')
        await discard.waitFor()
        await page.keyboard.press('Escape')
        await discard.waitFor({ state: 'hidden' })
        assert.equal(await choice.getByLabel('Название варианта', { exact: true }).inputValue(), 'Отменённый вариант')
        await choice.getByRole('button', { name: 'Отмена', exact: true }).click()
        await discard.getByRole('button', { name: 'Закрыть без сохранения', exact: true }).click()
        await choice.waitFor({ state: 'hidden' })
        await page.waitForFunction(() => document.activeElement?.textContent.trim() === 'Добавить вариант')
        assert.equal(await parameter.getByLabel('Название параметра', { exact: true }).inputValue(), 'Реквизит')
        assert.equal(await parameter.getByRole('button', { name: 'Редактировать вариант Отменённый вариант', exact: true }).count(), 0)
        await fillChoice('Дополнительный реквизит', '300', '15')
      })
      await createParameter('Список', 'Формат игры', async () => {
        await parameter.getByRole('checkbox', { name: 'Обязательный параметр', exact: true }).check()
        await fillChoice('С финалом', '250', '5')
        await parameter.getByRole('button', { name: 'Редактировать вариант С финалом', exact: true }).click()
        const editedChoice = page.getByRole('dialog', { name: 'Редактировать вариант', exact: true })
        const minutes = editedChoice.getByLabel('Изменение длительности, мин', { exact: true })
        assert.equal(await minutes.inputValue(), '5')
        await minutes.fill('10')
        await editedChoice.getByRole('button', { name: 'Сохранить вариант', exact: true }).click()
        await editedChoice.waitFor({ state: 'hidden' })
      })
      await editor.getByRole('button', { name: 'Сохранить', exact: true }).click()
      await editor.waitFor({ state: 'hidden' })

      const item = dialog.getByRole('list', { name: 'Выбранные услуги' }).getByRole('listitem').filter({ hasText: title })
      await item.getByRole('spinbutton', { name: 'Число раундов', exact: true }).fill('2')
      const distance = item.getByRole('spinbutton', { name: 'Длина маршрута', exact: true })
      await distance.fill('21')
      await item.getByText('Для такого значения в поле «Длина маршрута» нет диапазона', { exact: true }).waitFor()
      await distance.fill('12')
      await item.getByRole('checkbox', { name: /Дополнительный реквизит/ }).check()
      await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
      await item.getByText('Заполните поле «Формат игры»', { exact: true }).waitFor()
      const format = item.getByRole('combobox', { name: 'Формат игры', exact: true })
      await format.selectOption({ label: 'С финалом (+250 ₽ · +10 мин)' })
      await item.getByText(/85 мин за выполнение.*2[\s\u00A0]050 ₽/).waitFor()
      await dialog.getByText(/Программа: 85 мин.*2[\s\u00A0]050 ₽/).waitFor()
      await checkLayout()

      const [savedResponse] = await Promise.all([
        page.waitForResponse((response) => new URL(response.url()).pathname === '/api/party/orders' && response.request().method() === 'POST'),
        dialog.getByRole('button', { name: 'Сохранить как заявку', exact: true }).click(),
      ])
      const saved = await savedResponse.json()
      assert.ok(savedResponse.ok(), JSON.stringify(saved.error))
      const stored = await connection.db.collection('orders').findOne({ _id: new Types.ObjectId(saved.data._id), tenantId: company._id })
      assert.equal(stored.contractAmount, 2050)
      assert.equal(stored.durationMinutes, 85)
      assert.equal(stored.orderItems[0].includedRentalMinutes, 5)
      assert.deepEqual(stored.orderItems[0].serviceConfiguration.details, ['Число раундов: 2 раунд.', 'Длина маршрута: 12 км', 'Реквизит: Дополнительный реквизит', 'Формат игры: С финалом'])
      await page.goto(`${origin}/company/work?companyId=${company._id}&orderId=${saved.data._id}&mode=view`, { waitUntil: 'domcontentloaded' })
      const preview = page.getByRole('dialog')
      for (const detail of stored.orderItems[0].serviceConfiguration.details) {
        await preview.getByText(detail, { exact: true }).waitFor()
      }
      await preview.getByText(/85 мин/).waitFor()
      console.log('PASS browser: nested range and option editors, editable cards, field help and independent cancellation at 390 and 1280 px, saved order preview')
      await context.close()
      assert.deepEqual(errors, [], 'Browser runtime errors')
      return
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

    const clientsCollection = connection.db.collection('clients')
    const existingPhoneCount = await clientsCollection.countDocuments({ tenantId: company._id, phone: client.phone })
    await directClient.click()
    await newClientDialog.getByLabel('ФИО', { exact: true }).fill('Повторный клиент')
    await newClientDialog.getByLabel('Телефон', { exact: true }).fill(String(client.phone).slice(1))
    const [duplicateResponse] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === clientOptionsPath && response.request().method() === 'POST'),
      newClientDialog.getByRole('button', { name: 'Создать и выбрать', exact: true }).click(),
    ])
    assert.equal(duplicateResponse.status(), 409)
    assert.equal((await duplicateResponse.json()).error.code, 'partycrm_client_phone_exists')
    const [recoveredSearch] = await Promise.all([
      page.waitForResponse((response) => {
        const url = new URL(response.url())
        return url.pathname === clientOptionsPath && response.request().method() === 'GET' &&
          url.searchParams.get('q')?.replace(/\D/g, '').slice(-10) === String(client.phone).slice(-10)
      }),
      newClientDialog.getByRole('button', { name: 'Найти клиента по телефону', exact: true }).click(),
    ])
    assert.equal(recoveredSearch.status(), 200)
    assert.ok((await recoveredSearch.json()).data.some((person) => String(person._id) === String(client._id)))
    await newClientDialog.waitFor({ state: 'hidden' })
    assert.equal((await clientSearch.inputValue()).replace(/\D/g, '').slice(-10), String(client.phone).slice(-10))
    await clientResults.getByRole('button', { name: client.firstName }).click()
    await clientPicker.waitFor({ state: 'hidden' })
    assert.ok((await clientTrigger.textContent()).includes(client.firstName))
    assert.equal(await clientsCollection.countDocuments({ tenantId: company._id, phone: client.phone }), existingPhoneCount)
    await clientTrigger.click()
    await clientPicker.getByRole('button', { name: 'Убрать клиента', exact: true }).click()
    await clientPicker.waitFor({ state: 'hidden' })
    console.log('PASS browser: duplicate phone opens authorized lookup and selects the existing client without another record')

    const longClientMatches = [
      ...Array.from({ length: 39 }, (_, index) => ({
        _id: String(new Types.ObjectId()),
        name: `Клиент для проверки прокрутки ${index + 1}`,
      })),
      { _id: String(client._id), name: client.firstName },
    ]
    const isLongClientSearch = (url) => url.pathname === clientOptionsPath &&
      Boolean(url.searchParams.get('q')?.startsWith('Проверка прокрутки '))
    await page.route(isLongClientSearch, (route) => route.fulfill({
      json: { success: true, data: longClientMatches },
    }))
    try {
      const leadLayout = page.getByRole('dialog', { name: 'Новая заявка', exact: true, includeHidden: true })
      const lastClient = longClientMatches.at(-1)
      await checkLayout()
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 844 })
        const before = await leadLayout.boundingBox()
        await clientTrigger.click()
        assert.equal((await searchClients(`Проверка прокрутки ${width}`)).length, longClientMatches.length)
        await clientResults.getByRole('button', { name: longClientMatches[0].name, exact: true }).waitFor()
        const lastResult = clientResults.getByRole('button').last()
        assert.ok((await lastResult.textContent()).includes(lastClient.name))
        const during = await leadLayout.boundingBox()
        assert.ok(before && during && Math.abs(during.height - before.height) <= 1, 'Client matches resize the lead form')
        assert.equal(await leadLayout.locator('[aria-label="Клиенты"]').count(), 0)
        const scrolled = await clientResults.evaluate((list) => {
          const overflow = getComputedStyle(list).overflowY
          list.scrollTop = list.scrollHeight
          return ['auto', 'scroll'].includes(overflow) && list.scrollTop > 0
        })
        assert.ok(scrolled, 'Matching clients should scroll within their list')
        await lastResult.click()
        await clientPicker.waitFor({ state: 'hidden' })
        assert.ok((await clientTrigger.textContent()).includes(lastClient.name))
        await clientTrigger.click()
        await clientPicker.getByRole('button', { name: 'Убрать клиента', exact: true }).click()
        await clientPicker.waitFor({ state: 'hidden' })
      }
    } finally {
      await page.unroute(isLongClientSearch)
    }
    console.log('PASS browser: many client matches scroll independently at 390 and 1280 px')

    const leadComment = 'Проверка короткой заявки и восстановления'
    await leadAction('newClient', 'inputs', () => dialog.getByLabel('Суть обращения').fill(leadComment))
    assert.equal(await clientPicker.count(), 0)
    await page.setViewportSize({ width: 390, height: 844 })
    const newClientQuery = '8 (900) 000-04-67'
    await leadAction('newClient', 'clicks', () => clientTrigger.click())
    assert.deepEqual(await searchClients(newClientQuery, 'newClient'), [])
    await clientPicker.getByText('Клиент с таким номером не найден. При создании номер подставится автоматически.', { exact: true }).waitFor()
    const createClient = clientPicker.getByRole('button', { name: 'Создать клиента', exact: true })
    await leadAction('newClient', 'clicks', () => createClient.click())
    const clientPhone = newClientDialog.getByLabel('Телефон', { exact: true })
    assert.equal((await clientPhone.inputValue()).replace(/\D/g, ''), '9000000467')
    const clientName = newClientDialog.getByLabel('ФИО', { exact: true })
    assert.ok(await clientName.getAttribute('aria-describedby'))
    await newClientDialog.getByText('Необязательно', { exact: true }).waitFor()
    await newClientDialog.getByText('Достаточно заполнить одно поле.', { exact: true }).waitFor()
    const [phoneBox, nameBox] = await Promise.all([clientPhone.boundingBox(), clientName.boundingBox()])
    assert.ok(phoneBox && nameBox && phoneBox.y < nameBox.y)
    await clientName.fill('Черновик имени')
    await newClientDialog.getByRole('button', { name: 'Отмена', exact: true }).click()
    assert.equal(await clientSearch.inputValue(), newClientQuery)
    await page.waitForFunction(() => document.activeElement?.type === 'search')
    await createClient.click()
    assert.equal((await clientPhone.inputValue()).replace(/\D/g, ''), '9000000467')
    assert.equal(await clientName.inputValue(), 'Черновик имени')
    await clientName.clear()
    const [createdClientResponse] = await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname === clientOptionsPath &&
        response.request().method() === 'POST'
      ),
      leadAction('newClient', 'clicks', () => newClientDialog.getByRole('button', { name: 'Создать и выбрать', exact: true }).click()),
    ])
    assert.equal(createdClientResponse.status(), 201)
    const { data: createdClient } = await createdClientResponse.json()
    const savedClient = await connection.db.collection('clients').findOne({
      _id: new Types.ObjectId(createdClient._id),
      tenantId: company._id,
    })
    assert.equal(savedClient?.firstName || '', '')
    assert.equal(String(savedClient?.phone), '79000000467')
    await newClientDialog.waitFor({ state: 'hidden' })
    await clientPicker.waitFor({ state: 'hidden' })
    assert.equal((await clientTrigger.textContent()).replace(/\D/g, '').slice(-10), '9000000467')
    const [newLeadResponse] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === '/api/party/orders' && response.request().method() === 'POST'),
      leadAction('newClient', 'clicks', () => dialog.getByRole('button', { name: 'Сохранить заявку', exact: true }).click()),
    ])
    assert.equal(newLeadResponse.ok(), true)
    const newLeadBody = await newLeadResponse.json()
    const newLead = await connection.db.collection('orders').findOne({ _id: new Types.ObjectId(newLeadBody.data._id), tenantId: company._id })
    assert.equal(String(newLead.clientId), String(createdClient._id))
    assert.equal(newLead.adminComment, leadComment)
    assert.equal(newLead.eventDate, null)
    assert.equal(newLead.orderTypeId, null)
    await checkQuickLeadSaved(newLeadBody.data._id, createdClient._id)
    console.log('PASS browser: a phone-only client is linked to the undated lead and can be reopened from the save notice')
    console.log('METRIC browser: new-client lead successful-path actions', JSON.stringify(leadActions.newClient))
    await leadAction('existingClient', 'clicks', () => page.getByRole('button', { name: '+ Заказ', exact: true }).click())
    await selectExistingClient('existingClient')
    await leadAction('existingClient', 'inputs', () => dialog.getByLabel('Суть обращения').fill(leadComment))
    assert.equal(await dialog.getByLabel('Суть обращения').inputValue(), leadComment)
    console.log('PASS browser: client picker, prefill and create cancellation preserve the lead')
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
    await leadAction('existingClient', 'clicks', () => dialog.getByRole('button', { name: 'Сохранить заявку', exact: true }).click())
    const leadResponse = await leadSaved
    assert.equal(leadResponse.ok(), true)
    const leadBody = await leadResponse.json()
    const lead = await connection.db.collection('orders').findOne({ _id: new Types.ObjectId(leadBody.data._id) })
    assert.equal(String(lead.clientId), String(client._id))
    assert.equal(lead.eventDate, null)
    assert.equal(lead.orderTypeId, null)
    assert.equal(lead.adminComment, leadComment)
    await checkQuickLeadSaved(leadBody.data._id, client._id)
    console.log('PASS browser: contact lead restores after reload, saves without type/place/time and reopens from the save notice')
    console.log('METRIC browser: existing-client lead successful-path actions', JSON.stringify(leadActions.existingClient))
    await page.getByRole('button', { name: '+ Заказ', exact: true }).click()
    await selectExistingClient()
    const bookingLeadComment = 'Заметка для проверки создания типа заказа'
    await dialog.getByLabel('Суть обращения').fill(bookingLeadComment)
    const beginBooking = dialog.getByRole('button', { name: 'Оформить бронирование', exact: true })
    await beginBooking.click()
    await dialog.getByRole('heading', { name: 'Тип', exact: true }).waitFor()
    await dialog.getByRole('button', { name: '1. Клиент', exact: true }).click()
    await dialog.getByRole('heading', { name: 'Клиент', exact: true }).waitFor()
    assert.ok((await clientTrigger.textContent()).includes(client.firstName))
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    await dialog.getByRole('heading', { name: 'Тип', exact: true }).waitFor()
    console.log('PASS browser: booking reuses the lead client and keeps the client step reachable')

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
    await dialog.getByRole('button', { name: 'Назад', exact: true }).click()
    assert.equal(await dialog.getByLabel('Суть обращения').inputValue(), bookingLeadComment)
    await beginBooking.click()
    assert.equal(await orderTypeSelect.inputValue(), String(createdType._id))
    console.log('PASS browser: adding an order type restores focus, selects the type and preserves the lead')

    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    const place = dialog.getByLabel('Место проведения', { exact: true })
    await place.selectOption('company_location')
    const room = dialog.getByLabel('Помещение', { exact: true })
    await room.selectOption(String(location._id))
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    await dialog.getByText('Для выбранного типа заказа и места нет доступных услуг.', { exact: false }).waitFor()
    await checkLayout()
    await dialog.getByRole('button', { name: 'Назад', exact: true }).click()
    await dialog.getByRole('button', { name: 'Назад', exact: true }).click()

    await orderTypeSelect.selectOption(originalTypeId)
    await checkLayout()
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    await place.selectOption('client_address')
    const addressEditor = dialog.getByRole('group', { name: 'Адрес выезда', exact: true })
    const city = addressEditor.getByRole('combobox', { name: 'Город', exact: true })
    const cityName = 'Красноярск'
    const cityOption = city.getByRole('option', { name: cityName, exact: true })
    const townsPath = '/api/party/order-options/towns'
    await addressEditor.getByRole('button', { name: 'Добавить город', exact: true }).click()
    assert.equal(await cityOption.count(), 0)
    await addressEditor.getByLabel('Новый город', { exact: true }).fill(cityName)
    const [savedTownResponse] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === townsPath && response.request().method() === 'POST'),
      addressEditor.getByRole('button', { name: 'Сохранить город', exact: true }).click(),
    ])
    assert.equal(savedTownResponse.ok(), true)
    await cityOption.waitFor({ state: 'attached' })
    assert.equal(await city.inputValue(), cityName)

    const duplicateTownResponse = await page.request.post(`${origin}${townsPath}`, {
      headers: { 'x-partycrm-company-id': String(company._id) },
      data: { town: cityName.toLocaleLowerCase('ru') },
    })
    assert.equal(duplicateTownResponse.ok(), true)
    assert.equal((await duplicateTownResponse.json()).data.town, cityName)
    const companyWithTown = await connection.db.collection('companies').findOne({ _id: company._id })
    assert.deepEqual(companyWithTown.settings.towns.filter((town) => town.toLocaleLowerCase('ru') === 'красноярск'), [cityName])

    await addressEditor.getByLabel('Улица', { exact: true }).fill('Тестовая')
    await addressEditor.getByLabel('Дом', { exact: true }).fill('12')
    await place.selectOption('company_location')
    const [townsResponse] = await Promise.all([
      page.waitForResponse((response) => new URL(response.url()).pathname === townsPath && response.request().method() === 'GET'),
      place.selectOption('client_address'),
    ])
    assert.equal(townsResponse.ok(), true)
    assert.ok((await townsResponse.json()).data.towns.includes(cityName))
    await cityOption.waitFor({ state: 'attached' })
    assert.equal(await city.inputValue(), cityName)
    assert.equal(await addressEditor.getByLabel('Улица', { exact: true }).inputValue(), 'Тестовая')
    console.log('PASS browser: offsite city is selected, retained and available from the company catalog without duplicates')
    await place.selectOption('company_location')
    await room.selectOption(String(location._id))
    await checkLayout()
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    await dialog.getByRole('button', { name: /^Добавить «Программа»/ }).click()
    const selectedServices = dialog.getByRole('list', { name: 'Выбранные услуги', exact: true })
    await selectedServices.getByText('Программа', { exact: true }).waitFor()
    await dialog.getByText('Все подходящие услуги уже добавлены.', { exact: true }).waitFor()
    const quantity = dialog.getByLabel('Количество', { exact: true })
    assert.equal(await quantity.isEnabled(), true)
    await dialog.getByRole('button', { name: 'Убрать', exact: true }).click()
    await selectedServices.waitFor({ state: 'hidden' })
    await dialog.getByRole('button', { name: 'Создать услугу', exact: true }).click()
    const newService = page.getByRole('dialog', { name: 'Новая услуга', exact: true })
    const newServiceTitle = 'Услуга проверки мастера'
    await newService.getByLabel('Название услуги', { exact: true }).fill(newServiceTitle)
    await newService.getByLabel('Длительность, мин', { exact: true }).fill('45')
    await newService.getByRole('button', { name: 'Сохранить', exact: true }).click()
    await newService.waitFor({ state: 'hidden' })
    await selectedServices.getByText(newServiceTitle, { exact: true }).waitFor()
    assert.equal(await quantity.count(), 0)
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
    await selectedServices.getByText('Программа', { exact: true }).waitFor()
    await dialog.getByRole('button', { name: `Добавить «${newServiceTitle}»` }).click()
    const selectedNewService = selectedServices.getByRole('listitem').filter({ hasText: newServiceTitle })
    await selectedNewService.waitFor()
    assert.equal(await selectedServices.getByRole('listitem').count(), 2)
    await selectedNewService.getByRole('button', { name: 'Убрать', exact: true }).click()
    await selectedNewService.waitFor({ state: 'hidden' })
    assert.equal(await selectedServices.getByRole('listitem').count(), 1)
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
    const bookingMonth = dialog.getByRole('combobox', { name: 'Месяц', exact: true })
    const bookingYear = dialog.getByRole('combobox', { name: 'Год', exact: true })
    const selectCalendarPeriod = async (field, value, dateFrom, days) => {
      const [response] = await Promise.all([
        page.waitForResponse((candidate) => {
          const request = candidate.request()
          return new URL(request.url()).pathname === '/api/party/orders/availability' &&
            request.method() === 'POST' && request.postDataJSON()?.dateFrom === dateFrom
        }),
        field.selectOption(value),
      ])
      assert.equal(response.request().postDataJSON().days, days)
      return response
    }
    const initialYear = await bookingYear.inputValue()
    const otherMonth = (await bookingMonth.inputValue()) === '10' ? '01' : '10'
    assert.ok((await selectCalendarPeriod(bookingMonth, otherMonth, `${initialYear}-${otherMonth}-01`, 31)).ok())
    assert.equal(await bookingYear.inputValue(), initialYear)
    if (initialYear === '2027') {
      assert.ok((await selectCalendarPeriod(bookingYear, '2028', `2028-${otherMonth}-01`, 31)).ok())
    }
    assert.ok((await selectCalendarPeriod(bookingYear, '2027', `2027-${otherMonth}-01`, 31)).ok())
    assert.equal(await bookingMonth.inputValue(), otherMonth)
    let failAvailability = true
    await page.route('**/api/party/orders/availability', async (route) => {
      if (failAvailability && route.request().postDataJSON()?.dateFrom === '2027-11-01') {
        failAvailability = false
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success: false, error: { code: 'qa_booking_unavailable', message: 'Проверка временно недоступна' } }) })
      } else await route.continue()
    })
    assert.equal((await selectCalendarPeriod(bookingMonth, '11', '2027-11-01', 30)).status(), 503)
    await dialog.getByText('Проверка временно недоступна', { exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Повторить проверку', exact: true }).click()
    await dialog
      .getByRole('button', { name: /2027-11-15: есть свободное время/ })
      .click()
    await dialog.getByRole('button', { name: /^10:00 — 11:00$/ }).click()
    await checkLayout()
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    await dialog.getByRole('heading', { name: 'Бриф', exact: true }).waitFor()
    assert.equal(await clientTrigger.count(), 0)
    await dialog.getByText('Дополнительный контакт', { exact: true }).waitFor()
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
    await dialog.getByRole('button', { name: '3. Место', exact: true }).click()
    assert.equal(await dialog.getByRole('button', { name: '7. Финансы', exact: true }).isEnabled(), true)
    await dialog.getByRole('button', { name: '7. Финансы', exact: true }).click()
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
      'PASS browser: seven-step creation, separate brief, mobile/desktop bounds, keyboard focus'
    )
    const leadCard = page.locator(`article[data-party-order-board-id="${leadBody.data._id}"]`)
    const stageMenu = page.getByRole('menu')
    await leadCard.getByRole('button', { name: /^Переместить заказ/ }).click()
    const [briefGate] = await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname === `/api/party/orders/${leadBody.data._id}/stage` &&
        response.request().method() === 'PATCH'
      ),
      stageMenu.getByRole('menuitem', { name: 'Уточнение заказа', exact: true }).click(),
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

    const bookingWizard = page.getByRole('dialog', { name: 'Параметры заказа', exact: true })
    const showDetailedForm = bookingWizard.getByRole('button', { name: 'Подробная форма', exact: true })
    const editInSteps = page.getByRole('dialog').getByRole('button', { name: 'Редактировать по шагам', exact: true })
    const selectWizardType = bookingWizard.getByLabel('Тип заказа', { exact: true })
    await leadCard.getByRole('button', { name: /^Открыть заказ/ }).click()
    await bookingWizard.getByRole('heading', { name: 'Тип', exact: true }).waitFor()
    assert.equal(await selectWizardType.inputValue(), '')
    assert.equal(await editInSteps.count(), 0)
    assert.equal(await bookingWizard.getByRole('button', { name: 'Расширенный режим', exact: true }).count(), 0)
    assert.equal(await bookingWizard.getByLabel('Вид формы заказа', { exact: true }).count(), 0)
    await showDetailedForm.click()
    await bookingWizard.waitFor({ state: 'hidden' })
    await editInSteps.click()
    await bookingWizard.getByRole('heading', { name: 'Клиент', exact: true }).waitFor()
    await bookingWizard.getByRole('button', { name: 'Далее', exact: true }).click()
    await selectWizardType.selectOption(String(type._id))
    await Promise.all([
      page.waitForEvent('dialog').then(async (notice) => {
        assert.equal(notice.type(), 'confirm')
        await notice.dismiss()
      }),
      showDetailedForm.click(),
    ])
    assert.equal(await selectWizardType.inputValue(), String(type._id))
    await Promise.all([
      page.waitForEvent('dialog').then(async (notice) => {
        assert.equal(notice.type(), 'confirm')
        await notice.accept()
      }),
      showDetailedForm.click(),
    ])
    await bookingWizard.waitFor({ state: 'hidden' })
    const leadDetails = page.getByRole('dialog')
    await leadDetails.getByText('Дополнительные поля', { exact: true }).click()
    const leadTeamComment = leadDetails.getByLabel(/^Комментарий для команды/)
    const originalLeadTeamComment = await leadTeamComment.inputValue()
    await leadTeamComment.fill('Несохранённая правка в подробной форме')
    assert.equal(await editInSteps.isDisabled(), true)
    await leadTeamComment.fill(originalLeadTeamComment)
    await editInSteps.click()
    await bookingWizard.getByRole('button', { name: 'Далее', exact: true }).click()
    assert.equal(await selectWizardType.inputValue(), '')
    await showDetailedForm.click()
    await editInSteps.waitFor()
    await page.getByRole('dialog').getByRole('button', { name: 'Отмена', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
    console.log('PASS browser: incomplete lead opens in steps and both forms guard unsaved changes when switching')

    const orders = connection.db.collection('orders')
    const leadFilter = { _id: lead._id, tenantId: company._id }
    const previousPlace = {
      orderTypeId: lead.orderTypeId,
      placeType: lead.placeType,
      locationId: lead.locationId,
    }
    await orders.updateOne(leadFilter, {
      $set: {
        orderTypeId: type._id,
        placeType: 'company_location',
        locationId: location._id,
      },
    })
    try {
      const directLeadLink = new URL('/company/work', origin)
      directLeadLink.searchParams.set('companyId', String(company._id))
      directLeadLink.searchParams.set('orderId', String(lead._id))
      directLeadLink.searchParams.set('mode', 'edit')
      await page.goto(directLeadLink.href)
      await bookingWizard.getByRole('heading', { name: 'Время', exact: true }).waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
    } finally {
      await orders.updateOne(leadFilter, { $set: previousPlace })
    }
    console.log('PASS browser: existing order resumes on the missing time step from a direct link')

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
    const orderFormLayout = modeEditor.getByLabel('Вид формы заказа', { exact: true })
    const teamComment = modeEditor.getByLabel(/^Комментарий для команды/)
    const orderDetails = modeEditor.getByText('Дополнительные поля', { exact: true })
    await modeEditor.locator('dl[aria-label="Параметры заказа"]').waitFor()
    assert.equal(await teamComment.isVisible(), false)
    assert.equal(await modeEditor.getByRole('checkbox', { name: 'Программа', exact: true }).count(), 0)
    assert.equal(await advancedMode.count(), 0)
    assert.equal(await ordinaryMode.count(), 0)
    assert.equal(await orderFormLayout.count(), 0)

    const financeTab = modeEditor.getByRole('tab', { name: 'Финансы', exact: true })
    const downloadContract = modeEditor.getByRole('button', { name: 'Скачать DOCX', exact: true })
    const documentSettingsPath = '/api/party/company-settings'
    const contractClientPath = `/api/party/clients/${client._id}`
    const settingsLoaded = (response) => new URL(response.url()).pathname === documentSettingsPath &&
      response.request().method() === 'GET'
    const clientRequests = []
    const recordContractClientRequest = (request) => {
      if (new URL(request.url()).pathname === contractClientPath && request.method() === 'GET') {
        clientRequests.push(request.headers()['x-partycrm-company-id'])
      }
    }
    const documentCompanies = connection.db.collection('companies')
    const documentCompanyFilter = { _id: company._id }
    const previousDocuments = await documentCompanies.findOne(documentCompanyFilter, {
      projection: { trialEndsAt: 1, 'settings.documents': 1 },
    })
    page.on('request', recordContractClientRequest)
    try {
      const [lockedSettings] = await Promise.all([
        page.waitForResponse(settingsLoaded),
        financeTab.click(),
      ])
      assert.equal((await lockedSettings.json()).data.access.allowDocuments, false)
      await modeEditor.getByText(/на текущем тарифе/i).waitFor()
      assert.equal(await downloadContract.count(), 0)
      assert.equal(clientRequests.length, 0)

      await documentCompanies.updateOne(documentCompanyFilter, { $set: {
        trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        'settings.documents.requisites.providerFullName': 'Организатор проверки',
      } })
      await page.goto(ordinaryEditorUrl)
      const [enabledSettings] = await Promise.all([
        page.waitForResponse(settingsLoaded),
        financeTab.click(),
      ])
      assert.equal((await enabledSettings.json()).data.access.allowDocuments, true)
      await modeEditor.getByText('Договор оказания услуг', { exact: true }).waitFor()
      await modeEditor.getByLabel('№ договора', { exact: true }).fill('23')
      await modeEditor.getByLabel('Дата договора', { exact: true }).fill('2027-11-14')

      await page.evaluate(() => {
        const originalClick = HTMLAnchorElement.prototype.click
        const originalCreateObjectURL = URL.createObjectURL
        const blobs = new Map()
        const capture = { document: null }
        URL.createObjectURL = function (blob) {
          const url = originalCreateObjectURL.call(this, blob)
          blobs.set(url, blob)
          return url
        }
        HTMLAnchorElement.prototype.click = function () {
          if (!this.download.endsWith('.docx')) return originalClick.call(this)
          const { download: name, href } = this
          const blob = blobs.get(href)
          if (!blob) {
            capture.document = { name }
            return
          }
          void blob.slice(0, 4).arrayBuffer().then((buffer) => {
            capture.document = { name, type: blob.type, header: [...new Uint8Array(buffer)] }
          })
        }
        capture.restore = () => {
          HTMLAnchorElement.prototype.click = originalClick
          URL.createObjectURL = originalCreateObjectURL
          delete window.partyContractDownload
        }
        window.partyContractDownload = capture
      })
      await downloadContract.click()
      await page.waitForFunction(() => window.partyContractDownload.document)
      const contract = await page.evaluate(() => window.partyContractDownload.document)
      assert.deepEqual(contract, {
        name: 'Договор №23 от 14.11.2027.docx',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        header: [0x50, 0x4b, 0x03, 0x04],
      })
      assert.ok(clientRequests.length > 0)
      assert.ok(clientRequests.every((tenantId) => tenantId === String(company._id)))

      await page.goto(`${origin}/company/settings/documents`)
      const providerFullName = page.getByLabel('ФИО или полное название поставщика', { exact: true })
      const providerDisplayName = page.getByLabel('Краткое название для документов', { exact: true })
      const providerName = 'ИП Иванов Иван Иванович'
      const shortProviderName = 'ИП Иванов'
      const isSettingsPatch = (request) => new URL(request.url()).pathname === documentSettingsPath &&
        request.method() === 'PATCH'
      const requisitesPatches = []
      const recordRequisitesPatch = (request) => {
        if (isSettingsPatch(request)) requisitesPatches.push(request.postDataJSON())
      }
      page.on('request', recordRequisitesPatch)
      try {
        await providerFullName.fill('')
        await providerFullName.pressSequentially('ИП ')
        assert.equal(await providerFullName.inputValue(), 'ИП ')
        await providerFullName.pressSequentially('Иванов Иван Иванович')
        assert.equal(await providerFullName.inputValue(), providerName)
        assert.equal(requisitesPatches.length, 0)

        const [fullNameSaved, displayNameSaved] = await Promise.all([
          page.waitForResponse((response) => isSettingsPatch(response.request()) &&
            response.request().postDataJSON().documents?.requisites?.providerFullName === providerName &&
            response.request().postDataJSON().documents?.requisites?.providerDisplayName !== shortProviderName),
          page.waitForResponse((response) => isSettingsPatch(response.request()) &&
            response.request().postDataJSON().documents?.requisites?.providerDisplayName === shortProviderName),
          (async () => {
            await providerDisplayName.fill(shortProviderName)
            await providerDisplayName.blur()
          })(),
        ])
        assert.ok(fullNameSaved.ok() && displayNameSaved.ok())
        assert.equal(requisitesPatches.length, 2)
        const savedRequisites = (await documentCompanies.findOne(documentCompanyFilter)).settings.documents.requisites
        assert.equal(savedRequisites.providerFullName, providerName)
        assert.equal(savedRequisites.providerDisplayName, shortProviderName)
      } finally {
        page.off('request', recordRequisitesPatch)
      }
      console.log('PASS browser: company requisites preserve spaces while typing and save both fields on blur')

      await page.getByRole('button', { name: 'Ещё', exact: true }).click()
      const mobileManagement = page.locator('#party-primary-mobile-menu details').filter({
        has: page.getByText('Управление', { exact: true }),
      })
      await mobileManagement.getByRole('link', { name: 'Документы', exact: true }).waitFor()
      assert.equal(await mobileManagement.getByText('Настройки компании', { exact: true }).count(), 0)
      await page.keyboard.press('Escape')

      for (const documentName of ['договора', 'акта']) {
        const chooseFile = page.getByRole('button', { name: `Выбрать файл ${documentName}`, exact: true })
        const [chooser] = await Promise.all([
          page.waitForEvent('filechooser'),
          chooseFile.press('Enter'),
        ])
        assert.equal(await chooser.element().getAttribute('accept'), '.docx')
        assert.equal(await chooser.element().isVisible(), false)
        await chooser.setFiles([])
      }
    } finally {
      page.off('request', recordContractClientRequest)
      await page.evaluate(() => window.partyContractDownload?.restore())
      const restore = { $set: {}, $unset: {} }
      for (const [field, value] of Object.entries({
        trialEndsAt: previousDocuments?.trialEndsAt,
        'settings.documents': previousDocuments?.settings?.documents,
      })) {
        if (value === undefined) restore.$unset[field] = ''
        else restore.$set[field] = value
      }
      await documentCompanies.updateOne(documentCompanyFilter, restore)
    }
    console.log('PASS browser: ordinary order editor exports a DOCX contract only on an allowed plan')
    await page.goto(ordinaryEditorUrl)
    await modeEditor.locator('dl[aria-label="Параметры заказа"]').waitFor()

    const statusBadge = modeEditor.getByText('Статус заказа', { exact: true }).locator('..')
    const wizardLauncher = modeEditor.getByRole('button', { name: 'Редактировать по шагам', exact: true })
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
    await bookingWizard.getByRole('heading', { name: 'Клиент', exact: true }).waitFor()
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
    const compactServices = modeEditor.locator('details[data-order-section="Услуги"] > summary')
    const classicMainTab = modeEditor.getByRole('tab', { name: 'Основное', exact: true })
    const boardBeforeWizardSwitch = await boardRegion.elementHandle()
    await leadCard.getByRole('button', { name: /^Открыть заказ/ }).click()
    await bookingWizard.getByRole('heading', { name: 'Тип', exact: true }).waitFor()
    await bookingWizard.getByRole('button', { name: 'Расширенный режим', exact: true }).click()
    await orderFormLayout.waitFor()
    assert.equal(await orderFormLayout.inputValue(), 'compact')
    await compactServices.waitFor()
    await orderFormLayout.selectOption('classic')
    await classicMainTab.waitFor()
    await ordinaryMode.click()
    await editInSteps.waitFor()
    assert.ok(await boardBeforeWizardSwitch.evaluate((element) => element.isConnected))
    await modeEditor.getByRole('button', { name: 'Отмена', exact: true }).click()
    await modeEditor.waitFor({ state: 'hidden' })
    console.log('PASS browser: developer can reach the advanced editor from an incomplete order wizard')

    const boardCard = page.locator(`article[data-party-order-board-id="${orderId}"]`)
    const openBoardOrder = boardCard.getByRole('button', { name: /^Открыть заказ/ })
    const moveBoardOrder = boardCard.getByRole('button', { name: /^Переместить заказ/ })
    await page.setViewportSize({ width: 320, height: 844 })
    await boardCard.scrollIntoViewIfNeeded()
    const calendarTile = boardCard.locator('time[datetime]')
    assert.equal(await calendarTile.getAttribute('datetime'), '2027-11-15T03:00:00.000Z')
    const [day, month, time] = await calendarTile.locator(':scope > span').allTextContents()
    assert.equal(day, '15')
    assert.match(month, /^ноя/)
    assert.equal(time, '10:00')
    const [cardBounds, dateBounds, titleBounds, statusBounds, moveBounds] = await Promise.all([
      boardCard.boundingBox(), calendarTile.boundingBox(), openBoardOrder.boundingBox(),
      boardCard.getByText('Заявка', { exact: true }).boundingBox(), moveBoardOrder.boundingBox(),
    ])
    assert.ok(cardBounds && dateBounds && titleBounds && statusBounds && moveBounds)
    assert.ok(moveBounds.width >= 44 && moveBounds.height >= 44)
    assert.ok(dateBounds.x + dateBounds.width <= titleBounds.x)
    assert.ok(statusBounds.x + statusBounds.width <= moveBounds.x)
    assert.ok(statusBounds.y + statusBounds.height <= titleBounds.y)
    assert.ok(moveBounds.y + moveBounds.height <= titleBounds.y)
    assert.ok(titleBounds.x + titleBounds.width >= moveBounds.x)
    assert.ok(moveBounds.x + moveBounds.width <= cardBounds.x + cardBounds.width)
    await moveBoardOrder.press('Enter')
    await stageMenu.getByRole('menuitem', { name: 'Подготовка', exact: true }).waitFor()
    await page.keyboard.press('Escape')
    await stageMenu.waitFor({ state: 'hidden' })
    await page.waitForFunction(() =>
      document.activeElement?.getAttribute('aria-label')?.startsWith('Переместить заказ')
    )
    console.log('PASS browser: calendar tile, compact card layout and keyboard stage menu on a 320 px viewport')
    await page.setViewportSize({ width: 390, height: 844 })
    await openBoardOrder.click()
    const originalBoard = await boardRegion.elementHandle()
    const originalWorkUrl = page.url()
    const checkModeFooter = async (modeLink) => {
      const cancel = modeEditor.getByRole('button', { name: 'Отмена', exact: true })
      const save = modeEditor.getByRole('button', { name: 'Сохранить', exact: true })
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 844 })
        await Promise.all([modeLink, cancel, save, modeEditor].map((control) => control.waitFor()))
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
    await orderFormLayout.waitFor()
    assert.equal(await orderFormLayout.inputValue(), 'compact')
    await compactServices.waitFor()
    const commentSection = modeEditor.locator('details[data-order-section="Комментарии"] > summary')
    await commentSection.click()
    const advancedComment = modeEditor.getByLabel('Комментарий для администратора', { exact: true })
    const unsavedAdvancedComment = 'Несохранённый комментарий в расширенном режиме'
    await advancedComment.fill(unsavedAdvancedComment)
    await orderFormLayout.selectOption('classic')
    await classicMainTab.waitFor()
    assert.equal(await compactServices.count(), 0)
    assert.equal(await advancedComment.inputValue(), unsavedAdvancedComment)
    await orderFormLayout.selectOption('compact')
    await compactServices.waitFor()
    assert.equal(await classicMainTab.count(), 0)
    if (!await advancedComment.isVisible()) await commentSection.click()
    assert.equal(await advancedComment.inputValue(), unsavedAdvancedComment)
    console.log('PASS browser: developer switches form layouts in place without losing draft changes')
    page.once('dialog', (notice) => notice.dismiss())
    await ordinaryMode.click()
    assert.equal(await advancedComment.inputValue(), unsavedAdvancedComment)
    const [advancedSave] = await Promise.all([
      page.waitForResponse((response) =>
        new URL(response.url()).pathname === `/api/party/orders/${orderId}` &&
        response.request().method() === 'PATCH'
      ),
      modeEditor.getByRole('button', { name: 'Сохранить', exact: true }).click(),
    ])
    assert.equal(advancedSave.status(), 200, JSON.stringify(await advancedSave.json()))
    assert.equal((await advancedSave.json()).data.adminComment, unsavedAdvancedComment)
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
    await beginBooking.click()
    await dialog.getByRole('heading', { name: 'Клиент', exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Создать клиента', exact: true }).waitFor()
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    await dialog.getByRole('alert').filter({ hasText: 'Выберите или создайте клиента.' }).waitFor()
    await selectExistingClient()
    await dialog.getByRole('button', { name: 'Далее', exact: true }).click()
    await dialog.getByRole('heading', { name: 'Тип', exact: true }).waitFor()
    console.log('PASS browser: booking without a lead client starts at the client step and validates the selection')
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

    const ticketProvidersPath = '**/api/party/ticketing/providers'
    const ticketProviderMethods = []
    const mockTicketProviders = (route) => {
      const method = route.request().method()
      ticketProviderMethods.push(method)
      if (method !== 'GET') return route.abort()
      return route.fulfill({ json: { success: true, data: {
        encryptionReady: true,
        providers: [{ provider: 'ticketscloud', title: 'Ticketscloud', configured: true, status: 'verified', revision: 1 }],
      } } })
    }
    await page.route(ticketProvidersPath, mockTicketProviders)
    try {
      await page.goto(`${origin}/company/settings/integrations`, { waitUntil: 'domcontentloaded' })
      const calendarAccordion = page.getByRole('button', { name: /^Google Calendar/ })
      const ticketAccordion = page.getByRole('button', { name: /^Билетные сервисы и кассы/ })
      await ticketAccordion.getByText('Интеграция подключена', { exact: true }).waitFor({ state: 'attached' })
      for (const accordion of [calendarAccordion, ticketAccordion]) {
        assert.equal(await accordion.getAttribute('aria-expanded'), 'false')
        assert.ok(await accordion.getAttribute('aria-controls'))
      }
      const ticketPanel = page.locator(`[id="${await ticketAccordion.getAttribute('aria-controls')}"]`)
      await ticketAccordion.press('Enter')
      const ticketKey = ticketPanel.getByLabel('API-ключ Ticketscloud', { exact: true })
      await ticketKey.fill('unsaved-ticket-key')
      assert.equal(await ticketAccordion.getAttribute('aria-expanded'), 'true')
      await ticketAccordion.click()
      await ticketPanel.waitFor({ state: 'hidden' })
      assert.equal(await ticketAccordion.getAttribute('aria-expanded'), 'false')
      await ticketAccordion.click()
      assert.equal(await ticketKey.inputValue(), 'unsaved-ticket-key')
      await ticketKey.clear()
      assert.deepEqual([...new Set(ticketProviderMethods)], ['GET'])
    } finally {
      await page.unroute(ticketProvidersPath, mockTicketProviders)
    }
    console.log('PASS browser: ticket integration accordion keeps its draft when collapsed and reopened')

    const paidTariff = {
      _id: 'qa-paid',
      title: 'Проверка PRO',
      price: 2500,
      allowStatistics: true,
      features: ['Расширенная статистика'],
    }
    const freeTariff = {
      _id: 'qa-free',
      title: 'Проверка Старт',
      price: 0,
      eventsPerMonth: 5,
      features: ['Ведение заявок'],
    }
    let billingTariffId = paidTariff._id
    let checkoutAvailable = false
    const topUpError = 'Тестовый платёж временно недоступен'
    const mockPaymentUrl = `${origin}/robots.txt?checkout=mock`
    const topUpEndpoint = /^\/api\/party\/billing\/(yookassa|tochka)\/create$/
    const billingFixtures = {
      '/api/party/tariffs': () => [paidTariff, freeTariff],
      '/api/party/billing/me': () => ({ tariffId: billingTariffId, balance: 1700, access: {} }),
      '/api/party/billing/config': () => ({
        providers: { yookassa: false, tochka: true },
        defaultProvider: 'tochka',
      }),
      '/api/party/billing/diagnostics': () => null,
      '/api/party/billing/payments': () => [],
      '/api/party/billing/tariff/select': (request) => {
        billingTariffId = request.postDataJSON().tariffId
        return { tariffId: billingTariffId }
      },
    }
    const mocksBilling = (url) =>
      Object.hasOwn(billingFixtures, url.pathname) || topUpEndpoint.test(url.pathname)
    const mockBilling = (route) => {
      const pathname = new URL(route.request().url()).pathname
      const fixture = billingFixtures[pathname]
      if (fixture) return route.fulfill({ json: { success: true, data: fixture(route.request()) } })
      if (checkoutAvailable) return route.fulfill({ json: { success: true, data: { confirmationUrl: mockPaymentUrl } } })
      return route.fulfill({ status: 409, json: { success: false, error: { message: topUpError } } })
    }
    await page.route(mocksBilling, mockBilling)
    try {
      await page.goto(`${origin}/company/settings/tariffs`, { waitUntil: 'domcontentloaded' })
      const changeTariff = page.getByRole('button', { name: 'Сменить тариф', exact: true })
      const topUp = page.getByRole('button', { name: 'Пополнить', exact: true })
      await changeTariff.waitFor()
      for (const heading of ['Текущий тариф', 'Баланс', 'История платежей']) {
        await page.getByRole('heading', { name: heading, exact: true }).waitFor()
      }
      await page.getByText(paidTariff.title, { exact: true }).waitFor()
      await page.getByText(/1\s700 ₽/).waitFor()
      assert.equal(await page.getByText(freeTariff.title, { exact: true }).count(), 0)
      for (const removedText of [
        'Доступные тарифы', 'Пополнение баланса', 'Тариф компании',
        /Баланс пополняется через/, /Бесплатный тариф подключается/, /Тариф .* активирован/,
      ]) {
        assert.equal(await page.getByText(removedText, { exact: true }).count(), 0)
      }

      await changeTariff.press('Enter')
      const tariffDialog = page.getByRole('dialog', { name: 'Сменить тариф', exact: true })
      await tariffDialog.getByText(freeTariff.features[0], { exact: true }).waitFor()
      await tariffDialog.getByText(paidTariff.features[0], { exact: true }).waitFor()
      for (const width of [390, 1280]) {
        await page.setViewportSize({ width, height: 844 })
        assert.ok(await tariffDialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), 'Tariff dialog overflows horizontally')
      }
      await page.keyboard.press('Escape')
      await tariffDialog.waitFor({ state: 'hidden' })
      assert.equal(await changeTariff.evaluate((element) => element === document.activeElement), true)
      await changeTariff.click()
      const [selection] = await Promise.all([
        page.waitForRequest((request) => new URL(request.url()).pathname === '/api/party/billing/tariff/select'),
        tariffDialog.getByRole('button', { name: 'Выбрать', exact: true }).click(),
      ])
      assert.equal(selection.method(), 'POST')
      assert.equal(selection.headers()['x-partycrm-company-id'], String(company._id))
      assert.deepEqual(selection.postDataJSON(), { tariffId: freeTariff._id })
      await tariffDialog.waitFor({ state: 'hidden' })
      await page.getByText(freeTariff.title, { exact: true }).waitFor()

      await page.setViewportSize({ width: 390, height: 844 })
      await topUp.click()
      const topUpDialog = page.getByRole('dialog', { name: 'Пополнение баланса', exact: true })
      await topUpDialog.getByText('Точка', { exact: true }).waitFor()
      assert.equal(await topUpDialog.getByText('ЮKassa', { exact: true }).count(), 0)
      const topUpAmount = topUpDialog.getByLabel(/Сумма пополнения/)
      await topUpAmount.fill('1800')
      const [topUpRequest] = await Promise.all([
        page.waitForRequest((request) => topUpEndpoint.test(new URL(request.url()).pathname)),
        topUpDialog.getByRole('button', { name: 'Пополнить баланс', exact: true }).click(),
      ])
      assert.equal(new URL(topUpRequest.url()).pathname, '/api/party/billing/tochka/create')
      assert.equal(topUpRequest.headers()['x-partycrm-company-id'], String(company._id))
      assert.deepEqual(topUpRequest.postDataJSON(), { purpose: 'balance', amount: 1800 })
      await topUpDialog.getByRole('alert').filter({ hasText: topUpError }).waitFor()
      assert.equal(await topUpAmount.inputValue(), '1800')
      assert.ok(await topUpDialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1), 'Top-up dialog overflows horizontally')
      checkoutAvailable = true
      const [checkoutPage] = await Promise.all([
        page.waitForEvent('popup'),
        topUpDialog.getByRole('button', { name: 'Пополнить баланс', exact: true }).click(),
      ])
      await checkoutPage.waitForURL(mockPaymentUrl)
      await checkoutPage.close()
      await topUpDialog.waitFor({ state: 'hidden' })
    } finally {
      await page.unroute(mocksBilling, mockBilling)
      await page.setViewportSize({ width: 390, height: 844 })
    }
    console.log('PASS browser: tariff and balance dialogs show configured options, preserve billing scope and handle a mocked checkout')

    await page.goto(`${origin}/company/settings/order-types`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: 'Добавить тип', exact: true }).click()
    await page.getByRole('dialog', { name: 'Новый тип заказа', exact: true }).getByLabel('Название типа').waitFor()
    console.log('PASS browser: settings opens the order-type creation dialog')

    await page.goto(`${origin}/company/settings`, { waitUntil: 'domcontentloaded' })
    const branding = page.locator('form', { has: page.getByRole('heading', { name: 'Оформление компании', exact: true }) })
    await branding.waitFor()
    assert.equal(await page.getByText('Вид формы заказа', { exact: true }).count(), 0)
    const uploadLogo = branding.getByLabel('Загрузить логотип', { exact: true })
    const logoUrl = `https://cloud.escalion.ru/uploads/partycrm/companies/${company._id}/branding/test.webp`
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aA/YAAAAASUVORK5CYII=', 'base64')
    await page.route('**/api/party/company-settings/logo', async (route) => {
      const request = route.request()
      assert.equal(request.method(), 'POST')
      assert.equal(request.headers()['x-partycrm-company-id'], String(company._id))
      assert.match(request.headers()['content-type'], /^multipart\/form-data; boundary=/i)
      assert.match(request.postData(), /name="file"; filename="logo\.png"/)
      await route.fulfill({ json: { success: true, data: { logoUrl } } })
    })
    await page.route(logoUrl, (route) => route.fulfill({ contentType: 'image/png', body: png }))
    await uploadLogo.setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: png })
    const preview = branding.getByRole('img', { name: /^Логотип/ })
    await preview.waitFor()
    assert.equal(await preview.getAttribute('src'), logoUrl)
    const companyFilter = { _id: company._id }
    const companies = connection.db.collection('companies')
    assert.notEqual((await companies.findOne(companyFilter)).settings?.branding?.logoUrl, logoUrl)
    await branding.getByRole('button', { name: 'Сохранить оформление', exact: true }).click()
    await branding.getByText('Оформление сохранено', { exact: true }).waitFor()
    assert.equal((await companies.findOne(companyFilter)).settings.branding.logoUrl, logoUrl)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await preview.waitFor()
    assert.equal(await preview.getAttribute('src'), logoUrl)
    await page.setViewportSize({ width: 1280, height: 844 })
    const sidebar = page.locator('aside').filter({
      has: page.getByRole('navigation', { name: 'Основная навигация', exact: true }),
    })
    const sidebarLogo = sidebar.getByRole('img', { name: /^Логотип/ })
    await sidebarLogo.waitFor()
    const [sidebarBounds, logoBounds] = await Promise.all([sidebar.boundingBox(), sidebarLogo.boundingBox()])
    assert.ok(sidebarBounds && logoBounds)
    const sidebarCenter = sidebarBounds.x + sidebarBounds.width / 2
    const logoCenter = logoBounds.x + logoBounds.width / 2
    assert.ok(Math.abs(sidebarCenter - logoCenter) <= 1, 'The company logo is not centered in the sidebar')
    await page.setViewportSize({ width: 390, height: 844 })
    await branding.getByRole('button', { name: 'Убрать логотип', exact: true }).click()
    await branding.getByRole('button', { name: 'Сохранить оформление', exact: true }).click()
    await branding.getByText('Оформление сохранено', { exact: true }).waitFor()
    assert.equal((await companies.findOne(companyFilter)).settings.branding.logoUrl, '')
    console.log('PASS browser: company logo upload, preview, persistence and removal')

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

    const managerUserId = new Types.ObjectId()
    const managerStaffId = new Types.ObjectId()
    const managerPositionId = new Types.ObjectId()
    const intakePermissions = {
      orders: 'edit',
      'orders.create': 'edit',
      'orders.title': 'read',
      'orders.status': 'read',
      'orders.workflowStageId': 'read',
      'orders.clientId': 'edit',
      'orders.client.name': 'edit',
      'orders.client.phone': 'edit',
      'orders.adminComment': 'edit',
      'clients.create': 'edit',
    }
    await connection.db.collection('users').insertOne({
      _id: managerUserId, phone: '79990000097', firstName: 'Менеджер проверки',
      role: 'user', status: 'active', interfaceRoles: ['company'], lastWorkspace: 'company',
    })
    await connection.db.collection('roles').insertOne({
      _id: managerPositionId, tenantId: company._id, title: 'Приём заявок',
      baseRole: 'admin', systemKey: null, active: true, revision: 0,
      permissions: intakePermissions,
      orderScope: { includeUnlocated: true, assignedOnly: false, locationIds: [], stageIds: [], statuses: [] },
    })
    await connection.db.collection('staff').insertOne({
      _id: managerStaffId, tenantId: company._id, authUserId: String(managerUserId),
      firstName: 'Менеджер проверки', role: 'admin', status: 'active',
      positionId: managerPositionId, locationIds: [],
    })
    const managerContext = await browser.newContext({
      viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      locale: 'ru-RU', timezoneId: 'Asia/Krasnoyarsk',
    })
    try {
      const managerSession = Buffer.from(JSON.stringify({ uid: String(managerUserId), phone: '79990000097', iat: Date.now() })).toString('base64url')
      await managerContext.addCookies([{
        name: 'partycrm_session',
        value: `${managerSession}.${createHmac('sha256', secret).update(managerSession).digest('base64url')}`,
        url: origin,
      }])
      const managerPage = await managerContext.newPage()
      activePage = managerPage
      managerPage.setDefaultTimeout(12000)
      managerPage.on('pageerror', (error) => errors.push(error.message))
      const managerDialog = managerPage.getByRole('dialog', { name: 'Новая заявка', exact: true })
      const managerPicker = managerPage.getByRole('dialog', { name: 'Выбор клиента', exact: true })
      const managerClientForm = managerPage.getByRole('dialog', { name: 'Новый клиент', exact: true })
      const managerClientTrigger = managerDialog.getByRole('button', { name: /^Основной клиент:/ })
      const managerHeaders = { 'x-partycrm-company-id': String(company._id) }
      const managerLookup = async (query) => {
        await managerClientTrigger.click()
        const [response] = await Promise.all([
          managerPage.waitForResponse((candidate) => {
            const url = new URL(candidate.url())
            return url.pathname === clientOptionsPath && candidate.request().method() === 'GET' && url.searchParams.get('q') === query
          }),
          managerPicker.getByLabel('Поиск клиента', { exact: true }).fill(query),
        ])
        assert.equal(response.status(), 200)
        return (await response.json()).data
      }
      const openManagerLead = async () => {
        await managerPage.goto(`${origin}/company/work?companyId=${company._id}`, { waitUntil: 'domcontentloaded' })
        await managerPage.getByRole('button', { name: '+ Заказ', exact: true }).click()
        await managerDialog.waitFor()
      }
      await openManagerLead()
      const boardColumns = managerPage.getByRole('region', {
        name: 'Колонки доски заказов',
        includeHidden: true,
      })
      await boardColumns.locator('header h2').last().waitFor()
      await managerPage.waitForFunction(() =>
        document.documentElement.scrollWidth === document.documentElement.clientWidth
      )
      assert.ok(await boardColumns.evaluate((element) => element.scrollWidth > element.clientWidth))
      const managerMatches = await managerLookup(String(client.phone))
      assert.ok(managerMatches.some((person) => String(person._id) === String(client._id)))
      await managerPicker.getByRole('list', { name: 'Клиенты', exact: true }).getByRole('button', { name: client.firstName }).tap()
      await managerPicker.waitFor({ state: 'hidden' })
      assert.ok((await managerClientTrigger.textContent()).includes(client.firstName))
      await managerClientTrigger.click()
      await managerPicker.getByRole('button', { name: 'Создать клиента', exact: true }).click()
      await managerClientForm.getByLabel('ФИО', { exact: true }).fill('Ролевой Клиент')
      await managerClientForm.getByLabel('Телефон', { exact: true }).fill('9000000488')
      const [managerClientResponse] = await Promise.all([
        managerPage.waitForResponse((response) => new URL(response.url()).pathname === clientOptionsPath && response.request().method() === 'POST'),
        managerClientForm.getByRole('button', { name: 'Создать и выбрать', exact: true }).click(),
      ])
      assert.equal(managerClientResponse.status(), 201)
      const managerClient = (await managerClientResponse.json()).data
      await managerClientForm.waitFor({ state: 'hidden' })
      await managerPicker.waitFor({ state: 'hidden' })
      await managerDialog.getByRole('textbox', { name: /^Суть обращения/ }).fill('Заявка менеджера с ограниченной должностью')
      const [managerLeadResponse] = await Promise.all([
        managerPage.waitForResponse((response) => new URL(response.url()).pathname === '/api/party/orders' && response.request().method() === 'POST'),
        managerDialog.getByRole('button', { name: 'Сохранить заявку', exact: true }).click(),
      ])
      assert.equal(managerLeadResponse.ok(), true)
      const managerLead = (await managerLeadResponse.json()).data
      const storedManagerLead = await connection.db.collection('orders').findOne({ _id: new Types.ObjectId(managerLead._id), tenantId: company._id })
      assert.equal(String(storedManagerLead.clientId), managerClient._id)
      assert.equal(storedManagerLead.eventDate, null)
      console.log('PASS browser: non-owner intake manager can select, create and save an undated client lead')

      await connection.db.collection('roles').updateOne({ _id: managerPositionId }, { $set: { permissions: { ...intakePermissions, 'orders.client.phone': 'hidden', 'clients.create': 'hidden' } }, $inc: { revision: 1 } })
      await openManagerLead()
      assert.equal(await managerDialog.getByRole('button', { name: 'Создать клиента', exact: true }).count(), 0)
      const hiddenPhoneMatches = await managerLookup(managerClient.name)
      assert.ok(hiddenPhoneMatches.some((person) => person._id === managerClient._id))
      assert.ok(hiddenPhoneMatches.every((person) => person.phone === undefined && person.email === undefined))
      assert.equal(await managerPicker.getByText('9000000488', { exact: false }).count(), 0)
      assert.equal(await managerPicker.getByRole('button', { name: 'Создать клиента', exact: true }).count(), 0)
      const createDenied = await managerPage.request.post(`${origin}${clientOptionsPath}`, { headers: managerHeaders, data: { firstName: 'Недоступный клиент' } })
      assert.equal(createDenied.status(), 403)
      console.log('PASS browser: phone and client-creation restrictions mask lookup data and reject direct creation')

      await connection.db.collection('roles').updateOne({ _id: managerPositionId }, { $set: { permissions: { ...intakePermissions, 'orders.clientId': 'read' } }, $inc: { revision: 1 } })
      await openManagerLead()
      assert.equal(await managerClientTrigger.count(), 0)
      assert.equal(await managerDialog.getByLabel('Поиск клиента', { exact: true }).count(), 0)
      assert.equal(await managerDialog.getByRole('button', { name: 'Создать клиента', exact: true }).count(), 0)
      const lookupDenied = await managerPage.request.get(`${origin}${clientOptionsPath}?q=${encodeURIComponent(managerClient.name)}`, { headers: managerHeaders })
      assert.equal(lookupDenied.status(), 403)
      await managerDialog.getByRole('textbox', { name: /^Суть обращения/ }).fill('Заявка без права менять клиента')
      const [noteLeadResponse] = await Promise.all([
        managerPage.waitForResponse((response) => new URL(response.url()).pathname === '/api/party/orders' && response.request().method() === 'POST'),
        managerDialog.getByRole('button', { name: 'Сохранить заявку', exact: true }).click(),
      ])
      assert.equal(noteLeadResponse.ok(), true)
      const noteLead = (await noteLeadResponse.json()).data
      const storedNoteLead = await connection.db.collection('orders').findOne({ _id: new Types.ObjectId(noteLead._id), tenantId: company._id })
      assert.equal(storedNoteLead.clientId, null)
      assert.equal(storedNoteLead.adminComment, 'Заявка без права менять клиента')
      console.log('PASS browser: read-only client binding hides selection and preserves authorized note-only intake')
    } finally {
      await managerContext.close()
    }

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
