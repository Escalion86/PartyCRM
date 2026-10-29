import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as presentation from './resourceCalendarPresentation.js'
import {
  createHookHost,
  nodes,
  textOf,
} from '../orders/partyOrderBoardTestHost.mjs'
import { getPartyResourceCalendarAccess } from '../../../helpers/partyResourceCalendar.js'
import { uniquePartyCompanyMemberships } from '../../../helpers/uniquePartyCompanyMemberships.js'

const require = createRequire(import.meta.url)
const { transformSync } = require('next/dist/build/swc')
const read = (name) => readFileSync(new URL(name, import.meta.url), 'utf8')
const compile = (source, dependencies, environment = {}) => {
  const code = transformSync(source, {
    filename: 'Resources.js',
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  }).code
  const compiled = { exports: {} }
  new Function(
    'require',
    'module',
    'exports',
    ...Object.keys(environment),
    code
  )(
    (name) => dependencies[name] || require(name),
    compiled,
    compiled.exports,
    ...Object.values(environment)
  )
  return compiled.exports
}
const companyId = 'a'.repeat(24),
  orderId = 'b'.repeat(24),
  resourceId = 'c'.repeat(24)
const company = {
  id: companyId,
  title: 'Компания',
  preferenceId: 'd'.repeat(24),
  timeZone: 'Asia/Krasnoyarsk',
  resourceTypes: [
    { id: 'location', title: 'Площадки' },
    { id: 'staff', title: 'Сотрудники' },
  ],
}
const period = presentation.resourcePeriod(
  '2026-10-29',
  'day',
  company.timeZone
)
const row = {
  id: 'booking1',
  resourceId,
  kind: 'order',
  orderId,
  title: 'Частный праздник',
  start: '2026-10-29T03:00:00Z',
  end: '2026-10-29T04:00:00Z',
  occupiedFrom: '2026-10-29T02:30:00Z',
  occupiedUntil: '2026-10-29T04:15:00Z',
  bufferBeforeMinutes: 30,
  bufferAfterMinutes: 15,
  conflict: false,
}
const data = (extra = {}) => ({
  type: 'location',
  resourceTypes: company.resourceTypes,
  resources: [{ id: resourceId, type: 'location', title: 'Главный зал' }],
  items: [row],
  notice: 'Показаны только доступные записи.',
  ...extra,
})
const dependencies = {
  './resourceCalendarPresentation': presentation,
  './usePartyResourceCalendar': () => ({
    data: null,
    busy: false,
    error: '',
    reload() {},
  }),
  'next/link': ({ children, ...props }) =>
    React.createElement('a', props, children),
}
const components = compile(read('./PartyResourceCalendar.js'), dependencies)
const html = (value, extra = {}) =>
  renderToStaticMarkup(
    React.createElement(components.PartyResourceCalendarContent, {
      data: value,
      period,
      timeZone: company.timeZone,
      companyId,
      ...extra,
    })
  )

test('actual resource JSX shows buffers, company time, explicit intervals and safe canonical links', () => {
  const result = html(data(), { presentation: 'agenda', company: true })
  assert.match(result, /Частный праздник/)
  assert.match(result, /Главный зал/)
  assert.match(result, /10:00/)
  assert.match(result, /11:00/)
  assert.match(result, /Подготовка: 30 мин/)
  assert.match(result, /Уборка: 15 мин/)
  assert.match(
    result,
    new RegExp(`/company/work\\?companyId=${companyId}&amp;orderId=${orderId}`)
  )
  assert.doesNotMatch(result, /Есть пересечение|свободен|Перенести/)
})

test('partial empty calendars never claim availability and visible resource filtering does not leak others', () => {
  const partial = html(data({ items: [], partial: true }))
  assert.match(partial, /Показана часть данных/)
  assert.match(partial, /не подтверждает свободное время/)
  assert.doesNotMatch(partial, /Ресурс свободен/)
  const filtered = html(
    data({
      resources: [...data().resources, { id: 'second', title: 'Другой зал' }],
      items: [
        row,
        {
          ...row,
          id: 'second-item',
          resourceId: 'second',
          title: 'Другой частный клиент',
        },
      ],
    }),
    { resourceId }
  )
  assert.doesNotMatch(filtered, /Другой зал|Другой частный клиент/)
})

