import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readProjectFile = (path) =>
  readFile(new URL(`../../../${path}`, import.meta.url), 'utf8')

test('PartyCRM login initializes VK ID One Tap with callback mode', async () => {
  const source = await readProjectFile('app/party/login/PartyVkIdOneTap.js')

  assert.match(source, /VKID\.Config\.init/)
  assert.match(source, /responseMode:\s*VKID\.ConfigResponseMode\.Callback/)
  assert.match(source, /source:\s*VKID\.ConfigSource\.LOWCODE/)
  assert.match(source, /\/api\/party\/auth\/vk/)
})

test('VK registration keeps explicit flow and all PartyCRM legal consents', async () => {
  const [clientSource, routeSource] = await Promise.all([
    readProjectFile('app/party/login/PartyVkIdOneTap.js'),
    readProjectFile('app/api/party/auth/vk/route.js'),
  ])

  assert.match(clientSource, /flow="register"|flow,/)
  assert.match(clientSource, /consentTerms/)
  assert.match(clientSource, /consentPrivacyPolicy/)
  assert.match(clientSource, /consentPersonalData/)
  assert.match(routeSource, /flow === 'login' && !user/)
  assert.match(routeSource, /body\?\.consentTerms !== true/)
  assert.match(routeSource, /body\?\.consentPrivacyPolicy !== true/)
  assert.match(routeSource, /body\?\.consentPersonalData !== true/)
})

test('PartyUser supports a sparse unique VK identity and passwordless provider account', async () => {
  const [schemaSource, modelsSource] = await Promise.all([
    readProjectFile('schemas/partyUsersSchema.js'),
    readProjectFile('server/partyModels.js'),
  ])

  const passwordField = schemaSource.match(
    /password:\s*\{([\s\S]*?)\n\s*\},/
  )?.[1]
  assert.ok(passwordField)
  assert.doesNotMatch(passwordField, /required:\s*true/)
  assert.match(schemaSource, /vkId:/)
  assert.match(
    modelsSource,
    /schema\.index\(\{ vkId: 1 \}, \{ unique: true, sparse: true \}\)/
  )
})
