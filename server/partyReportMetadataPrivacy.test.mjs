import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import * as core from './partyReportCore.js'
import * as policy from '../helpers/partyReportPolicy.js'

const strip = (source) =>
  source
    .replace(/^import[\s\S]*?from ['"][^'"]+['"]\r?\n/gm, '')
    .replaceAll('export const ', 'const ')
    .replace(/^export \{[^}]*\}\s*$/gm, '')
const sources = await Promise.all(
  [
    '../app/api/party/reports/route.js',
    '../app/api/party/report-library/route.js',
    '../app/api/party/report-templates/preview/route.js',
    './partyReportAccess.js',
  ].map(async (name) =>
    strip(await readFile(new URL(name, import.meta.url), 'utf8'))
  )
)
const visibleReport = new Function(
  ...Object.keys(core),
  `${sources[3]}\nreturn visibleReport`
)(...Object.values(core))
const tenantId = 'a'.repeat(24),
  staffId = 'b'.repeat(24),
  authorId = 'c'.repeat(24),
  orderId = 'd'.repeat(24),
  positionId = 'e'.repeat(24)
const setup = ({ scope = {}, grants = {} } = {}) => {
  const context = {
    tenantId,
    role: 'performer',
    staff: {
      _id: staffId,
      tenantId,
      role: 'performer',
      status: 'active',
      positionId,
    },
    position: {
      _id: positionId,
      active: true,
      tenantId,
      orderScope: scope,
      permissions: {
        reports: 'read',
        'reports.general': 'read',
        'reports.creative': 'read',
        'reports.review': 'edit',
        ...grants,
      },
    },
  }
  const author = {
    tenantId,
    role: 'performer',
    staff: { _id: authorId, tenantId, role: 'performer', status: 'active' },
    position: {
      permissions: {
        reports: 'read',
        'reports.general': 'edit',
        'reports.creative': 'edit',
      },
    },
  }
  const order = {
    _id: orderId,
    tenantId,
    title: 'Скрытое название клиента',
    serviceTitle: 'Секретная услуга',
    eventDate: '2026-10-26T10:00:00Z',
    status: 'active',
    workflowStageId: 'secret-stage',
    locationId: 'secret-venue',
    assignedStaff: [{ staffId: authorId }],
  }
  const report = {
    _id: 'f'.repeat(24),
    tenantId,
    staffId: authorId,
    orderId,
    stage: 'after',
    templateSnapshot: {
      fields: [
        { id: 'general', section: 'general', reviewerPositionId: positionId },
        {
          id: 'creative',
          section: 'creative',
          shareCreative: true,
          label: 'Результат',
        },
      ],
    },
    answers: [
      { fieldId: 'general', status: 'submitted' },
      {
        fieldId: 'creative',
        status: 'accepted',
        html: '<p>Доступная творческая часть</p>',
      },
    ],
  }
  const q = (rows) => {
    let selection = null
    return {
      sort() {
        return this
      },
      limit() {
        return this
      },
      select(fields) {
        selection = fields.split(' ').map((field) => field.split('.')[0])
        return this
      },
      lean: async () =>
        rows.map((row) =>
          selection
            ? Object.fromEntries(
                ['_id', ...selection]
                  .filter((field) => field in row)
                  .map((field) => [field, row[field]])
              )
            : row
        ),
    }
  }
  const deps = {
    ...core,
    ...policy,
    visibleReport,
    withReportContext: (handler) => (request) => handler(request, context),
    reportJson: (value) => value,
    reportId: (value) => value,
    isAssignedToReportOrder: core.isAssignedReportStaff,
    getPartyReportModel: async () => ({
      find: (filter) => {
        assert.equal(filter.tenantId, tenantId)
        return q([report])
      },
    }),
    getPartyOrderModel: async () => ({
      find: (filter) => {
        assert.equal(filter.tenantId, tenantId)
        return q([order])
      },
    }),
    getPartyStaffModel: async () => ({ find: () => q([]) }),
    loadPartyReportAuthorContexts: async () => new Map([[authorId, author]]),
    partyReportWithEffectiveStatus: (value, actor, row) => ({
      ...value,
      status: core.effectivePartyReportStatus(value, actor, row),
    }),
    loadReportOrder: async () => order,
    validateReportFields: async () => [{ id: 'general', section: 'general' }],
    reportTemplateApplicability: async (_tenant, _order, templates) =>
      templates,
  }
  const [queue, library, preview] = sources
    .slice(0, 3)
    .map((source, index) =>
      new Function(
        ...Object.keys(deps),
        `${source}\nreturn ${index === 2 ? 'POST' : 'GET'}`
      )(...Object.values(deps))
    )
  return {
    queue: () => queue({ url: 'http://test/reports' }),
    library: () => library({ url: 'http://test/report-library' }),
    preview: () =>
      preview({ json: async () => ({ orderId, stage: 'after', fields: [] }) }),
  }
}

test('report reviewer queue masks hidden order title, service and date with real field permissions', async () => {
  const result = await setup().queue()
  assert.equal(result.reports.length, 1)
  assert.equal(result.reports[0].orderTitle, 'Мероприятие')
  assert.equal(result.reports[0].orderDate, null)
  assert.doesNotMatch(
    JSON.stringify(result),
    /Скрытое название|Секретная услуга|2026-10-26/
  )
  const allowed = await setup({
    grants: { 'orders.serviceTitle': 'read', 'orders.eventDate': 'read' },
  }).queue()
  assert.equal(allowed.reports[0].orderTitle, 'Секретная услуга')
  assert.equal(allowed.reports[0].orderDate, '2026-10-26T10:00:00Z')
})

test('review queue loads full scope fields before deciding access to an order', async () => {
  for (const scope of [
    { stageIds: ['new'] },
    { locationIds: ['allowed-venue'], includeUnlocated: true },
    { assignedOnly: true },
  ]) {
    assert.deepEqual((await setup({ scope }).queue()).reports, [])
  }
})

test('creative library and template preview retain allowed content without hidden order metadata', async () => {
  const instance = setup()
  const library = await instance.library()
  assert.equal(library.items.length, 1)
  assert.match(library.items[0].html, /Доступная творческая часть/)
  assert.equal(library.items[0].orderTitle, 'Мероприятие')
  assert.equal(library.items[0].eventDate, null)
  const preview = await instance.preview()
  assert.equal(preview.order.title, 'Заказ')
  assert.equal(preview.order.eventDate, null)
  assert.doesNotMatch(
    JSON.stringify({ library, preview }),
    /Скрытое название|Секретная услуга|2026-10-26/
  )
})
