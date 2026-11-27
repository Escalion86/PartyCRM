'use client'

import { useEffect, useRef, useState } from 'react'

const control = 'mt-1.5 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-base text-slate-950 outline-none focus-visible:border-sky-700 focus-visible:ring-2 focus-visible:ring-sky-600 aria-invalid:border-red-700'
const inputTypes = {
  date: 'date',
  datetime: 'datetime-local',
  money: 'number',
  number: 'number',
  time: 'time',
}

function BriefQuestion({ field, invalid }) {
  const inputProps = {
    name: field.id,
    required: field.required,
    'aria-invalid': invalid || undefined,
    'aria-describedby': invalid ? 'brief-error' : undefined,
  }
  const optionList = field.type === 'checkbox' ? [
    { value: 'true', label: 'Да' },
    { value: 'false', label: 'Нет' },
  ] : field.options.map((option) => ({ value: option, label: option }))
  return (
    <label className="block min-w-0 text-sm font-medium break-words text-slate-800">
      {field.label}{field.required ? <span aria-hidden="true" className="text-sky-800"> *</span> : null}
      {field.type === 'textarea' ? (
        <textarea {...inputProps} rows={3} maxLength={field.maxLength} className={control} />
      ) : ['select', 'checkbox'].includes(field.type) ? (
        <select {...inputProps} defaultValue="" className={`${control} cursor-pointer`}>
          <option value="">Выберите ответ</option>
          {optionList.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
        </select>
      ) : (
        <input
          {...inputProps}
          className={control}
          type={inputTypes[field.type] || 'text'}
          maxLength={field.maxLength}
          min={field.type === 'money' ? 0 : field.min}
          max={field.max}
          step={field.type === 'money' ? '0.01' : field.type === 'number' && field.min === undefined ? 'any' : undefined}
        />
      )}
    </label>
  )
}

export default function PartyClientBriefForm({ token, brief }) {
  const [submitted, setSubmitted] = useState(Boolean(brief.submitted))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(null)
  const formRef = useRef(null)
  const headingRef = useRef(null)
  useEffect(() => {
    if (submitted && !brief.submitted) headingRef.current?.focus()
    if (error?.fieldId) formRef.current?.elements.namedItem(error.fieldId)?.focus()
  }, [brief.submitted, error, submitted])

  const send = async (event) => {
    event.preventDefault()
    if (pending) return
    const answers = Object.fromEntries(new FormData(event.currentTarget))
    setPending(true)
    setError(null)
    try {
      const response = await fetch(`/api/party/public/brief/${encodeURIComponent(token)}`, {
        method: 'POST',
        cache: 'no-store',
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: brief.version, answers }),
      })
      const result = await response.json()
      if (response.ok && result.success) setSubmitted(true)
      else setError({ ...result.error, fieldId: result.fieldId, message: result.error?.message || 'Не удалось отправить бриф. Попробуйте ещё раз.' })
    } catch {
      setError({ message: 'Не удалось отправить бриф. Проверьте подключение и попробуйте ещё раз.' })
    } finally {
      setPending(false)
    }
  }

  if (submitted) return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold tracking-tight focus:outline-none">Бриф отправлен</h1>
      <p className="mt-2 text-sm leading-6 text-slate-700">Организатор получил ваши ответы.</p>
    </>
  )

  return (
    <>
      <div className="mb-5 border-b border-sky-100 pb-5 sm:mb-6">
        <h1 className="text-2xl font-semibold tracking-tight break-words sm:text-3xl">{brief.title}</h1>
        {brief.companyTitle ? <p className="mt-1 text-base break-words text-slate-700">{brief.companyTitle}</p> : null}
        {brief.fields.some((field) => field.required) ? (
          <p className="mt-3 text-sm leading-6 text-slate-700">Поля со звёздочкой обязательны.</p>
        ) : null}
      </div>
      <form ref={formRef} method="post" onSubmit={send} aria-busy={pending}>
        <fieldset disabled={pending} className="min-w-0 space-y-5">
          {brief.fields.map((field) => <BriefQuestion key={field.id} field={field} invalid={error?.fieldId === field.id} />)}
        </fieldset>
        {error ? (
          <div id="brief-error" role="alert" className="mt-5 rounded-lg bg-red-50 px-3.5 py-3 text-sm leading-6 text-red-800">
            {error.message}
            {error.code === 'partycrm_client_brief_form_changed' ? (
              <button type="button" onClick={() => window.location.reload()} className="block min-h-11 cursor-pointer font-semibold underline underline-offset-4">
                Обновить форму
              </button>
            ) : null}
          </div>
        ) : null}
        <button type="submit" disabled={pending || error?.code === 'partycrm_client_brief_form_changed'} className="mt-6 min-h-11 w-full cursor-pointer rounded-lg bg-sky-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-default disabled:opacity-70 sm:w-auto">
          {pending ? 'Отправляем…' : 'Отправить бриф'}
        </button>
      </form>
    </>
  )
}
