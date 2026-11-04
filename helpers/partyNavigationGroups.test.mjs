import test from 'node:test'
import assert from 'node:assert/strict'
import { getPartyNavigationGroups } from './partyNavigationGroups.js'

test('groups contain exactly the authorized menu without inventing routes', () => {
  const menu = ['/company/tasks', '/company/work', '/company/settings', '/company/finance', '/company/clients'].map((href) => ({ href }))
  const before = structuredClone(menu)
  const groups = getPartyNavigationGroups(menu)
  assert.deepEqual(groups.map((group) => group.id), ['work', 'finance', 'directory', 'management'])
  assert.deepEqual(groups[0].items.map((item) => item.href), ['/company/work', '/company/tasks'])
  assert.deepEqual(groups.flatMap((group) => group.items.map((item) => item.href)).sort(), menu.map((item) => item.href).sort())
  assert.deepEqual(menu, before)
})

test('restricted employees see no empty groups or extra management links', () => {
  const groups = getPartyNavigationGroups([{ href: '/performer/work' }, { href: '/performer/tasks' }])
  assert.equal(groups.length, 1)
  assert.equal(groups[0].id, 'work')
  assert.deepEqual(getPartyNavigationGroups([]), [])
})
