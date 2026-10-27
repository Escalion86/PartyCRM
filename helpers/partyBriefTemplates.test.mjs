import assert from 'node:assert/strict'
import test from 'node:test'
import { copyPartyBriefValues, getPartyArchivedBriefAnswers, getPartyBriefMissingFields, getPartyDefaultBriefTemplate, hasPartyBriefAnswer, resolvePartyBriefTemplate } from './partyBriefTemplates.js'
import { normalizePartyOrderEventBrief } from '../server/partyOrderBrief.js'

test('required answers distinguish missing values from valid zero and no', () => {
  for (const value of [0, false, 'Нет ограничений']) assert.equal(hasPartyBriefAnswer(value), true)
  for (const value of ['', '  ', null, undefined, []]) assert.equal(hasPartyBriefAnswer(value), false)
  const template = { fields: [{ id: 'number', label: 'Число' }, { id: 'choice', label: 'Подтверждение' }, { id: 'text', label: 'Пожелания' }] }
  assert.deepEqual(getPartyBriefMissingFields({ customAnswers: { number: 0, choice: false } }, template), [{ id: 'text', label: 'Пожелания' }])
})

test('the shorter form reads existing legacy answers and archives other filled details', () => {
  const template = getPartyDefaultBriefTemplate()
  assert.equal(template.fields.length, 6)
  const brief = { occasion: 'День рождения', venueConditions: 'Низкий потолок', customLegacyMedia: { files: ['existing-private-reference'] } }
  const archived = getPartyArchivedBriefAnswers(brief, template)
  assert.equal(archived.find(({ field }) => field.legacyKey === 'venueConditions').value, 'Низкий потолок')
  assert.deepEqual(archived.find(({ field }) => field.label === 'customLegacyMedia').value, brief.customLegacyMedia)
  assert.equal(getPartyBriefMissingFields(brief, template).some(({ id }) => id === 'legacy_occasion'), false)
})

test('new forms apply to open orders while a closed order always uses its frozen form', () => {
  const original = { title: 'Прежняя форма', revision: 4, fields: [{ id: 'old', label: 'Прежний вопрос' }] }
  const next = { title: 'Новая форма', revision: 5, fields: [{ id: 'next', label: 'Новый вопрос' }] }
  const brief = { templateSnapshot: original }
  assert.equal(resolvePartyBriefTemplate(brief, next, 'active'), next)
  assert.equal(resolvePartyBriefTemplate(brief, next, 'closed'), original)
  assert.equal(resolvePartyBriefTemplate({}, next, 'closed').fields.length, 14)
})

test('retired custom questions retain their labels, answer values and media references', () => {
  const value = { text: 'Ответ', files: ['already-stored-attachment'] }
  const archived = getPartyArchivedBriefAnswers({ customAnswers: { old: value } }, { fields: [], retiredFields: [{ id: 'old', label: 'Старый вопрос', type: 'textarea' }] })
  assert.deepEqual(archived, [{ field: { id: 'old', label: 'Старый вопрос', type: 'textarea' }, value }])
})

test('normalizing an order no longer discards custom, unknown or archived brief values', () => {
  const brief = { occasion: ' Праздник ', customAnswers: { answer: false, count: 0 }, oldExtra: { files: ['private:old'] }, archivedAnswers: [{ field: { id: 'retired', label: 'История' }, value: 'Старый ответ' }] }
  const normalized = normalizePartyOrderEventBrief(brief)
  assert.equal(normalized.occasion, 'Праздник')
  assert.deepEqual(normalized.customAnswers, brief.customAnswers)
  assert.deepEqual(normalized.oldExtra, brief.oldExtra)
  assert.deepEqual(normalized.archivedAnswers, brief.archivedAnswers)
  assert.deepEqual(copyPartyBriefValues(brief), brief)
})
