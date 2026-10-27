import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import { canPartyAccess } from '../helpers/partyRolePermissions.js'

const source = await readFile(
  new URL('./partyBriefTemplates.js', import.meta.url),
  'utf8'
)
const helper = await readFile(
  new URL('../helpers/partyBriefTemplates.js', import.meta.url),
  'utf8'
)
const helperUrl = `data:text/javascript;base64,${Buffer.from(helper).toString('base64')}`
let sequence = 0
const tenantId = '507f1f77bcf86cd799439011'
const field = (id, label) => ({
  id,
  label,
  type: 'text',
  options: [],
  legacyKey: null,
  required: true,
})
const previous = {
  title: 'Бриф',
  revision: 1,
  fields: [field('keep', 'Оставляем'), field('old', 'Убираем')],
  retiredFields: [],
}
const load = async (model = {}) => {
  const key = `__partyBriefTest${sequence++}`
  globalThis[key] = model
  model.canAccess = canPartyAccess
  let resolved = source.replace(
    "'@helpers/partyBriefTemplates'",
    JSON.stringify(helperUrl)
  )
  resolved = resolved.replace(
    /^import \{ NextResponse \} from 'next\/server'$/m,
    'const NextResponse = { json: (data) => data }'
  )
  resolved = resolved.replace(
    /^import \{ PRODUCTS \} from '\.\/productContext'$/m,
    'const PRODUCTS = { PARTYCRM: "partycrm" }'
  )
  resolved = resolved.replace(
    /^import \{ getProductModel \} from '\.\/productDbConnect'$/m,
    `const getProductModel = async () => globalThis[${JSON.stringify(key)}]`
  )
  resolved = resolved.replace(
    /^import partyBriefTemplatesSchema from '@schemas\/partyBriefTemplatesSchema'$/m,
    'const partyBriefTemplatesSchema = {}'
  )
  resolved = resolved.replace(
    /^import \{ canPartyAccess \} from '@helpers\/partyRolePermissions'$/m,
    `const canPartyAccess = (...args) => globalThis[${JSON.stringify(key)}].canAccess(...args)`
  )
  resolved = resolved.replace(
    /^import \{ getPartyRequestContext, isValidObjectId, partyError \} from '\.\/partyApi'$/m,
    `const getPartyRequestContext = async () => ({context: globalThis[${JSON.stringify(key)}].requestContext}); const isValidObjectId = (value) => /^[a-f\\d]{24}$/i.test(String(value)); const partyError = (status, code, message) => ({ status, code, message })`
  )
  resolved = resolved.replace(
    /^import \{ getPartyOrderModel, getPartyServiceModel \} from '\.\/partyModels'$/m,
    `const getPartyOrderModel = async () => globalThis[${JSON.stringify(key)}]; const getPartyServiceModel = async () => globalThis[${JSON.stringify(key)}].services`
  )
  return import(
    `data:text/javascript;base64,${Buffer.from(resolved).toString('base64')}`
  )
}

test('removing a question requires an explicit decision and preserves its definition in the archive', async () => {
  const { planPartyBriefTemplateUpdate } = await load()
  const body = { title: 'Бриф', fields: [field('keep', 'Оставляем')] }
  assert.throws(
    () => planPartyBriefTemplateUpdate(previous, body),
    (error) => error.code === 'partycrm_brief_removal_decision_required'
  )
  const archived = planPartyBriefTemplateUpdate(previous, {
    ...body,
    removedFieldPolicy: { old: 'archive' },
  })
  assert.equal(archived.retiredFields[0].id, 'old')
  assert.equal(archived.retiredFields[0].label, 'Убираем')
  const kept = planPartyBriefTemplateUpdate(previous, {
    ...body,
    removedFieldPolicy: { old: 'keep' },
  })
  assert.equal(
    kept.fields.some(({ id }) => id === 'old'),
    true
  )
  assert.deepEqual(kept.retiredFields, [])
})

test('a question identifier cannot be reused for a different type of answer', async () => {
  const { planPartyBriefTemplateUpdate } = await load()
  assert.throws(
    () =>
      planPartyBriefTemplateUpdate(previous, {
        title: 'Бриф',
        fields: [
          field('keep', 'Оставляем'),
          { ...field('old', 'Убираем'), type: 'number' },
        ],
      }),
    (error) => error.code === 'partycrm_brief_field_type_changed'
  )
})

test('concurrent template publications cannot overwrite the same revision', async () => {
  const { publishPartyBriefTemplate } = await load({
    findOne: () => ({ sort: () => ({ lean: async () => previous }) }),
    create: async () => {
      throw Object.assign(new Error('duplicate revision'), { code: 11000 })
    },
  })
  await assert.rejects(
    publishPartyBriefTemplate({
      context: { tenantId, staff: {} },
      body: { ...previous, expectedRevision: 1 },
    }),
    (error) => error.code === 'partycrm_brief_revision_conflict'
  )
})

