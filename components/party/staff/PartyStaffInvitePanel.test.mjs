import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('first invite button click creates link without a second create action', async () => {
  const source = await readFile(
    new URL('./PartyStaffInvitePanel.js', import.meta.url),
    'utf8'
  )

  assert.match(source, /const toggle = async/)
  assert.match(source, /await createInvite\(event\)/)
  assert.doesNotMatch(source, /Создать ссылку на 7 дней/)
})
