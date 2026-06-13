import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const readSource = (relativePath) =>
  readFile(new URL(relativePath, import.meta.url), 'utf8')

test('invite registration passes only token and loads trusted prefill', async () => {
  const [inviteClient, loginPage, loginClient] = await Promise.all([
    readSource('../invite/[token]/PartyStaffInviteClient.js'),
    readSource('./page.js'),
    readSource('./PartyLoginClient.js'),
  ])

  assert.match(inviteClient, /inviteToken=/)
  assert.match(loginPage, /inviteToken/)
  assert.match(loginClient, /\/api\/party\/invites\//)
  assert.match(loginClient, /registrationPrefill/)
  assert.match(loginClient, /setPhone/)
  assert.match(loginClient, /setFirstName/)
  assert.match(loginClient, /setSecondName/)
  assert.match(loginClient, /setInterfaceRoleMode/)
})
