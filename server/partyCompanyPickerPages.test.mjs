import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { compileFunction } from 'node:vm'
import { uniquePartyCompanyMemberships } from '../helpers/uniquePartyCompanyMemberships.js'
import { canAccessCompanySettingsTab, getCompanySettingsTab } from '../app/company/settings/companySettingsTabs.js'

const member = (id, role = 'owner', status = 'active') => ({ tenantId: id, role, status, company: { title: `Компания ${id}` } })
const routes = [
  ['../app/company/settings/page.js', 'CompanySettingsPage'],
  ['../app/company/settings/[tab]/page.js', 'CompanySettingsTabPage'],
  ['../app/company/payroll/page.js', 'PayrollPage'],
]
for (const [path, name] of routes) {
  const source = (await readFile(new URL(path, import.meta.url), 'utf8'))
    .replace(/^import[\s\S]*?from '[^']+'\r?\n/gm, '')
    .replaceAll('export const ', 'const ')
    .replace('export default async function', 'async function')
    .replace(/return <(?:CompanySettingsPageContent|PartyPayrollWorkspace)[^\n]+\/>/, 'return companies')
  const render = (memberships, sessionUser = { _id: 'user' }, tab = 'reports') => {
    const deps = {
      uniquePartyCompanyMemberships, canAccessCompanySettingsTab, getCompanySettingsTab,
      redirect: (url) => { throw new Error(url) },
      notFound: () => { throw new Error('not-found') },
      getPartyMembershipContext: async () => ({ sessionUser, memberships }),
      getPartyEntryState: () => ({ canUseCompany: true, companyReady: true }),
    }
    return compileFunction(`${source}\nreturn ${name}({params: Promise.resolve({tab: '${tab}'})})`, Object.keys(deps))(...Object.values(deps))
  }
  test(`${name}: dev and real membership produce one option per company`, async () => {
    const id = '6a1828661014527ee8515e4e'
    const memberships = [member(id), member(id, 'admin'), member('second', 'admin'), member('hidden', 'performer'), member('paused', 'admin', 'paused')]
    const before = JSON.stringify(memberships)
    assert.deepEqual(await render(memberships), [{ id, title: `Компания ${id}` }, { id: 'second', title: 'Компания second' }])
    assert.equal(JSON.stringify(memberships), before)
    if (name === 'CompanySettingsTabPage') {
      for (const tab of ['integrations', 'notifications', 'documents', 'tariffs', 'schedule'])
        assert.equal((await render(memberships, { _id: 'user' }, tab)).length, 2)
    }
  })
  test(`${name}: duplicates do not grant management access or bypass login`, async () => {
    await assert.rejects(render([member('a')], null), /\/party\/login/)
    await assert.rejects(render([member('a', 'performer'), member('a', 'location_owner')]), /\/company|\/party\/entry/)
    assert.deepEqual(await render([member('a', 'performer'), member('a', 'admin')]), [{ id: 'a', title: 'Компания a' }])
  })
}

test('picker deduplication preserves first membership and ignores missing company IDs', () => {
  const first = member('a')
  assert.deepEqual(uniquePartyCompanyMemberships([first, member('a'), member(null)]), [first])
  assert.equal(uniquePartyCompanyMemberships([first, member('a')])[0], first)
})