test('freezing a brief copies the full answer data and current form without mutating the open order', async () => {
  const { snapshotPartyBriefForClose } = await load({
    findOne: () => ({ sort: () => ({ lean: async () => previous }) }),
  })
  const order = {
    tenantId,
    status: 'active',
    eventBrief: {
      customAnswers: { keep: 'Ответ' },
      oldMedia: ['private:reference'],
    },
  }
  const snapshot = await snapshotPartyBriefForClose({ tenantId, order })
  assert.equal(snapshot.templateSnapshot.revision, 1)
  assert.deepEqual(snapshot.oldMedia, order.eventBrief.oldMedia)
  assert.deepEqual(snapshot.customAnswers, order.eventBrief.customAnswers)
  assert.equal(Object.hasOwn(order.eventBrief, 'templateSnapshot'), false)
})

test('configured transitions validate applicable questions while close freezes the complete form without adding a new gate', async () => {
  const serviceA = '507f1f77bcf86cd799439021',
    serviceB = '507f1f77bcf86cd799439022'
  const template = {
    title: 'По услугам',
    revision: 2,
    fields: [
      { ...field('a', 'Для A'), serviceIds: [serviceA] },
      { ...field('b', 'Для B'), serviceIds: [serviceB] },
      { ...field('optional', 'Не обязательно'), required: false },
    ],
    retiredFields: [],
  }
  const { snapshotPartyBriefForClose, validatePartyBriefForTransition } =
    await load({
      findOne: () => ({ sort: () => ({ lean: async () => template }) }),
    })
  const order = {
    tenantId,
    servicesIds: [serviceA],
    status: 'active',
    eventBrief: { customAnswers: { b: 'Сохранить скрытый ответ' } },
  }
  const validation = await validatePartyBriefForTransition({ tenantId, order })
  assert.equal(validation.ok, false)
  assert.deepEqual(
    validation.missingFields.map((entry) => entry.id),
    ['a']
  )
  const incompleteSnapshot = await snapshotPartyBriefForClose({
    tenantId,
    order,
  })
  assert.deepEqual(incompleteSnapshot.templateSnapshot.applicableFieldIds, [
    'a',
    'optional',
  ])
  order.eventBrief.customAnswers.a = 'Заполнено'
  assert.equal(
    (await validatePartyBriefForTransition({ tenantId, order })).ok,
    true
  )
  const snapshot = await snapshotPartyBriefForClose({ tenantId, order })
  assert.deepEqual(snapshot.templateSnapshot.applicableFieldIds, [
    'a',
    'optional',
  ])
  assert.equal(snapshot.templateSnapshot.applicabilityFrozen, true)
  assert.equal(snapshot.templateSnapshot.fields.length, 3)
  assert.equal(snapshot.customAnswers.b, 'Сохранить скрытый ответ')
})

test('stage API applies conditional brief requirements only to configured transitions and masks missing labels when brief is hidden', async () => {
  const serviceA = '507f1f77bcf86cd799439021'
  const serviceB = '507f1f77bcf86cd799439022'
  const { validatePartyBriefForTransition } = await load({
    findOne: () => ({
      sort: () => ({
        lean: async () => ({
          ...previous,
          fields: [
            { ...field('a', 'Для A'), serviceIds: [serviceA] },
            { ...field('b', 'Для B'), serviceIds: [serviceB] },
          ],
        }),
      }),
    }),
  })
  const code = (
    await readFile(
      new URL('../app/api/party/orders/[id]/stage/route.js', import.meta.url),
      'utf8'
    )
  )
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
    .replaceAll('export async function ', 'async function ')
    .replaceAll('export const ', 'const ')
  for (const hidden of [false, true]) {
    let requiresBrief = true,
      writes = 0
    const order = {
      _id: '507f1f77bcf86cd799439031',
      tenantId,
      status: 'active',
      servicesIds: [serviceA],
      updatedAt: '2026-10-27T10:00:00.000Z',
      eventBrief: {},
    }
    const deps = {
      NextResponse: { json: (body) => ({ status: 200, body }) },
      getPartyRequestContext: async () => ({
        context: { tenantId, company: {} },
      }),
      partyError: (status, code, message, _kind, meta) => ({
        status,
        body: { code, message, ...meta },
      }),
      isValidObjectId: () => true,
      getPartyOrderModel: async () => ({
        findOne: () => ({ lean: async () => order }),
        findOneAndUpdate: () => {
          writes += 1
          return { lean: async () => order }
        },
      }),
      canPartyAccess: (_context, { resource }) =>
        resource !== 'orders.eventBrief' || !hidden,
      filterPartyOrderForAccess: (_context, value) => value,
      getPartyWorkflow: () => ({}),
      findPartyWorkflowTransition: () => ({ requireBrief: requiresBrief }),
      getPartyOrderWriteGuard: () => ({}),
      validatePartyBriefForTransition,
      recordPartyOrderAudit: async () => {},
    }
    const patch = new Function(...Object.keys(deps), `${code}\nreturn PATCH`)(
      ...Object.values(deps)
    )
    const request = () =>
      patch(
        {
          json: async () => ({
            toStageId: 'next',
            expectedUpdatedAt: order.updatedAt,
          }),
        },
        { params: { id: order._id } }
      )
    const blocked = await request()
    assert.equal(blocked.status, 409)
    assert.equal(writes, 0)
    assert.deepEqual(
      blocked.body.missingFields?.map((entry) => entry.id),
      hidden ? undefined : ['a']
    )
    order.eventBrief = { customAnswers: { a: 'Ответ' } }
    assert.equal((await request()).status, 200)
    assert.equal(writes, 1)
    requiresBrief = false
    order.eventBrief = {}
    assert.equal((await request()).status, 200)
    assert.equal(writes, 2)
  }
})