test('real timeline keeps visible conflicts distinct from overlap lanes and warns about declined assignments', () => {
  const result = html(
    data({
      resources: [
        {
          id: resourceId,
          type: 'inventory',
          title: 'Комплект',
          capacity: 3,
          unit: 'шт',
        },
      ],
      intervalNotice: 'Сотрудники показаны на весь интервал заказа.',
      items: [
        row,
        {
          ...row,
          id: 'declined',
          title: 'Выезд',
          confirmationStatus: 'declined',
          conflict: true,
        },
      ],
    })
  )
  assert.match(result, /Доступно по справочнику/)
  assert.match(result, /Сотрудники показаны на весь интервал заказа/)
  assert.match(result, /сотрудник отказался, назначение не снято/)
  assert.match(result, /Сотрудник отказался/)
  assert.match(result, /Есть пересечение занятости/)
  assert.match(result, /Временная шкала ресурсов/)
})

test('real calendar controls restore allowed employee/company preferences and keep explicit refresh', () => {
  const writes = [],
    calls = []
  const h = createHookHost(
    (hooks) => {
      const component = compile(
        read('./PartyResourceCalendar.js'),
        {
          ...dependencies,
          react: { ...React, ...hooks },
          './usePartyResourceCalendar': (input) => {
            calls.push(input)
            return {
              data: data(),
              busy: false,
              error: '',
              reload() {
                calls.push('reload')
              },
            }
          },
        },
        {
          window: {
            localStorage: {
              getItem: () =>
                JSON.stringify({
                  type: 'staff',
                  view: 'week',
                  presentation: 'agenda',
                }),
              setItem: (...args) => writes.push(args),
            },
          },
          requestAnimationFrame: (run) => {
            run()
            return 1
          },
          cancelAnimationFrame() {},
        }
      ).default
      return (props) => component(props)
    },
    { company }
  )
  h.render()
  assert.equal(calls.at(-1).type, 'staff')
  assert.equal(
    (+new Date(calls.at(-1).dateTo) - +new Date(calls.at(-1).dateFrom)) /
      86400000,
    7
  )
  const select = [...nodes(h.value)].find(
    (node) => node.props?.['aria-label'] === 'Вид ресурсов'
  )
  select.props.onChange({ target: { value: 'location' } })
  h.render()
  assert.equal(calls.at(-1).type, 'location')
  assert.equal(
    writes[0][0],
    presentation.resourcePreferenceKey(company.id, company.preferenceId)
  )
  assert.equal(JSON.parse(writes[0][1]).type, 'location')
  const dayButton = [...nodes(h.value)].find(
    (node) => node.type === 'button' && textOf(node) === 'День'
  )
  dayButton.props.onClick()
  h.render()
  assert.equal(
    (+new Date(calls.at(-1).dateTo) - +new Date(calls.at(-1).dateFrom)) /
      86400000,
    1
  )
  const refresh = [...nodes(h.value)].find(
    (node) => node.type === 'button' && textOf(node) === 'Обновить'
  )
  refresh.props.onClick()
  assert.equal(calls.at(-1), 'reload')
  h.dispose()
})

test('resource loading/error JSX hides stale data instead of presenting false success', () => {
  for (const result of [
    { data: data(), busy: true, error: '' },
    { data: null, busy: false, error: 'Нет доступа' },
  ]) {
    const h = createHookHost(
      (hooks) => {
        const component = compile(
          read('./PartyResourceCalendar.js'),
          {
            ...dependencies,
            react: { ...React, ...hooks },
            './usePartyResourceCalendar': () => ({ ...result, reload() {} }),
          },
          {
            window: {
              localStorage: {
                getItem() {
                  throw new Error('blocked')
                },
              },
            },
            requestAnimationFrame: (run) => {
              run()
              return 1
            },
            cancelAnimationFrame() {},
          }
        ).default
        return (props) => component(props)
      },
      { company }
    )
    h.render()
    const text = textOf(h.value)
    assert.doesNotMatch(text, /Частный праздник|Интервалов:|свободен/)
    assert.match(
      text,
      result.busy ? /Загружаем доступную занятость/ : /Нет доступа/
    )
    h.dispose()
  }
})

