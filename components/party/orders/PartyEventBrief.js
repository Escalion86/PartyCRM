'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import PartyBriefContactField from './PartyBriefContactField'
import { partyDateAtTime, partyZonedParts } from '@helpers/partyWorkingSchedule'
import {
  getPartyApplicableBriefFields,
  getPartyArchivedBriefAnswers,
  getPartyBriefAnswer,
  getPartyBriefMissingFields,
  getPartyDefaultBriefTemplate,
  hasPartyBriefAnswer,
  resolvePartyBriefTemplate,
} from '@helpers/partyBriefTemplates'

const control =
  'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 aria-invalid:border-red-700 disabled:bg-slate-50'
const display = (value) =>
  typeof value === 'boolean'
    ? value
      ? 'Да'
      : 'Нет'
    : typeof value === 'object' && value !== null
      ? value.clientId ? [value.name, value.phone, value.email].filter(Boolean).join(' · ') || 'Контакт' : JSON.stringify(value, null, 2)
      : String(value ?? '')

export const hasPartyEventBrief = (brief) =>
  Boolean(
    (brief &&
      Object.entries(brief).some(
        ([key, value]) =>
          !['templateSnapshot', 'customAnswers', 'archivedAnswers'].includes(
            key
          ) && hasPartyBriefAnswer(value)
      )) ||
    Object.values(brief?.customAnswers || {}).some(hasPartyBriefAnswer) ||
    brief?.archivedAnswers?.some((answer) => hasPartyBriefAnswer(answer.value))
  )

const useBriefTemplate = ({
  template,
  companyId,
  orderId,
  orderTypeId,
  value,
  orderStatus,
}) => {
  const [remote, setRemote] = useState({ key: '', template: null, error: '' })
  const [retry, setRetry] = useState(0)
  const key = JSON.stringify([companyId, orderId, orderTypeId, orderStatus, retry])
  const shouldFetch = Boolean(
    companyId && !template && orderStatus !== 'closed'
  )
  useEffect(() => {
    if (!shouldFetch) return
    const controller = new AbortController()
    apiJson(
      `/api/party/brief-template${orderTypeId ? `?orderTypeId=${encodeURIComponent(orderTypeId)}` : orderId ? `?orderId=${encodeURIComponent(orderId)}` : ''}`,
      {
        cache: 'no-store',
        headers: { 'x-partycrm-company-id': companyId },
        signal: controller.signal,
      }
    )
      .then((result) => {
        if (!controller.signal.aborted)
          setRemote({ key, template: result.data, error: '' })
      })
      .catch((failure) => {
        if (!controller.signal.aborted)
          setRemote({
            key,
            template: null,
            error: failure.message || 'Не удалось загрузить форму брифа',
          })
      })
    return () => controller.abort()
  }, [shouldFetch, companyId, orderId, orderTypeId, key])
  const current = remote.key === key
  return {
    reload: () => setRetry((value) => value + 1),
    template: resolvePartyBriefTemplate(
      value,
      template ||
        (current && remote.template) ||
        getPartyDefaultBriefTemplate(),
      orderStatus
    ),
    error: shouldFetch && current ? remote.error : '',
    loading: shouldFetch && !current,
  }
}

function PreservedServiceAnswers({ value, template, fields }) {
  const visible = new Set(fields.map((field) => field.id))
  const count = (template.fields || []).filter(
    (field) =>
      !visible.has(field.id) &&
      hasPartyBriefAnswer(getPartyBriefAnswer(value, field))
  ).length
  return count ? (
    <p className="text-xs text-slate-500">
      Ответы на вопросы других услуг сохранены: {count}. Они появятся при выборе
      соответствующей услуги.
    </p>
  ) : null
}

