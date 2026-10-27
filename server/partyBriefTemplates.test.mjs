import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'

const source = await readFile(new URL('./partyBriefTemplates.js', import.meta.url), 'utf8')
const helper = await readFile(new URL('../helpers/partyBriefTemplates.js', import.meta.url), 'utf8')
const helperUrl = `data:text/javascript;base64,${Buffer.from(helper).toString('base64')}`
let sequence = 0
const tenantId = '507f1f77bcf86cd799439011'
const field = (id, label) => ({ id, label, type: 'text', options: [], legacyKey: null, required: true })
const previous = { title: 'Бриф', revision: 1, fields: [field('keep', 'Оставляем'), field('old', 'Убираем')], retiredFields: [] }
const load = async (model = {}) => {
  const key = `__partyBriefTest${sequence++}`
  globalThis[key] = model
  model.canAccess = canPartyAccess
  let resolved = source.replace("'@helpers/partyBriefTemplates'", JSON.stringify(helperUrl))
  resolved = resolved.replace(/^import \{ NextResponse \} from 'next\/server'$/m, 'const NextResponse = { json: (data) => data }')
  resolved = resolved.replace(/^import \{ PRODUCTS \} from '\.\/productContext'$/m, 'const PRODUCTS = { PARTYCRM: "partycrm" }')
  resolved = resolved.replace(/^import \{ getProductModel \} from '\.\/productDbConnect'$/m, `const getProductModel = async () => globalThis[${JSON.stringify(key)}]`)
  resolved = resolved.replace(/^import partyBriefTemplatesSchema from '@schemas\/partyBriefTemplatesSchema'$/m, 'const partyBriefTemplatesSchema = {}')
  resolved = resolved.replace(/^import \{ canPartyAccess \} from '@helpers\/partyRolePermissions'$/m, `const canPartyAccess = (...args) => globalThis[${JSON.stringify(key)}].canAccess(...args)`)
  resolved = resolved.replace(/^import \{ getPartyRequestContext, isValidObjectId, partyError \} from '\.\/partyApi'$/m, `const getPartyRequestContext = async () => ({context: globalThis[${JSON.stringify(key)}].requestContext}); const isValidObjectId = (value) => /^[a-f\\d]{24}$/i.test(String(value)); const partyError = (status, code, message) => ({ status, code, message })`)
  resolved = resolved.replace(/^import \{ getPartyOrderModel \} from '\.\/partyModels'$/m, `const getPartyOrderModel = async () => globalThis[${JSON.stringify(key)}]`)
  return import(`data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`)
}

test('removing a question requires an explicit decision and preserves its definition in the archive', async () => {
  const { planPartyBriefTemplateUpdate } = await load()
  const body = { title: 'Бриф', fields: [field('keep', 'Оставляем')] }
  assert.throws(() => planPartyBriefTemplateUpdate(previous, body), (error) => error.code === 'partycrm_brief_removal_decision_required')
  const archived = planPartyBriefTemplateUpdate(previous, { ...body, removedFieldPolicy: { old: 'archive' } })
  assert.equal(archived.retiredFields[0].id, 'old')
  assert.equal(archived.retiredFields[0].label, 'Убираем')
  const kept = planPartyBriefTemplateUpdate(previous, { ...body, removedFieldPolicy: { old: 'keep' } })
  assert.equal(kept.fields.some(({ id }) => id === 'old'), true)
  assert.deepEqual(kept.retiredFields, [])
})

test('a question identifier cannot be reused for a different type of answer', async () => {
  const { planPartyBriefTemplateUpdate } = await load()
  assert.throws(() => planPartyBriefTemplateUpdate(previous, { title: 'Бриф', fields: [field('keep', 'Оставляем'), { ...field('old', 'Убираем'), type: 'number' }] }), (error) => error.code === 'partycrm_brief_field_type_changed')
})

test('concurrent template publications cannot overwrite the same revision', async () => {
  const { publishPartyBriefTemplate } = await load({ findOne: () => ({ sort: () => ({ lean: async () => previous }) }), create: async () => { throw Object.assign(new Error('duplicate revision'), { code: 11000 }) } })
  await assert.rejects(publishPartyBriefTemplate({ context: { tenantId, staff: {} }, body: { ...previous, expectedRevision: 1 } }), (error) => error.code === 'partycrm_brief_revision_conflict')
})

test('freezing a brief copies the full answer data and current form without mutating the open order', async () => {
  const { snapshotPartyBriefForClose } = await load({ findOne: () => ({ sort: () => ({ lean: async () => previous }) }) })
  const order = { tenantId, status: 'active', eventBrief: { customAnswers: { keep: 'Ответ' }, oldMedia: ['private:reference'] } }
  const snapshot = await snapshotPartyBriefForClose({ tenantId, order })
  assert.equal(snapshot.templateSnapshot.revision, 1)
  assert.deepEqual(snapshot.oldMedia, order.eventBrief.oldMedia)
  assert.deepEqual(snapshot.customAnswers, order.eventBrief.customAnswers)
  assert.equal(Object.hasOwn(order.eventBrief, 'templateSnapshot'), false)
})

test('the brief template write boundary rejects hidden edit rights before entering its handler', async () => {
  const requestContext = { tenantId, role: 'admin', staff: { _id: 'staff', tenantId, role: 'admin', status: 'active' }, position: { _id: 'position', tenantId, active: true, permissions: { 'brief.manage': 'hidden' } } }
  const { partyBriefTemplateRoute } = await load({ requestContext })
  let called = false
  const response = await partyBriefTemplateRoute(async () => { called = true }, true)({})
  assert.equal(response.status, 403)
  assert.equal(called, false)
})
