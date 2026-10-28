import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import { uniquePartyCompanyMemberships } from '../helpers/uniquePartyCompanyMemberships.js'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'
import {
  buildPartyDeveloperMemberships,
  buildPartyMembership,
  sortPartyMemberships,
} from './partyMembershipCore.js'

const id = (number) => number.toString(16).padStart(24, '0')
const companyA = id(1),
  companyB = id(2)
const routes = [
  {
    path: '../app/performer/tasks/page.js',
    name: 'TasksPage',
    resource: 'tasks',
    url: '/performer/tasks',
  },
  {
    path: '../app/performer/work/page.js',
    name: 'WorkPage',
    resource: 'orders',
    url: '/performer/work',
  },
  {
    path: '../app/performer/ticketing/page.js',
    name: 'TicketingPage',
    resource: 'tickets',
    url: '/performer/ticketing',
  },
  {
    path: '../app/performer/library/page.js',
    name: 'CreativeLibraryPage',
    url: '/performer/library',
    emptyRedirect: '/party/entry',
  },
  {
    path: '../app/performer/reports/page.js',
    name: 'ReportReviewPage',
    url: '/performer/reports',
    emptyRedirect: '/party/entry',
  },
  {
    path: '../app/company/inventory/page.js',
    name: 'InventoryPage',
    url: '/company/inventory',
    emptyRedirect: '/party/entry',
    companyKey: '_id',
  },
  {
    path: '../app/company/my-locations/page.js',
    name: 'MyLocationsPage',
    url: '/company/my-locations',
    emptyRedirect: '/party/entry',
    allowedRole: 'location_owner',
  },
]

const member = (
  tenantId,
  {
    role = 'admin',
    status = 'active',
    title = 'Компания',
    timeZone = 'Asia/Krasnoyarsk',
    staffNumber = 10,
    permissions,
  } = {}
) => {
  const company = {
    _id: tenantId,
    title,
    settings: { timeZone },
    status: 'active',
  }
  const staff = {
    _id: id(staffNumber),
    tenantId,
    role,
    status,
    authUserId: 'user',
    locationIds: [id(100)],
  }
  const position = permissions
    ? {
        _id: id(staffNumber + 1000),
        tenantId,
        active: true,
        permissions,
        orderScope: {},
      }
    : null
  if (position) staff.positionId = position._id
  return buildPartyMembership(staff, company, position)
}