function ArchivedAnswers({ value, template }) {
  const answers = getPartyArchivedBriefAnswers(value, template)
  if (!answers.length) return null
  return (
    <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <summary className="min-h-10 cursor-pointer text-sm font-medium text-slate-600">
        Сохранённые ответы прежней формы · {answers.length}
      </summary>
      <p className="mb-3 text-xs text-slate-500">
        Вопросы убраны из текущей формы. Их ответы сохранены и доступны для
        просмотра.
      </p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {answers.map(({ field, value }, index) => (
          <div key={`${field.id}_${index}`} className="min-w-0">
            <dt className="text-xs font-semibold text-slate-500">
              {field.label}
            </dt>
            <dd className="mt-1 text-sm break-words whitespace-pre-wrap text-slate-800">
              {display(value)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

export function PartyEventBriefEditor({
  value = {},
  onChange,
  template: suppliedTemplate,
  companyId = '',
  orderId = '',
  orderTypeId = '',
  contactOptions,
  onContactDirtyChange,
  timeZone = 'Asia/Krasnoyarsk',
  orderStatus = 'draft',
  disabled = false,
  servicesIds,
  booking = false,
  onValidationChange,
  invalidFieldId,
  validationErrorId,
}) {
  const dirtyContacts = useRef(new Map())
  const reportContactDirty = useCallback((id, dirty) => {
    dirtyContacts.current.set(id, dirty)
    onContactDirtyChange?.([...dirtyContacts.current.values()].some(Boolean))
  }, [onContactDirtyChange])
  const { template, error, loading, reload } = useBriefTemplate({
    template: suppliedTemplate,
    companyId,
    orderId,
    orderTypeId,
    value,
    orderStatus,
  })
  const fields =
    loading || error ? [] : getPartyApplicableBriefFields(template, servicesIds)
  const missingField = onValidationChange && !loading && !error
    ? getPartyBriefMissingFields(value, template, servicesIds)[0]
    : undefined
  const missingId = missingField?.id
  const missingLabel = missingField?.label
  useEffect(() => {
    onValidationChange?.({ loading, error, missingId, missingLabel })
  }, [onValidationChange, loading, error, missingId, missingLabel])
  const change = (field, next) =>
    onChange?.({
      ...value,
      ...(field.legacyKey ? { [field.legacyKey]: next } : {}),
      customAnswers: { ...(value.customAnswers || {}), [field.id]: next },
    })
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        {booking
          ? 'Заполните обязательные поля для бронирования. Заявку можно сохранить с неполным брифом.'
          : 'Вопросы зависят от выбранных услуг. Заказ можно сохранить незаполненным. Обязательные вопросы проверяются при передаче, если это задано в настройках этапа.'}
      </p>
      {loading && (
        <p role="status" className="text-sm text-slate-500">
          Загрузка формы брифа…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {error ? (
        <button
          type="button"
          className="min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800"
          onClick={reload}
        >
          Повторить загрузку брифа
        </button>
      ) : null}
      <fieldset
        aria-busy={loading}
        disabled={disabled || loading || Boolean(error)}
        className="grid min-w-0 gap-4 rounded-xl border border-sky-100 bg-white p-3 sm:grid-cols-2 sm:p-4"
      >
        <legend className="px-1 font-semibold text-slate-900">
          {template.title || 'Бриф заказа'}
        </legend>
        {fields.map((field) => {
          const answer = getPartyBriefAnswer(value, field)
          const fieldError = field.id === invalidFieldId
            ? { 'aria-invalid': true, 'aria-describedby': validationErrorId }
            : undefined
          if (field.type === 'note') return <div key={field.id} className="border-l-4 border-sky-300 bg-sky-50 p-3 text-sm leading-6 whitespace-pre-wrap text-sky-950 sm:col-span-2"><p className="font-semibold">{field.label}</p>{field.content ? <p>{field.content}</p> : null}</div>
          if (field.type === 'contact') return <div key={field.id} className="min-w-0 text-sm font-medium text-slate-700"><span>{field.label}{field.required !== false ? ' *' : ''}</span><PartyBriefContactField value={answer} onChange={(next) => change(field, next)} companyId={companyId} orderId={orderId} disabled={disabled} options={contactOptions} fieldId={field.id} onDirtyChange={reportContactDirty} fieldError={fieldError} /></div>
          let inputValue = answer ?? ''
          if (field.type === 'datetime' && answer && Number.isFinite(Date.parse(answer))) {
            const parts = partyZonedParts(answer, timeZone)
            inputValue = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`
          }
          return (
            <label
              key={field.id}
              className={`min-w-0 text-sm font-medium text-slate-700 ${field.type === 'textarea' ? 'sm:col-span-2' : ''}`}
            >
              {field.label}{' '}
              {field.required !== false ? (
                <span
                  aria-label={booking ? 'Обязательно для бронирования' : 'Обязательно при переходе'}
                  className="text-red-600"
                >
                  *
                </span>
              ) : null}
              {field.type === 'textarea' ? (
                <textarea
                  className={control}
                  rows={3}
                  maxLength={20000}
                  value={answer ?? ''}
                  {...fieldError}
                  onChange={(event) => change(field, event.target.value)}
                />
              ) : field.type === 'select' ? (
                <select
                  className={`${control} cursor-pointer`}
                  value={answer ?? ''}
                  {...fieldError}
                  onChange={(event) => change(field, event.target.value)}
                >
                  <option value="">Выберите вариант</option>
                  {hasPartyBriefAnswer(answer) &&
                    !field.options?.includes(String(answer)) && (
                      <option value={String(answer)}>
                        {String(answer)} · прежний ответ
                      </option>
                    )}
                  {(field.options || []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : field.type === 'checkbox' ? (
                <select
                  className={`${control} cursor-pointer`}
                  value={typeof answer === 'boolean' ? String(answer) : ''}
                  {...fieldError}
                  onChange={(event) =>
                    change(
                      field,
                      event.target.value === ''
                        ? null
                        : event.target.value === 'true'
                    )
                  }
                >
                  <option value="">Выберите ответ</option>
                  <option value="true">Да</option>
                  <option value="false">Нет</option>
                </select>
              ) : (
                <input
                  className={control}
                  type={
                    ['number', 'money'].includes(field.type)
                      ? 'number'
                      : field.type === 'date'
                        ? 'date'
                        : field.type === 'time' ? 'time'
                        : field.type === 'datetime' ? 'datetime-local'
                        : 'text'
                  }
                  step={field.type === 'money' ? '0.01' : field.type === 'number' ? 'any' : undefined}
                  min={field.type === 'money' ? 0 : undefined}
                  maxLength={field.type === 'text' ? 20000 : undefined}
                  value={inputValue}
                  {...fieldError}
                  onChange={(event) =>
                    change(
                      field,
                      ['number', 'money'].includes(field.type) && event.target.value !== ''
                        ? Number(event.target.value)
                        : field.type === 'datetime' && event.target.value ? partyDateAtTime(event.target.value.slice(0, 10), event.target.value.slice(11, 16), timeZone).toISOString()
                        : event.target.value
                    )
                  }
                />
              )}
            </label>
          )
        })}
        {!fields.length && (
          <p className="text-sm text-slate-500">
            {template.fields?.length
              ? 'Для выбранных услуг нет вопросов брифа.'
              : 'В форме пока нет вопросов.'}
          </p>
        )}
      </fieldset>
      {!loading && !error ? (
        <PreservedServiceAnswers
          value={value}
          template={template}
          fields={fields}
        />
      ) : null}
      {!loading && !error ? (
        <ArchivedAnswers value={value} template={template} />
      ) : null}
    </div>
  )
}

export function PartyEventBriefView({
  value = {},
  template: suppliedTemplate,
  companyId = '',
  orderId = '',
  orderStatus = 'draft',
  servicesIds,
}) {
  const { template, error, loading, reload } = useBriefTemplate({
    template: suppliedTemplate,
    companyId,
    orderId,
    value,
    orderStatus,
  })
  const fields = getPartyApplicableBriefFields(template, servicesIds)
  const items =
    loading || error
      ? []
      : fields
          .map((field) => ({
            field,
            answer: getPartyBriefAnswer(value, field),
          }))
          .filter(({ field, answer }) => field.type === 'note' || hasPartyBriefAnswer(answer))
  return (
    <div className="space-y-3">
      {loading && (
        <p role="status" className="text-sm text-slate-500">
          Загрузка формы брифа…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {error ? (
        <button
          type="button"
          className="min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800"
          onClick={reload}
        >
          Повторить загрузку брифа
        </button>
      ) : null}
      {!loading && !error && !items.length && (
        <p className="text-sm text-slate-500">
          {fields.length
            ? 'Бриф пока не заполнен.'
            : 'Для выбранных услуг нет вопросов брифа.'}
        </p>
      )}
      <dl className="grid gap-2 sm:grid-cols-2">
        {items.map(({ field, answer }) => (
          <div
            key={field.id}
            className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-3"
          >
            <dt className="text-xs font-semibold text-slate-500">
              {field.label}
            </dt>
            <dd className="mt-1 text-sm break-words whitespace-pre-wrap text-slate-900">
              {field.type === 'note' ? field.content || field.label : display(answer)}
            </dd>
          </div>
        ))}
      </dl>
      {!loading && !error ? (
        <ArchivedAnswers value={value} template={template} />
      ) : null}
      {!loading && !error ? (
        <PreservedServiceAnswers
          value={value}
          template={template}
          fields={fields}
        />
      ) : null}
    </div>
  )
}
