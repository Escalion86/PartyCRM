'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { getPartyArchivedBriefAnswers, getPartyBriefAnswer, getPartyDefaultBriefTemplate, hasPartyBriefAnswer, resolvePartyBriefTemplate } from '@helpers/partyBriefTemplates'

const control = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 disabled:bg-slate-50'
const display = (value) => typeof value === 'boolean' ? value ? 'Да' : 'Нет' : typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : String(value ?? '')

export const hasPartyEventBrief = (brief) => Boolean(brief && Object.entries(brief).some(([key, value]) => !['templateSnapshot', 'customAnswers', 'archivedAnswers'].includes(key) && hasPartyBriefAnswer(value)) || Object.values(brief?.customAnswers || {}).some(hasPartyBriefAnswer) || brief?.archivedAnswers?.some((answer) => hasPartyBriefAnswer(answer.value)))

const useBriefTemplate = ({ template, companyId, orderId, value, orderStatus }) => {
  const [remote, setRemote] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(Boolean(companyId && !template && orderStatus !== 'closed'))
  useEffect(() => {
    if (template || !companyId || orderStatus === 'closed') return
    let alive = true
    apiJson(`/api/party/brief-template${orderId ? `?orderId=${encodeURIComponent(orderId)}` : ''}`, { cache: 'no-store', headers: { 'x-partycrm-company-id': companyId } })
      .then((result) => { if (alive) { setRemote(result.data); setError('') } })
      .catch((failure) => { if (alive) setError(failure.message || 'Не удалось загрузить форму брифа') })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [template, companyId, orderId, orderStatus])
  return { template: resolvePartyBriefTemplate(value, template || remote || getPartyDefaultBriefTemplate(), orderStatus), error, loading }
}

function ArchivedAnswers({ value, template }) {
  const answers = getPartyArchivedBriefAnswers(value, template)
  if (!answers.length) return null
  return <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <summary className="min-h-10 cursor-pointer text-sm font-medium text-slate-600">Сохранённые ответы прежней формы · {answers.length}</summary>
    <p className="mb-3 text-xs text-slate-500">Вопросы убраны из текущей формы. Их ответы сохранены и доступны для просмотра.</p>
    <dl className="grid gap-3 sm:grid-cols-2">{answers.map(({ field, value }, index) => <div key={`${field.id}_${index}`} className="min-w-0"><dt className="text-xs font-semibold text-slate-500">{field.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-800">{display(value)}</dd></div>)}</dl>
  </details>
}

export function PartyEventBriefEditor({ value = {}, onChange, template: suppliedTemplate, companyId = '', orderId = '', orderStatus = 'draft', disabled = false }) {
  const { template, error, loading } = useBriefTemplate({ template: suppliedTemplate, companyId, orderId, value, orderStatus })
  const change = (field, next) => onChange?.({ ...value, ...(field.legacyKey ? { [field.legacyKey]: next } : {}), customAnswers: { ...(value.customAnswers || {}), [field.id]: next } })
  return <div className="space-y-4">
    <p className="text-sm text-slate-600">Ответьте на вопросы о мероприятии. Можно сохранить незаполненный заказ; все вопросы формы нужно заполнить перед переводом на следующий этап.</p>
    {loading && <p role="status" className="text-sm text-slate-500">Загрузка формы брифа…</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <fieldset disabled={disabled || loading || Boolean(error)} className="grid min-w-0 gap-4 rounded-xl border border-sky-100 bg-white p-3 sm:grid-cols-2 sm:p-4">
      <legend className="px-1 font-semibold text-slate-900">{template.title || 'Бриф заказа'}</legend>
      {(template.fields || []).map((field) => {
        const answer = getPartyBriefAnswer(value, field)
        return <label key={field.id} className={`min-w-0 text-sm font-medium text-slate-700 ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}>
          {field.label} <span aria-label="Обязательно при переходе" className="text-red-600">*</span>
          {field.type === 'textarea' ? <textarea className={control} rows={3} maxLength={20000} value={answer ?? ''} onChange={(event) => change(field, event.target.value)} />
            : field.type === 'select' ? <select className={`${control} cursor-pointer`} value={answer ?? ''} onChange={(event) => change(field, event.target.value)}><option value="">Выберите вариант</option>{hasPartyBriefAnswer(answer) && !field.options?.includes(String(answer)) && <option value={String(answer)}>{String(answer)} · прежний ответ</option>}{(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select>
              : field.type === 'checkbox' ? <select className={`${control} cursor-pointer`} value={typeof answer === 'boolean' ? String(answer) : ''} onChange={(event) => change(field, event.target.value === '' ? null : event.target.value === 'true')}><option value="">Выберите ответ</option><option value="true">Да</option><option value="false">Нет</option></select>
                : <input className={control} type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'} step={field.type === 'number' ? 'any' : undefined} maxLength={field.type === 'text' ? 20000 : undefined} value={answer ?? ''} onChange={(event) => change(field, field.type === 'number' && event.target.value !== '' ? Number(event.target.value) : event.target.value)} />}
        </label>
      })}
      {!template.fields?.length && <p className="text-sm text-slate-500">В форме пока нет вопросов.</p>}
    </fieldset>
    <ArchivedAnswers value={value} template={template} />
  </div>
}

export function PartyEventBriefView({ value = {}, template: suppliedTemplate, companyId = '', orderId = '', orderStatus = 'draft' }) {
  const { template, error, loading } = useBriefTemplate({ template: suppliedTemplate, companyId, orderId, value, orderStatus })
  const items = (template.fields || []).map((field) => ({ field, answer: getPartyBriefAnswer(value, field) })).filter(({ answer }) => hasPartyBriefAnswer(answer))
  return <div className="space-y-3">
    {loading && <p role="status" className="text-sm text-slate-500">Загрузка формы брифа…</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {!items.length && <p className="text-sm text-slate-500">Бриф пока не заполнен.</p>}
    <dl className="grid gap-2 sm:grid-cols-2">{items.map(({ field, answer }) => <div key={field.id} className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-3"><dt className="text-xs font-semibold text-slate-500">{field.label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-900">{display(answer)}</dd></div>)}</dl>
    <ArchivedAnswers value={value} template={template} />
  </div>
}
