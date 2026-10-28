import assert from 'node:assert/strict'
import test from 'node:test'
import { partyTasksLink, readPartyTaskFocus } from './partyTaskFocus.js'

const first = '1'.repeat(24),
  second = '2'.repeat(24),
  task = 'a'.repeat(24)
const companies = [{ id: first }, { id: second }]

test('a task link selects its explicit authorized company independently of the first company', () => {
  assert.deepEqual(
    readPartyTaskFocus(`companyId=${second}&taskId=${task}`, companies),
    { requested: true, companyId: second, taskId: task, error: '' }
  )
  assert.equal(
    readPartyTaskFocus(`companyId=${second}`, companies).companyId,
    second
  )
  assert.equal(readPartyTaskFocus('', companies).requested, false)
})

test('invalid, incomplete, repeated and foreign task links cannot select an arbitrary company', () => {
  for (const query of [
    `taskId=${task}`,
    `companyId=${first}&taskId=`,
    `companyId=${first}&taskId=bad`,
    `companyId=${first}&companyId=${second}&taskId=${task}`,
    `companyId=${first}&taskId=${task}&taskId=${task}`,
    `companyId=${'3'.repeat(24)}&taskId=${task}`,
  ]) {
    const result = readPartyTaskFocus(query, companies)
    assert.equal(result.requested, true, query)
    assert.equal(result.companyId, '', query)
    assert.equal(result.taskId, '', query)
    assert.ok(result.error, query)
  }
})

test('task links use relative known paths and round-trip without leaking arbitrary URL data', () => {
  const link = partyTasksLink(second, task)
  assert.equal(link, `/performer/tasks?companyId=${second}&taskId=${task}`)
  assert.equal(
    partyTasksLink(second, task, '/company'),
    `/company/tasks?companyId=${second}&taskId=${task}`
  )
  assert.equal(partyTasksLink(second, task, 'https://foreign.example'), link)
  assert.equal(readPartyTaskFocus(link.split('?')[1], companies).taskId, task)
  assert.equal(partyTasksLink('foreign', task), '')
  assert.equal(partyTasksLink(second, 'not-a-task'), '')
})
