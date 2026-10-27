import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

const source = (path) => readFile(join(process.cwd(), path), 'utf8')

test('configured reports keep a versioned snapshot and per-question answers', async () => {
  const schema = await source('schemas/partyReportsSchema.js')
  assert.match(schema, /templateSnapshot:.*templateSnapshotSchema/)
  assert.match(schema, /answers:.*answerSchema/)
  assert.match(schema, /revision_requested/)
  assert.match(schema, /reviewedByStaffId/)
})

test('old performer submission endpoint points to the retired read-only handler', async () => {
  const route = await source(
    'app/api/party/performer/orders/[id]/report/route.js'
  )
  assert.match(route, /retirePartyLegacyReport as PATCH/)
  assert.doesNotMatch(route, /assignedStaff\.\$\.report|findOneAndUpdate/)
})

test('old company review endpoint cannot keep a second report system alive', async () => {
  const route = await source(
    'app/api/party/orders/[id]/reports/[staffId]/route.js'
  )
  const helper = await source('server/partyLegacyReportRetirement.js')
  assert.match(route, /retirePartyLegacyReport as PATCH/)
  assert.match(helper, /getPartyRequestContext/)
  assert.match(helper, /tenantId:\s*context\.tenantId/)
  assert.match(helper, /410/)
  assert.doesNotMatch(helper, /\$set|recordPartyOrderAudit/)
})

test('performer has one entry into the configured report form', async () => {
  const performer = await source('app/performer/PerformerWorkspaceClient.js')
  assert.match(performer, /<PartyOrderReports/)
  assert.match(performer, /Отчёт/)
  assert.doesNotMatch(
    performer,
    /savePerformerReport|reportDrafts|PerformerReportEditor|PerformerReportModal/
  )
})
