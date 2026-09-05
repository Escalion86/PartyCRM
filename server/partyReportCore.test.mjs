import test from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeReportHtml, reportMediaIds, reportHasContent, canReadReportField, updateReportAnswers, reportStatusFromAnswers, serializeReportLibraryItems } from './partyReportCore.js'
import { isPartyReportFieldApplicable, starterPartyReportTemplates } from '../helpers/partyReportTemplates.js'

const author = { role: 'performer', staff: { _id: 'author' } }
const reviewer = { role: 'performer', staff: { _id: 'reviewer' } }
const manager = { role: 'admin', staff: { _id: 'manager' } }
const field = { id: 'creative', label: 'Программа', section: 'creative', required: true, reviewerStaffId: 'reviewer', shareCreative: false }
const fixture = (status = 'draft') => ({
  staffId: 'author', stage: 'after',
  templateSnapshot: { fields: [field] },
  answers: [{ fieldId: 'creative', html: '<p>Программа</p>', status }],
})

test('HTML removes scripts, handlers, tracking photos and javascript links', () => {
  const clean = sanitizeReportHtml('<p onclick="alert(1)">Добро<strong>!</strong></p><script>alert(1)</script><img src="https://tracker.example/a"><img src="data:image/png;base64,x"><a href="javascript:alert(1)">link</a>')
  assert.equal(clean.includes('onclick'), false)
  assert.equal(clean.includes('<script'), false)
  assert.equal(clean.includes('<img'), false)
  assert.equal(clean.includes('javascript'), false)
  assert.ok(clean.includes('<strong>!</strong>'))
})

test('images accept only a local exact protected media URL', () => {
  const id = 'a'.repeat(24)
  const clean = sanitizeReportHtml(`<img src="/api/party/report-media/${id}"><img src="/api/party/report-media/${id}?track=1"><img src="//other.example/photo">`)
  assert.deepEqual(reportMediaIds(clean), [id])
  assert.equal(reportHasContent(clean), true)
  assert.equal(reportHasContent('<p><br></p>'), false)
  assert.equal(reportHasContent('<p>&nbsp; </p>'), false)
})

test('a reviewer sees only assigned field; team sharing excludes finance and unaccepted answers', () => {
  const report = fixture('submitted')
  assert.equal(canReadReportField(reviewer, report, field, false), true)
  assert.equal(canReadReportField(reviewer, report, { ...field, reviewerStaffId: 'elsewhere', section: 'finance' }, true), false)
  const colleague = { role: 'performer', staff: { _id: 'other' } }
  const shared = { ...field, shareCreative: true }
  assert.equal(canReadReportField(colleague, report, shared, true), false)
  report.answers[0].status = 'accepted'
  assert.equal(canReadReportField(colleague, report, shared, true), true)
  assert.equal(canReadReportField(colleague, report, { ...shared, section: 'finance' }, true), false)
  assert.equal(canReadReportField(colleague, report, shared, false), true)
  assert.equal(canReadReportField(author, report, field, false), false)
})

test('before may submit ahead of event, after rejects future, missing or invalid date', () => {
  const report = fixture()
  const args = { report, context: author, action: 'submit', now: new Date('2026-01-01'), eventDate: '2026-02-01' }
  assert.throws(() => updateReportAnswers(args), /после начала/)
  assert.throws(() => updateReportAnswers({ ...args, eventDate: null }), /после начала/)
  assert.throws(() => updateReportAnswers({ ...args, eventDate: 'invalid' }), /после начала/)
  assert.equal(updateReportAnswers({ ...args, report: { ...report, stage: 'before' } })[0].status, 'submitted')
})

test('required fields allow partial drafts but prevent empty submission', () => {
  const args = { report: fixture(), context: author, answers: { creative: '<p></p>' }, eventDate: '2020-01-01' }
  assert.equal(updateReportAnswers({ ...args, action: 'save' })[0].html, '<p></p>')
  assert.throws(() => updateReportAnswers({ ...args, action: 'submit' }), /Заполните/)
})

