import assert from 'node:assert/strict'
import test from 'node:test'
import {
  copyPartyBriefValues,
  getPartyApplicableBriefFields,
  getPartyArchivedBriefAnswers,
  getPartyBriefMissingFields,
  getPartyDefaultBriefTemplate,
  hasPartyBriefAnswer,
  resolvePartyBriefTemplate,
} from './partyBriefTemplates.js'
import { normalizePartyOrderEventBrief } from '../server/partyOrderBrief.js'

test('required answers distinguish missing values from valid zero and no', () => {
  for (const value of [0, false, 'Нет ограничений'])
    assert.equal(hasPartyBriefAnswer(value), true)
  for (const value of ['', '  ', null, undefined, []])
    assert.equal(hasPartyBriefAnswer(value), false)
  const template = {
    fields: [
      { id: 'number', label: 'Число' },
      { id: 'choice', label: 'Подтверждение' },
      { id: 'text', label: 'Пожелания' },
    ],
  }
  assert.deepEqual(
    getPartyBriefMissingFields(
      { customAnswers: { number: 0, choice: false } },
      template
    ),
    [{ id: 'text', label: 'Пожелания' }]
  )
})

test('the shorter form reads existing legacy answers and archives other filled details', () => {
  const template = getPartyDefaultBriefTemplate()
  assert.equal(template.fields.length, 6)
  const brief = {
    occasion: 'День рождения',
    venueConditions: 'Низкий потолок',
    customLegacyMedia: { files: ['existing-private-reference'] },
  }
  const archived = getPartyArchivedBriefAnswers(brief, template)
  assert.equal(
    archived.find(({ field }) => field.legacyKey === 'venueConditions').value,
    'Низкий потолок'
  )
  assert.deepEqual(
    archived.find(({ field }) => field.label === 'customLegacyMedia').value,
    brief.customLegacyMedia
  )
  assert.equal(
    getPartyBriefMissingFields(brief, template).some(
      ({ id }) => id === 'legacy_occasion'
    ),
    false
  )
})

test('new forms apply to open orders while a closed order always uses its frozen form', () => {
  const original = {
    title: 'Прежняя форма',
    revision: 4,
    fields: [{ id: 'old', label: 'Прежний вопрос' }],
  }
  const next = {
    title: 'Новая форма',
    revision: 5,
    fields: [{ id: 'next', label: 'Новый вопрос' }],
  }
  const brief = { templateSnapshot: original }
  assert.equal(resolvePartyBriefTemplate(brief, next, 'active'), next)
  assert.equal(resolvePartyBriefTemplate(brief, next, 'closed'), original)
  assert.equal(resolvePartyBriefTemplate({}, next, 'closed').fields.length, 14)
})

test('retired custom questions retain their labels, answer values and media references', () => {
  const value = { text: 'Ответ', files: ['already-stored-attachment'] }
  const archived = getPartyArchivedBriefAnswers(
    { customAnswers: { old: value } },
    {
      fields: [],
      retiredFields: [{ id: 'old', label: 'Старый вопрос', type: 'textarea' }],
    }
  )
  assert.deepEqual(archived, [
    { field: { id: 'old', label: 'Старый вопрос', type: 'textarea' }, value },
  ])
})

test('normalizing an order no longer discards custom, unknown or archived brief values', () => {
  const brief = {
    occasion: ' Праздник ',
    customAnswers: { answer: false, count: 0 },
    oldExtra: { files: ['private:old'] },
    archivedAnswers: [
      { field: { id: 'retired', label: 'История' }, value: 'Старый ответ' },
    ],
  }
  const normalized = normalizePartyOrderEventBrief(brief)
  assert.equal(normalized.occasion, 'Праздник')
  assert.deepEqual(normalized.customAnswers, brief.customAnswers)
  assert.deepEqual(normalized.oldExtra, brief.oldExtra)
  assert.deepEqual(normalized.archivedAnswers, brief.archivedAnswers)
  assert.deepEqual(copyPartyBriefValues(brief), brief)
})

test('service conditions use any selected service and never require another service questions', () => {
  const template = {
    fields: [
      { id: 'general', label: 'Общее' },
      { id: 'birthday', label: 'Именинник', serviceIds: ['a', 'b'] },
      { id: 'museum', label: 'Музей', serviceIds: ['c'] },
      { id: 'optional', label: 'Необязательное', required: false },
    ],
  }
  assert.deepEqual(
    getPartyApplicableBriefFields(template, ['b']).map((field) => field.id),
    ['general', 'birthday', 'optional']
  )
  assert.deepEqual(
    getPartyBriefMissingFields(
      { customAnswers: { general: 'Ответ' } },
      template,
      ['c']
    ),
    [{ id: 'museum', label: 'Музей' }]
  )
  assert.deepEqual(
    getPartyBriefMissingFields(
      { customAnswers: { general: 'Ответ' } },
      template,
      []
    ),
    []
  )
})

test('switching service context preserves inactive answers and does not retire active questions', () => {
  const template = {
    fields: [
      { id: 'a', serviceIds: ['service-a'] },
      { id: 'b', serviceIds: ['service-b'] },
    ],
    retiredFields: [{ id: 'old', label: 'Прежний' }],
  }
  const brief = {
    customAnswers: {
      a: { text: 'Ответ', files: ['private:reference'] },
      old: 'История',
    },
  }
  const original = structuredClone(brief)
  assert.deepEqual(
    getPartyApplicableBriefFields(template, ['service-b']).map(
      (field) => field.id
    ),
    ['b']
  )
  assert.deepEqual(
    getPartyArchivedBriefAnswers(brief, template).map(
      (answer) => answer.field.id
    ),
    ['old']
  )
  assert.deepEqual(brief, original)
  assert.equal(
    getPartyBriefMissingFields(brief, template, ['service-a']).length,
    0
  )
})

test('resolved hidden-service context and frozen closed applicability cannot be reconstructed from a blank draft', () => {
  const template = {
    fields: [
      { id: 'a', serviceIds: ['service-a'] },
      { id: 'b', serviceIds: ['service-b'] },
    ],
    applicableFieldIds: ['a'],
  }
  assert.deepEqual(
    getPartyApplicableBriefFields(template).map((field) => field.id),
    ['a']
  )
  assert.deepEqual(
    getPartyApplicableBriefFields(template, ['service-b']).map(
      (field) => field.id
    ),
    ['b']
  )
  assert.deepEqual(
    getPartyApplicableBriefFields({ ...template, applicabilityFrozen: true }, [
      'service-b',
    ]).map((field) => field.id),
    ['a']
  )
})
