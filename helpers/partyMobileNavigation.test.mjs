import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getPartyMobileNavItems,
  isPartyMobileNavItemActive,
} from './partyMobileNavigation.js'

const item = (href, label = href) => ({ href, label })

test('a company-only employee gets work and tasks from its authorized menu', () => {
  const links = getPartyMobileNavItems({
    company: true,
    preferWork: true,
    canCreate: true,
    menu: [item('/company/work'), item('/company/tasks')],
  })
  assert.deepEqual(
    links.map(({ href, create }) => [href, Boolean(create)]),
    [
      ['/company/work', false],
      ['/company/work', true],
      ['/company/tasks', false],
    ]
  )
  assert.equal(
    links.some(({ href }) =>
      ['/company/orders', '/company/clients', '/company/inbox'].includes(href)
    ),
    false
  )
})

test('an employee without create or reports access gets neither shortcut', () => {
  const links = getPartyMobileNavItems({
    menu: [item('/performer/work'), item('/performer/tasks')],
    preferWork: true,
  })
  assert.deepEqual(
    links.map(({ href }) => href),
    ['/performer/work', '/performer/tasks']
  )
  assert.equal(
    links.some(({ create }) => create),
    false
  )
  assert.equal(
    getPartyMobileNavItems({
      canCreate: true,
      menu: [item('/performer/tasks')],
    }).some(({ create }) => create),
    false
  )
})

test('one modern orders shortcut takes precedence while legacy bookmarks retain their active section', () => {
  const menu = [
    item('/company'),
    item('/company/orders'),
    item('/company/work'),
    item('/company/tasks'),
  ]
  assert.deepEqual(
    getPartyMobileNavItems({ menu, company: true, canCreate: true }).map(
      ({ href }) => href
    ),
    ['/company', '/company/work', '/company/work', '/company/tasks']
  )
  assert.deepEqual(
    getPartyMobileNavItems({
      company: true,
      menu: [item('/company/my-locations'), item('/company/tasks')],
    }).map(({ href }) => href),
    ['/company/my-locations', '/company/tasks']
  )
  assert.equal(
    isPartyMobileNavItemActive('/company/orders-past', '/company/orders'),
    true
  )
  assert.equal(
    isPartyMobileNavItemActive('/company/orders-past', '/company/work'),
    true
  )
  assert.equal(
    isPartyMobileNavItemActive('/company/orders', '/company/work'),
    true
  )
  assert.equal(
    isPartyMobileNavItemActive('/performer', '/performer/work'),
    false
  )
  assert.equal(
    isPartyMobileNavItemActive('/performer/work', '/performer'),
    false
  )
  assert.equal(isPartyMobileNavItemActive('/performer', '/performer'), true)
})

test('modern performer navigation reuses work, tasks and reports only if present', () => {
  const menu = [
    item('/performer'),
    item('/performer/work'),
    item('/performer/tasks'),
    item('/performer/reports'),
  ]
  const links = getPartyMobileNavItems({
    menu,
    preferWork: true,
    canCreate: true,
  })
  assert.equal(links.length, 4)
  assert.equal(links[0].href, '/performer/work')
  assert.equal(links[1].create, true)
  assert.equal(links[2].href, '/performer/tasks')
  assert.equal(links[3].href, '/performer/reports')
})
