import { createHash } from 'node:crypto'
import { getPartyApplicableBriefFields } from '../helpers/partyBriefTemplates.js'
import { partyDateAtTime } from '../helpers/partyWorkingSchedule.js'

const legacyLimits = {
  occasion: 180,
  celebrantName: 160,
  guestAgeRange: 180,
  interests: 2000,
  previousPrograms: 2000,
  characters: 2000,
  costumeOptions: 2000,
  eventFormat: 1000,
  venueConditions: 2000,
  cakeAndGifts: 2000,
  wishes: 4000,
  restrictions: 4000,
}

export const parsePartyClientBriefToken = (value) => {
  const match = /^([a-f\d]{24})\.([a-f\d]{24})\.([a-f\d]{64})$/.exec(value)
  return match ? { tenantId: match[1], _id: match[2], 'clientBriefLink.secret': match[3] } : null
}

export const getPartyClientBriefFields = (template) =>
  getPartyApplicableBriefFields(template)
    .filter(({ id, type }) => !['note', 'contact'].includes(type) && !['constructor', 'prototype'].includes(id))
    .map(({ id, label, type, options, legacyKey, required }) => ({
      id,
      label,
      type,
      options: type === 'select' ? options || [] : [],
      required: required !== false,
      legacyKey,
      ...(['text', 'textarea'].includes(type) ? { maxLength: legacyLimits[legacyKey] || 4000 } : {}),
      ...(legacyKey === 'celebrantAge' ? { min: 0, max: 120 } : {}),
      ...(legacyKey === 'guestCount' ? { min: 0, max: 10000 } : {}),
    }))

export const getPartyClientBriefFormVersion = (fields, orderTypeId, timeZone) =>
  createHash('sha256').update(JSON.stringify([fields, orderTypeId || null, timeZone])).digest('hex')

const validDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const validTime = (value) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)

const parseAnswer = (field, answer, timeZone) => {
  if (field.type === 'checkbox') {
    if (answer === 'true' || answer === 'false') return answer === 'true'
  } else if (field.type === 'number' || field.type === 'money') {
    const number = Number(answer)
    if (Number.isFinite(number) && Math.abs(number) <= Number.MAX_SAFE_INTEGER &&
      (field.type !== 'money' || number >= 0) &&
      (field.min === undefined || (Number.isInteger(number) && number >= field.min && number <= field.max)))
      return field.type === 'money' ? Math.round(number * 100) / 100 : number
  } else if (field.type === 'select') {
    if (field.options.includes(answer)) return answer
  } else if (field.type === 'date') {
    if (validDate(answer)) return answer
  } else if (field.type === 'time') {
    if (validTime(answer)) return answer
  } else if (field.type === 'datetime') {
    const [date, time, extra] = answer.split('T')
    if (extra === undefined && validDate(date) && validTime(time)) {
      try { return partyDateAtTime(date, time, timeZone).toISOString() } catch { return undefined }
    }
  } else if (field.maxLength && answer.length <= field.maxLength) return answer
  return undefined
}

export const parsePartyClientBriefAnswers = (fields, answers, timeZone) => {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
    return { error: { message: 'Проверьте ответы и отправьте форму ещё раз.' } }
  }
  const customAnswers = {}
  const legacyAnswers = {}
  for (const field of fields) {
    const value = Object.hasOwn(answers, field.id) ? answers[field.id] : ''
    const fieldError = (message) => ({ error: { fieldId: field.id, message } })
    if (typeof value !== 'string') return fieldError(`Проверьте ответ на вопрос «${field.label}».`)
    const text = value.trim()
    if (!text && !field.required) continue
    if (!text) return fieldError(`Ответьте на вопрос «${field.label}».`)
    const parsed = parseAnswer(field, text, timeZone)
    if (parsed === undefined) return fieldError(`Проверьте ответ на вопрос «${field.label}».`)
    customAnswers[field.id] = parsed
    const legacyType = ['celebrantAge', 'guestCount'].includes(field.legacyKey) ? 'number' : 'string'
    if (field.legacyKey && typeof parsed === legacyType) legacyAnswers[field.legacyKey] = parsed
  }
  if (!Object.keys(customAnswers).length) return { error: { message: 'Заполните хотя бы один ответ.' } }
  return { customAnswers, legacyAnswers }
}