test('actual search control debounces server search, clears the local selector and suppresses old content while typing', () => {
  const calls = []
  const h = createHookHost(
    (hooks) => {
      const component = compile(
        read('./PartyResourceCalendar.js'),
        {
          ...dependencies,
          react: { ...React, ...hooks },
          './usePartyResourceCalendar': (input) => {
            calls.push(input)
            return {
              data: input.enabled ? data() : null,
              busy: false,
              error: '',
              reload() {},
            }
          },
        },
        {
          window: { localStorage: { getItem: () => null } },
          requestAnimationFrame: (run) => {
            run()
            return 1
          },
          cancelAnimationFrame() {},
          setTimeout: hooks.setTimeout,
          clearTimeout: hooks.clearTimeout,
        }
      ).default
      return (props) => component(props)
    },
    { company }
  )
  h.render()
  const find = (label) =>
    [...nodes(h.value)].find((node) => node.props?.['aria-label'] === label)
  find('Конкретный ресурс').props.onChange({ target: { value: resourceId } })
  h.render()
  assert.equal(find('Конкретный ресурс').props.value, resourceId)
  find('Найти ресурс').props.onChange({ target: { value: 'Кр' } })
  h.render()
  assert.equal(calls.at(-1).enabled, false)
  assert.match(textOf(h.value), /Загружаем доступную занятость/)
  find('Найти ресурс').props.onChange({ target: { value: ' Красный зал ' } })
  h.render()
  assert.equal(calls.at(-1).resourceSearch, '')
  h.timers()
  assert.equal(calls.at(-1).resourceSearch, 'Красный зал')
  assert.equal(calls.at(-1).enabled, true)
  assert.equal(find('Конкретный ресурс').props.value, '')
  assert.equal(
    calls.some((call) => call.resourceSearch === 'Кр'),
    false
  )
  assert.equal(find('Найти ресурс').props.maxLength, 120)
  h.dispose()
})

test('same-company resource-type revocation immediately disables old queries and selects an allowed type', () => {
  const calls = []
  const h = createHookHost(
    (hooks) => {
      const component = compile(
        read('./PartyResourceCalendar.js'),
        {
          ...dependencies,
          react: { ...React, ...hooks },
          './usePartyResourceCalendar': (input) => {
            calls.push(input)
            return { data: null, busy: input.enabled, error: '', reload() {} }
          },
        },
        {
          window: { localStorage: { getItem: () => null } },
          requestAnimationFrame: (run) => {
            run()
            return 1
          },
          cancelAnimationFrame() {},
          setTimeout: hooks.setTimeout,
          clearTimeout: hooks.clearTimeout,
        }
      ).default
      return (props) => component(props)
    },
    { company: { ...company, accessVersion: 'v1' } }
  )
  h.render()
  assert.equal(calls.at(-1).type, 'location')
  h.setProps({
    company: {
      ...company,
      accessVersion: 'v2',
      resourceTypes: [{ id: 'staff', title: 'Сотрудники' }],
    },
  })
  assert.ok(
    calls.some(
      (call) =>
        call.accessVersion === 'v2' &&
        call.enabled === false &&
        call.type === ''
    )
  )
  assert.equal(calls.at(-1).type, 'staff')
  assert.equal(calls.at(-1).accessVersion, 'v2')
  h.dispose()
})

test('real resource page checks direct access and filters memberships before company deduplication', async () => {
  let context = { sessionUser: null, memberships: [] }
  const page = compile(read('../../../app/performer/resources/page.js'), {
    'next/navigation': {
      redirect: (url) => {
        throw new Error(`redirect:${url}`)
      },
    },
    '@server/getPartyMembershipContext': async () => context,
    '@helpers/partyResourceCalendar': { getPartyResourceCalendarAccess },
    '@helpers/uniquePartyCompanyMemberships': { uniquePartyCompanyMemberships },
    '@components/party/resources/PartyResourceCalendarWorkspace': () => null,
  }).default
  await assert.rejects(page(), /redirect:\/party\/login/)
  const member = (permissions) => ({
    tenantId: companyId,
    role: 'performer',
    company: { title: 'Компания', settings: { timeZone: company.timeZone } },
    staff: {
      _id: orderId,
      tenantId: companyId,
      role: 'performer',
      status: 'active',
      positionId: resourceId,
    },
    position: {
      _id: resourceId,
      tenantId: companyId,
      active: true,
      permissions,
      orderScope: {},
    },
  })
  context = { sessionUser: { _id: orderId }, memberships: [member({})] }
  await assert.rejects(page(), /redirect:\/party\/entry/)
  const allowed = member({
    orders: 'read',
    'orders.eventDate': 'read',
    'orders.dateEnd': 'read',
    'orders.locationId': 'read',
    locations: 'read',
  })
  context.memberships = [member({}), allowed, allowed]
  const result = await page()
  assert.equal(result.props.companies.length, 1)
  assert.equal(result.props.companies[0].preferenceId, orderId)
  assert.equal(result.props.companies[0].timeZone, company.timeZone)
  assert.deepEqual(result.props.companies[0].resourceTypes, [
    { id: 'location', title: 'Площадки' },
  ])
  const before = result.props.companies[0].accessVersion
  allowed.position.permissions = {
    ...allowed.position.permissions,
    'orders.title': 'hidden',
  }
  const changed = await page()
  assert.notEqual(changed.props.companies[0].accessVersion, before)
})
