import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as presentation from '../../../helpers/partyTodayPresentation.js'
import { canPartyTodayAccess } from '../../../helpers/partyToday.js'
import { uniquePartyCompanyMemberships } from '../../../helpers/uniquePartyCompanyMemberships.js'

const require = createRequire(import.meta.url)
const { transformSync } = require('next/dist/build/swc')
const compile = (source, dependencies) => {
  const code = transformSync(source, {
    filename: 'Today.js',
    jsc: {
      parser: { syntax: 'ecmascript', jsx: true },
      transform: { react: { runtime: 'automatic' } },
    },
    module: { type: 'commonjs' },
  }).code
  const compiledModule = { exports: {} }
  new Function('require', 'module', 'exports', code)(
    (name) => dependencies[name] || require(name),
    compiledModule,
    compiledModule.exports
  )
  return compiledModule.exports
}
const companyId = 'a'.repeat(24),
  orderId = 'b'.repeat(24)
const task = {
  id: orderId,
  kind: 'task',
  title: 'Проверить комплект',
  reason: 'Срок задачи сегодня',
  dueAt: '2026-10-29T05:00:00Z',
  overdue: false,
  href: `/performer/tasks?taskId=${orderId}`,
}
const section = (extra = {}) => ({
  id: 'tasks',
  title: 'Задачи',
  description: 'Сроки до конца дня',
  items: [task],
  hasMore: false,
  href: '/performer/tasks',
  ...extra,
})
const data = (sections) => ({
  sections,
  timeZone: 'Asia/Krasnoyarsk',
  generatedAt: '2026-10-29T04:00:00Z',
  context: { positionTitle: 'Менеджер' },
})
let result = { data: null, busy: false, error: '', reload() {} }
const components = compile(
  readFileSync(new URL('./PartyToday.js', import.meta.url), 'utf8'),
  {
    '@helpers/partyTodayPresentation': presentation,
    './usePartyToday': () => result,
    'next/link': ({ children, ...props }) =>
      React.createElement('a', props, children),
  }
)
const html = (sections, props = {}) =>
  renderToStaticMarkup(
    React.createElement(components.PartyTodaySections, {
      data: data(sections),
      companyId,
      ...props,
    })
  )

test('real Today JSX keeps precise task links and only supplied phone/client fields', () => {
  const rendered = html([section()])
  assert.match(rendered, /Проверить комплект/)
  assert.match(rendered, new RegExp(`taskId=${orderId}`))
  assert.doesNotMatch(rendered, /tel:|Просрочено|undefined/)
  const contact = html(
    [
      section({
        items: [
          {
            ...task,
            kind: 'order',
            clientName: 'Мария',
            phone: '79131234567',
            href: `/performer/work?orderId=${orderId}`,
          },
        ],
      }),
    ],
    { company: true }
  )
  assert.match(contact, /Мария/)
  assert.match(contact, /tel:\+79131234567/)
  assert.match(contact, /\/company\/work\?/)
})

test('error or bounded partial section never claims successful empty results or total counts', () => {
  const error = html([section({ items: [], error: 'Не удалось загрузить' })])
  assert.match(error, /role="alert"/)
  assert.doesNotMatch(error, /Показано 0|По проверенным условиям действий нет/)
  const partial = html([section({ items: [], partial: true })])
  assert.match(partial, /Проверена часть записей/)
  assert.doesNotMatch(partial, /По проверенным условиям действий нет/)
  assert.match(html([section({ hasMore: true })]), /Показано 1\+/)
})

test('empty sections are optional and filtering does not expose other sections', () => {
  const sections = [
    section(),
    section({
      id: 'payments',
      title: 'Оплаты',
      items: [],
      emptyText: 'Нет ожидаемых оплат',
    }),
  ]
  assert.doesNotMatch(html(sections), /<h2[^>]*>Оплаты/)
  assert.match(html(sections, { showEmpty: true }), /Нет ожидаемых оплат/)
  assert.doesNotMatch(
    html(sections, { filter: 'payments' }),
    /Проверить комплект/
  )
})

test('parent renders loading and failed requests without stale or false empty blocks', () => {
  result = { data: data([section()]), busy: true, error: '', reload() {} }
  const loading = renderToStaticMarkup(
    React.createElement(components.default, { companyId })
  )
  assert.match(loading, /Проверяем доступные/)
  assert.doesNotMatch(loading, /Проверить комплект/)
  result = { data: null, busy: false, error: 'Нет доступа', reload() {} }
  const error = renderToStaticMarkup(
    React.createElement(components.default, { companyId })
  )
  assert.match(error, /Нет доступа/)
  assert.doesNotMatch(
    error,
    /По проверенным условиям действий нет|Проверяем доступные/
  )
})

test('actual Today page filters memberships before deduplication and guards anonymous/direct access', async () => {
  let context
  const page = compile(
    readFileSync(
      new URL('../../../app/performer/today/page.js', import.meta.url),
      'utf8'
    ),
    {
      'next/navigation': {
        redirect: (url) => {
          throw new Error(`redirect:${url}`)
        },
      },
      '@server/getPartyMembershipContext': async () => context,
      '@helpers/partyToday': { canPartyTodayAccess },
      '@helpers/uniquePartyCompanyMemberships': {
        uniquePartyCompanyMemberships,
      },
      '@components/party/today/PartyTodayWorkspace': () => null,
    }
  ).default
  context = { sessionUser: null, memberships: [] }
  await assert.rejects(page(), /redirect:\/party\/login/)
  const member = (permissions) => ({
    tenantId: companyId,
    role: 'performer',
    company: { title: 'Компания' },
    staff: {
      _id: orderId,
      tenantId: companyId,
      role: 'performer',
      status: 'active',
      positionId: orderId,
    },
    position: {
      _id: orderId,
      tenantId: companyId,
      active: true,
      permissions,
      orderScope: {},
    },
  })
  context = { sessionUser: { _id: orderId }, memberships: [member({})] }
  await assert.rejects(page(), /redirect:\/party\/entry/)
  context.memberships = [
    member({}),
    member({ orders: 'read', 'orders.eventDate': 'read' }),
    member({ tasks: 'read' }),
  ]
  const rendered = await page()
  assert.deepEqual(rendered.props.companies, [
    { id: companyId, title: 'Компания' },
  ])
})
