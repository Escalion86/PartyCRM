import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizePartyPreparationTemplate,
  buildPartyPreparationTemplatePreview,
  partyPreparationTemplateSourceKey,
} from './partyPreparationTemplates.js'

const staffId = 'a'.repeat(24),
  orderId = 'b'.repeat(24),
  templateId = 'c'.repeat(24)
const item = (patch = {}) => ({
  id: 'prepare',
  title: 'Подготовить реквизит',
  descriptionHtml: '',
  assigneeStaffIds: [staffId],
  assigneeRoleId: null,
  offsetMinutes: -1440,
  ...patch,
})
const template = (items = [item()]) => ({
  _id: templateId,
  title: 'Праздник',
  revision: 0,
  items,
})

test('template requires exactly one assignment mode and stable unique item ids', () => {
  assert.equal(
    normalizePartyPreparationTemplate(template()).items[0].id,
    'prepare'
  )
  for (const items of [
    [item({ assigneeStaffIds: [] })],
    [item({ assigneeRoleId: staffId })],
    [item(), item()],
    [item({ id: '$.unsafe' })],
  ]) {
    assert.throws(
      () => normalizePartyPreparationTemplate(template(items)),
      (error) => error.status === 400
    )
  }
  assert.equal(
    normalizePartyPreparationTemplate(
      template([item({ assigneeStaffIds: [], assigneeRoleId: staffId })])
    ).items[0].assigneeRoleId,
    staffId
  )
})

test('deadlines are exact minute offsets and never coerce an empty field to the start', () => {
  for (const value of ['', undefined, 0.5, Infinity, 527041, '60'])
    assert.throws(() =>
      normalizePartyPreparationTemplate(
        template([item({ offsetMinutes: value })])
      )
    )
  for (const value of [null, 0, -90, 527040])
    assert.equal(
      normalizePartyPreparationTemplate(
        template([item({ offsetMinutes: value })])
      ).items[0].offsetMinutes,
      value
    )
})

test('preview calculates fixed deadlines, identifies existing tasks and leaves inputs unchanged', () => {
  const source = template([
    item(),
    item({ id: 'call', offsetMinutes: -90 }),
    item({ id: 'later', offsetMinutes: 240 }),
    item({ id: 'no-date', offsetMinutes: null }),
  ])
  const order = {
    _id: orderId,
    eventDate: '2026-11-01T05:00:00Z',
    dateEnd: '2026-11-01T06:00:00Z',
  }
  const before = structuredClone({ source, order })
  const key = partyPreparationTemplateSourceKey(orderId, templateId, 'prepare')
  const preview = buildPartyPreparationTemplatePreview({
    template: source,
    order,
    existingSourceKeys: [key],
    now: '2026-10-31T12:00:00Z',
  })
  assert.equal(preview[0].dueAt, '2026-10-31T05:00:00.000Z')
  assert.equal(preview[0].alreadyCreated, true)
  assert.equal(preview[0].overdue, true)
  assert.equal(preview[1].dueAt, '2026-11-01T03:30:00.000Z')
  assert.equal(preview[2].afterEvent, true)
  assert.equal(preview[3].dueAt, null)
  assert.deepEqual({ source, order }, before)
})

test('undated order accepts only tasks with no relative deadline', () => {
  assert.throws(
    () =>
      buildPartyPreparationTemplatePreview({
        template: template(),
        order: { _id: orderId },
      }),
    /Укажите дату/
  )
  assert.equal(
    buildPartyPreparationTemplatePreview({
      template: template([item({ offsetMinutes: null })]),
      order: { _id: orderId },
    })[0].dueAt,
    null
  )
})
