import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readProjectFile = (path) =>
  readFile(new URL(`../${path}`, import.meta.url), 'utf8')

test('registration API requires all three legal consents', async () => {
  const source = await readProjectFile('app/api/party/auth/register/route.js')

  assert.match(source, /body\?\.consentTerms === true/)
  assert.match(source, /body\?\.consentPrivacyPolicy === true/)
  assert.match(source, /body\?\.consentPersonalData === true/)
  assert.match(
    source,
    /if \(!consentTerms \|\| !consentPrivacyPolicy \|\| !consentPersonalData\)/
  )
})

test('registration create payload does not persist legal consent fields', async () => {
  const source = await readProjectFile('app/api/party/auth/register/route.js')
  const createPayload = source.match(/PartyUsers\.create\(\{([\s\S]*?)\n\s*\}\)/)?.[1]

  assert.ok(createPayload, 'PartyUsers.create payload must be present')
  assert.doesNotMatch(createPayload, /consent(?:Terms|PrivacyPolicy|PersonalData)/)
  assert.doesNotMatch(
    createPayload,
    /(?:privacyPolicy|personalDataProcessing|terms)AcceptedAt/
  )
})

test('PartyUser schema does not store legal consent fields or timestamps', async () => {
  const source = await readProjectFile('schemas/partyUsersSchema.js')

  assert.doesNotMatch(
    source,
    /consentPrivacyPolicyAccepted|consentPersonalDataAccepted|privacyPolicyAcceptedAt|personalDataProcessingAcceptedAt|termsAcceptedAt/
  )
})

test('registration UI renders and submits three separate consents', async () => {
  const source = await readProjectFile('app/party/login/PartyLoginClient.js')

  assert.match(source, /consentTerms:\s*termsAccepted/)
  assert.match(source, /consentPrivacyPolicy:\s*privacyAccepted/)
  assert.match(source, /consentPersonalData:\s*personalDataAccepted/)
  assert.match(source, /href="\/terms"/)
  assert.match(source, /href="\/privacy"/)
  assert.match(source, /href="\/personal-data-consent"/)
})