test('template publication rejects foreign service references while retaining historical conditions', async () => {
  const service = '507f1f77bcf86cd799439021'
  let query
  const model = {
    findOne: () => ({ sort: () => ({ lean: async () => previous }) }),
    services: {
      find: (filter) => {
        query = filter
        return { select: () => ({ lean: async () => [] }) }
      },
    },
  }
  const { publishPartyBriefTemplate, planPartyBriefTemplateUpdate } =
    await load(model)
  const fields = [
    { ...field('keep', 'Оставляем'), serviceIds: [service], required: false },
    field('old', 'Убираем'),
  ]
  assert.equal(
    planPartyBriefTemplateUpdate(previous, { title: 'Бриф', fields }).fields[0]
      .required,
    false
  )
  await assert.rejects(
    publishPartyBriefTemplate({
      context: { tenantId, staff: {} },
      body: { title: 'Бриф', fields, expectedRevision: 1, preview: true },
    }),
    (error) => error.code === 'partycrm_invalid_brief_services'
  )
  assert.equal(query.tenantId, tenantId)
  assert.deepEqual(query._id.$in, [service])
  assert.throws(
    () =>
      planPartyBriefTemplateUpdate(previous, {
        title: 'Бриф',
        fields: [
          { ...field('keep', 'Общее'), serviceIds: 'all' },
          field('old', 'Другое'),
        ],
      }),
    (error) => error.code === 'partycrm_invalid_brief_services'
  )
})

test('scoped template read resolves applicable IDs but hides service conditions without the service grant', async () => {
  const service = '507f1f77bcf86cd799439021',
    orderId = '507f1f77bcf86cd799439023'
  const template = {
    title: 'Бриф',
    revision: 2,
    fields: [{ ...field('a', 'Условный'), serviceIds: [service] }],
    retiredFields: [{ ...field('old', 'Архивный'), serviceIds: [service] }],
  }
  const order = {
    _id: orderId,
    tenantId,
    status: 'active',
    servicesIds: [service],
  }
  const context = {
    tenantId,
    role: 'performer',
    staff: {
      _id: 'staff',
      tenantId,
      role: 'performer',
      status: 'active',
      positionId: 'position',
    },
    position: {
      _id: 'position',
      tenantId,
      active: true,
      permissions: { orders: 'read', 'orders.eventBrief': 'read' },
      orderScope: {},
    },
  }
  const { readPartyBriefTemplate } = await load({
    findOne: (filter) =>
      filter._id
        ? { lean: async () => order }
        : { sort: () => ({ lean: async () => template }) },
  })
  const safe = await readPartyBriefTemplate(
    { url: `https://example.test?orderId=${orderId}` },
    context
  )
  assert.deepEqual(safe.applicableFieldIds, ['a'])
  assert.equal(JSON.stringify(safe).includes(service), false)
  assert.equal(template.fields[0].serviceIds[0], service)
})

test('the brief template write boundary rejects hidden edit rights before entering its handler', async () => {
  const requestContext = {
    tenantId,
    role: 'admin',
    staff: { _id: 'staff', tenantId, role: 'admin', status: 'active' },
    position: {
      _id: 'position',
      tenantId,
      active: true,
      permissions: { 'brief.manage': 'hidden' },
    },
  }
  const { partyBriefTemplateRoute } = await load({ requestContext })
  let called = false
  const response = await partyBriefTemplateRoute(async () => {
    called = true
  }, true)({})
  assert.equal(response.status, 403)
  assert.equal(called, false)
})