test('submitted and accepted content is frozen until an authorized reviewer requests revision', () => {
  for (const status of ['submitted', 'accepted']) {
    const report = fixture(status)
    assert.throws(() => updateReportAnswers({ report, context: author, action: 'save', answers: { creative: '<p>Изменено</p>' } }), /доработку/)
    assert.throws(() => updateReportAnswers({ report, context: author, action: 'review', fieldId: field.id, decision: 'revision_requested', comment: 'Правки' }), /Нет доступа/)
    const revised = updateReportAnswers({ report, context: reviewer, action: 'review', fieldId: field.id, decision: 'revision_requested', comment: 'Добавьте фото' })
    assert.equal(revised[0].status, 'revision_requested')
    const saved = updateReportAnswers({ report: { ...report, answers: revised }, context: author, action: 'save', answers: { creative: '<p>Исправлено</p>' } })
    assert.equal(saved[0].html, '<p>Исправлено</p>')
  }
})

test('management can review but cannot overwrite performer answers; unknown fields fail', () => {
  assert.throws(() => updateReportAnswers({ report: fixture(), context: manager, action: 'save' }), /только автор/)
  assert.throws(() => updateReportAnswers({ report: fixture(), context: author, action: 'save', answers: { foreign: 'x' } }), /Поле не найдено/)
  assert.equal(updateReportAnswers({ report: fixture('submitted'), context: manager, action: 'review', fieldId: field.id, decision: 'accepted' })[0].status, 'accepted')
})

test('resubmitting returned fields preserves accepted siblings', () => {
  const report = fixture('accepted')
  report.templateSnapshot.fields.push({ ...field, id: 'second', required: false })
  report.answers.push({ fieldId: 'second', html: '', status: 'revision_requested' })
  const answers = updateReportAnswers({ report, context: author, action: 'submit', eventDate: '2020-01-01' })
  assert.equal(answers[0].status, 'accepted')
  assert.equal(answers[1].status, 'submitted')
  assert.equal(reportStatusFromAnswers(answers), 'submitted')
})

test('legacy field bindings stay descriptive until applicability is explicitly enabled', () => {
  assert.equal(isPartyReportFieldApplicable({ serviceId: 'other' }, { serviceIds: ['chosen'] }), true)
  assert.equal(isPartyReportFieldApplicable({ applyWhenBound: false, resourceId: 'missing' }), true)
  assert.equal(isPartyReportFieldApplicable({ applyWhenBound: true }), false)
})

test('applicability requires all selected bindings and real kit resource for the same service', () => {
  const bound = { applyWhenBound: true, serviceId: 'show', resourceId: 'suit', locationId: 'venue' }
  const context = { serviceIds: ['show', 'other'], locationId: 'venue', reservationRows: [{ serviceId: 'show', resourceId: 'suit', quantity: 1 }] }
  assert.equal(isPartyReportFieldApplicable(bound, context), true)
  assert.equal(isPartyReportFieldApplicable(bound, { ...context, serviceIds: ['other'] }), false)
  assert.equal(isPartyReportFieldApplicable(bound, { ...context, locationId: 'elsewhere' }), false)
  assert.equal(isPartyReportFieldApplicable(bound, { ...context, reservationRows: [] }), false)
  assert.equal(isPartyReportFieldApplicable(bound, { ...context, reservationRows: [{ serviceId: 'other', resourceId: 'suit', quantity: 1 }] }), false)
  assert.equal(isPartyReportFieldApplicable(bound, { ...context, reservationRows: [{ serviceId: 'show', resourceId: 'suit', quantity: 0 }] }), false)
})

test('requiredMedia demands an actual protected photo even when text is optional', () => {
  const report = fixture()
  report.templateSnapshot.fields[0] = { ...field, required: false, requiredMedia: true }
  const args = { report, context: author, action: 'submit', eventDate: '2020-01-01' }
  assert.throws(() => updateReportAnswers(args), /Добавьте фотографию/)
  assert.throws(() => updateReportAnswers({ ...args, answers: { creative: '<img src="https://example.org/photo.png">' } }), /Добавьте фотографию/)
  assert.equal(updateReportAnswers({ ...args, answers: { creative: `<img src="/api/party/report-media/${'a'.repeat(24)}">` } })[0].status, 'submitted')
})