// Replace only the leaf JSX with its actual prop expressions. Route bodies,
// authentication, permission filtering, company order and deep-link logic run
// unchanged; React and a database are unnecessary for these server projections.
const jsxExpression = (markup, name) => {
  const start = markup.indexOf(`${name}={`)
  assert.notEqual(start, -1, `Missing JSX prop ${name}`)
  const contentStart = start + name.length + 2
  let depth = 1,
    quote = '',
    escaped = false
  for (let index = contentStart; index < markup.length; index++) {
    const character = markup[index]
    if (quote) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === quote) quote = ''
      continue
    }
    if (["'", '"', '`'].includes(character)) quote = character
    else if (character === '{') depth++
    else if (character === '}' && --depth === 0)
      return markup.slice(contentStart, index)
  }
  throw Error(`Unclosed JSX prop ${name}`)
}
const pageFor = async (route) => {
  let source = (await readFile(new URL(route.path, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
    .replaceAll('export const ', 'const ')
    .replace('export default async function', 'async function')
  const renderAt = source.lastIndexOf('\n  return ')
  assert.ok(renderAt > 0, `Missing final JSX return for ${route.name}`)
  const markup = source.slice(renderAt)
  const props = [
    'companies',
    ...(route.name === 'TicketingPage'
      ? ['initialSessionId', 'initialCompanyId']
      : []),
  ]
  source =
    source.slice(0, renderAt) +
    `\n  return { ${props.map((name) => `${name}: (${jsxExpression(markup, name)})`).join(', ')} }\n}`
  return async (
    memberships,
    { sessionUser = { _id: 'user' }, query = {} } = {}
  ) => {
    const dependencies = {
      uniquePartyCompanyMemberships,
      canPartyAccess,
      redirect: (url) => {
        throw Object.assign(new Error(`Redirect to ${url}`), { url })
      },
      getPartyMembershipContext: async () => ({ sessionUser, memberships }),
    }
    const render = compileFunction(
      `${source}\nreturn ${route.name}({searchParams: Promise.resolve(query)})`,
      [...Object.keys(dependencies), 'query']
    )
    return render(...Object.values(dependencies), query)
  }
}
const companyOptions = (route, ids, title = 'Компания') =>
  ids.map((tenantId) => ({
    [route.companyKey || 'id']: tenantId,
    title,
    ...(route.name === 'TicketingPage' ? { timeZone: 'Asia/Krasnoyarsk' } : {}),
  }))

for (const route of routes) {
  const render = await pageFor(route)
  const allowedRole = route.allowedRole || 'admin'

  test(`${route.name}: developer and real staff produce one company without changing memberships`, async () => {
    const developer = { _id: 'developer-user', role: 'dev' }
    const developerMemberships = buildPartyDeveloperMemberships({
      sessionUser: developer,
      companies: [{ _id: companyA, title: 'Компания', status: 'active' }],
    })
    const memberships = sortPartyMemberships([
      ...developerMemberships,
      member(companyA, { role: allowedRole }),
      member(companyA, { role: allowedRole, staffNumber: 11 }),
    ])
    const before = structuredClone(memberships)
    assert.deepEqual(
      (await render(memberships, { sessionUser: developer })).companies,
      companyOptions(route, [companyA])
    )
    assert.deepEqual(memberships, before)
    assert.equal(memberships.length, 3)
    assert.equal(new Set(memberships.map((entry) => entry.staffId)).size, 3)
  })

  test(`${route.name}: company order is stable and identical names do not merge distinct companies`, async () => {
    const memberships = [
      member(companyB, { role: allowedRole }),
      member(companyA, { role: allowedRole, staffNumber: 11 }),
      member(companyB, {
        role: allowedRole,
        staffNumber: 12,
        title: 'Название из второй карточки',
      }),
    ]
    assert.deepEqual(
      (await render(memberships)).companies,
      companyOptions(route, [companyB, companyA])
    )
  })

  test(`${route.name}: eligibility is checked before removing duplicate company options`, async () => {
    const denied = route.resource
      ? member(companyA, {
          role: 'performer',
          permissions: { [route.resource]: 'hidden' },
        })
      : route.name === 'InventoryPage'
        ? member(companyA, { role: 'performer' })
        : route.name === 'MyLocationsPage'
          ? member(companyA, { role: 'admin' })
          : member(companyA, { role: allowedRole, status: 'paused' })
    const allowed = route.resource
      ? member(companyA, {
          role: 'performer',
          permissions: { [route.resource]: 'read' },
          staffNumber: 11,
        })
      : member(companyA, { role: allowedRole, staffNumber: 11 })
    const memberships = [denied, allowed]
    const before = structuredClone(memberships)
    assert.deepEqual(
      (await render(memberships)).companies,
      companyOptions(route, [companyA])
    )
    assert.deepEqual(memberships, before)
  })

  test(`${route.name}: duplicates cannot bypass authentication or create access`, async () => {
    const memberships = [
      member(companyA, { role: allowedRole }),
      member(companyA, { role: allowedRole, staffNumber: 11 }),
    ]
    await assert.rejects(
      render(memberships, { sessionUser: null }),
      (error) => error.url === `/party/login?callbackUrl=${route.url}`
    )
    const denied = [
      member(companyA, { role: allowedRole, status: 'paused' }),
      member(companyA, {
        role: allowedRole,
        status: 'paused',
        staffNumber: 11,
      }),
    ]
    if (route.emptyRedirect)
      await assert.rejects(
        render(denied),
        (error) => error.url === route.emptyRedirect
      )
    else assert.deepEqual((await render(denied)).companies, [])
  })
}

test('ticket company deduplication preserves time zone and validated focused-session company', async () => {
  const render = await pageFor(
    routes.find((route) => route.name === 'TicketingPage')
  )
  const memberships = [
    member(companyA),
    member(companyB, { timeZone: 'Europe/Moscow', staffNumber: 11 }),
    member(companyB, { timeZone: 'Europe/Moscow', staffNumber: 12 }),
  ]
  const result = await render(memberships, {
    query: { companyId: companyB, sessionId: id(99) },
  })
  assert.equal(result.companies.length, 2)
  assert.equal(result.companies[1].timeZone, 'Europe/Moscow')
  assert.equal(result.initialCompanyId, companyB)
  assert.equal(result.initialSessionId, id(99))
  const forbidden = await render(memberships, {
    query: { companyId: id(999), sessionId: id(99) },
  })
  assert.equal(forbidden.initialCompanyId, '')
  assert.equal(forbidden.initialSessionId, '')
  const invalid = await render(memberships, {
    query: { companyId: companyB, sessionId: 'invalid' },
  })
  assert.equal(invalid.initialSessionId, '')
})