test('not applicable is opt-in and its reason is mandatory on submit, not partial draft save', () => {
  const report = fixture()
  const args = { report, context: author, eventDate: '2020-01-01', answers: { creative: { html: '', notApplicable: true, notApplicableReason: '' } } }
  assert.throws(() => updateReportAnswers({ ...args, action: 'save' }), /нельзя выбрать/)
  report.templateSnapshot.fields[0] = { ...field, requiredMedia: true, allowNotApplicable: true }
  assert.equal(updateReportAnswers({ ...args, action: 'save' })[0].notApplicable, true)
  assert.throws(() => updateReportAnswers({ ...args, action: 'submit' }), /Укажите причину/)
  const submitted = updateReportAnswers({ ...args, action: 'submit', answers: { creative: { html: '', notApplicable: true, notApplicableReason: '  Реквизит верну завтра в 12:00  ' } } })
  assert.equal(submitted[0].notApplicableReason, 'Реквизит верну завтра в 12:00')
  assert.equal(submitted[0].status, 'submitted')
})

test('reviewed not-applicable flags and reasons are immutable; legacy strings preserve metadata', () => {
  const report = fixture('accepted')
  report.templateSnapshot.fields[0] = { ...field, allowNotApplicable: true }
  Object.assign(report.answers[0], { notApplicable: true, notApplicableReason: 'Нет реквизита', html: '' })
  assert.throws(() => updateReportAnswers({ report, context: author, action: 'save', answers: { creative: { html: '', notApplicable: false } } }), /доработку/)
  assert.throws(() => updateReportAnswers({ report, context: author, action: 'save', answers: { creative: { html: '', notApplicable: true, notApplicableReason: 'Другая причина' } } }), /доработку/)
  assert.equal(updateReportAnswers({ report, context: author, action: 'save', answers: { creative: '' } })[0].notApplicableReason, 'Нет реквизита')
})

test('starter kit pickup and return questions require media', () => {
  assert.equal(starterPartyReportTemplates.find(item => item.stage === 'before').fields.find(item => item.id === 'taken').requiredMedia, true)
  const returned = starterPartyReportTemplates.find(item => item.stage === 'after').fields.find(item => item.id === 'returned')
  assert.equal(returned.requiredMedia, true)
  assert.equal(returned.allowNotApplicable, true)
})

test('creative library publishes only accepted shared creative answers using an explicit allowlist', () => {
  const report = {
    _id: 'report', staffId: 'secret-staff-id', tenantId: 'tenant', history: [{ html: 'old secret' }],
    templateSnapshot: { fields: [
      { id: 'public', label: 'Опыт', section: 'creative', shareCreative: true, reviewerStaffId: 'secret-reviewer', resourceId: 'secret-resource' },
      { id: 'finance', label: 'Зарплата', section: 'finance', shareCreative: true },
      { id: 'private', label: 'Закрытое', section: 'creative', shareCreative: false },
      { id: 'pending', label: 'Не принято', section: 'creative', shareCreative: true },
    ] },
    answers: [
      { fieldId: 'public', html: '<p>Удачный сценарий</p>', status: 'accepted', reviewComment: 'secret review' },
      { fieldId: 'finance', html: 'secret salary', status: 'accepted' },
      { fieldId: 'private', html: 'secret private', status: 'accepted' },
      { fieldId: 'pending', html: 'secret pending', status: 'submitted' },
    ],
  }
  const items = serializeReportLibraryItems(report, { orderTitle: 'Праздник', staffName: 'Анна' })
  assert.equal(items.length, 1)
  assert.equal(items[0].label, 'Опыт')
  assert.deepEqual(Object.keys(items[0]).sort(), ['id', 'label', 'html', 'notApplicable', 'notApplicableReason', 'orderTitle', 'eventDate', 'staffName'].sort())
  assert.equal(JSON.stringify(items).includes('secret'), false)
  report.answers[0].status = 'revision_requested'
  assert.deepEqual(serializeReportLibraryItems(report), [])
})

test('shared creative media access extends to company performers but never scoped owners', () => {
  const report = fixture('accepted')
  const shared = { ...field, shareCreative: true }
  assert.equal(canReadReportField({ role: 'performer', staff: { _id: 'colleague' } }, report, shared, false), true)
  assert.equal(canReadReportField({ role: 'location_owner', staff: { _id: 'reviewer' } }, report, shared, true), false)
  assert.equal(canReadReportField({ role: 'performer', staff: { _id: 'colleague' } }, report, { ...shared, shareCreative: false }, false), false)
})
