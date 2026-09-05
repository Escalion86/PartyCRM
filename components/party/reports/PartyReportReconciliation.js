'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const button =
  'min-h-10 cursor-pointer rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50'
const control =
  'mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm disabled:bg-slate-50'
const labels = {
  draft: 'Черновик',
  submitted: 'На проверке',
  accepted: 'Принято',
  revision_requested: 'Нужны правки',
  not_required: 'Не заполнено',
}
const paymentMethods = [
  ['transfer', 'Перевод'],
  ['account', 'Расчётный счёт'],
  ['cash', 'Наличные'],
  ['barter', 'Бартер'],
]

function ValueInput({ field, value, disabled, onChange }) {
  if (field.valueType === 'payment_method') {
    return (
      <select
        className={control}
        value={value || ''}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Не выбрано</option>
        {paymentMethods.map(([key, label]) => (
          <option key={key} value={key}>
            {label}
          </option>
        ))}
      </select>
    )
  }
  return (
    <input
      className={control}
      type={field.valueType === 'date' ? 'date' : 'text'}
      inputMode={field.valueType === 'money' ? 'decimal' : undefined}
      maxLength={field.valueType === 'text' ? 500 : undefined}
      placeholder={field.valueType === 'money' ? '0,00 ₽' : ''}
      value={value || ''}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
    />
  )
}

export default function PartyReportReconciliation({
  reportId,
  companyId,
  canCreate,
  onDirtyChange,
}) {
  const [data, setData] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [values, setValues] = useState({})
  const [comments, setComments] = useState({})
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const headers = useMemo(
    () => ({ 'x-partycrm-company-id': companyId }),
    [companyId]
  )

  const applyData = useCallback((next) => {
    setData(next)
    setValues(
      Object.fromEntries(
        (next?.values || []).map((item) => [item.fieldId, item.value ?? ''])
      )
    )
    setDirty(false)
  }, [])

  const load = useCallback(async () => {
    setError('')
    try {
      const result = await apiJson(
        `/api/party/report-reconciliations?reportId=${reportId}`,
        { headers, cache: 'no-store' }
      )
      applyData(result.data)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setLoaded(true)
    }
  }, [applyData, headers, reportId])

  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    onDirtyChange?.(`finance:${reportId}`, dirty)
    return () => onDirtyChange?.(`finance:${reportId}`, false)
  }, [dirty, onDirtyChange, reportId])

  const create = async () => {
    setBusy(true)
    setError('')
    try {
      const result = await apiJson('/api/party/report-reconciliations', {
        method: 'POST',
        headers,
        body: JSON.stringify({ reportId }),
      })
      applyData(result.data)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const mutate = async (action, extra = {}) => {
    setBusy(true)
    setError('')
    try {
      const result = await apiJson('/api/party/report-reconciliations', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          _id: data._id,
          revision: data.revision,
          action,
          ...(action === 'review' ? {} : { values }),
          ...extra,
        }),
      })
      applyData(result.data)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  const importSettlement = async () => {
    setBusy(true)
    setError('')
    try {
      await apiJson('/api/party/financial-settlements/import-report', {
        method: 'POST',
        headers,
        body: JSON.stringify({ sourceReportReconciliationId: data._id }),
      })
      setError('Значения перенесены в расчёт с сотрудником.')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }

  if (!loaded)
    return <p className="text-sm text-slate-500">Загрузка финансовой сверки…</p>
  if (!data) {
    if (!canCreate) return null
    return (
      <section className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
        <p className="text-sm text-slate-700">
          Денежные значения заполняются отдельно от форматируемого текста и
          фотографий.
        </p>
        <button
          type="button"
          className={`${button} mt-2`}
          disabled={busy}
          onClick={create}
        >
          Создать финансовую сверку
        </button>
        {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      </section>
    )
  }

  return (
    <section className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-semibold text-emerald-950">Финансовая сверка</h4>
          <p className="text-xs text-emerald-800">
            {labels[data.status] || data.status}
          </p>
        </div>
        {data.canImport && data.status === 'accepted' && (
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={importSettlement}
          >
            Перенести в расчёт
          </button>
        )}
      </div>
      {data.fields.map((field) => {
        const state = data.values.find((item) => item.fieldId === field.fieldId)
        const editable =
          data.canEdit &&
          ['draft', 'revision_requested', 'not_required'].includes(
            state?.status
          )
        return (
          <div key={field.fieldId} className="rounded-lg bg-white p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <label className="min-w-0 flex-1 text-sm font-medium">
                {field.label}
                {field.required ? ' *' : ''}
                <ValueInput
                  field={field}
                  value={values[field.fieldId]}
                  disabled={busy || !editable}
                  onChange={(value) => {
                    setValues((current) => ({
                      ...current,
                      [field.fieldId]: value,
                    }))
                    setDirty(true)
                    setError('')
                  }}
                />
              </label>
              <span className="text-xs text-slate-500">
                {labels[state?.status] || ''}
              </span>
            </div>
            {state?.reviewComment && (
              <p className="mt-2 rounded bg-amber-50 p-2 text-sm text-amber-900">
                Комментарий: {state.reviewComment}
              </p>
            )}
            {field.canReview &&
              ['submitted', 'accepted'].includes(state?.status) && (
                <div className="mt-2 space-y-2">
                  <input
                    className={control}
                    placeholder="Комментарий проверяющего"
                    value={comments[field.fieldId] || ''}
                    onChange={(event) =>
                      setComments((current) => ({
                        ...current,
                        [field.fieldId]: event.target.value,
                      }))
                    }
                  />
                  <div className="flex flex-wrap gap-2">
                    {state.status === 'submitted' && (
                      <button
                        type="button"
                        className={button}
                        disabled={busy || dirty}
                        onClick={() =>
                          mutate('review', {
                            fieldId: field.fieldId,
                            decision: 'accepted',
                            comment: comments[field.fieldId] || '',
                          })
                        }
                      >
                        Принять
                      </button>
                    )}
                    <button
                      type="button"
                      className={button}
                      disabled={
                        busy || dirty || !comments[field.fieldId]?.trim()
                      }
                      onClick={() =>
                        mutate('review', {
                          fieldId: field.fieldId,
                          decision: 'revision_requested',
                          comment: comments[field.fieldId],
                        })
                      }
                    >
                      Вернуть на доработку
                    </button>
                  </div>
                </div>
              )}
          </div>
        )
      })}
      {data.canEdit &&
        data.fields.some((field) => {
          const state = data.values.find(
            (item) => item.fieldId === field.fieldId
          )
          return ['draft', 'revision_requested', 'not_required'].includes(
            state?.status
          )
        }) && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => mutate('save')}
            >
              Сохранить
            </button>
            <button
              type="button"
              className={`${button} bg-emerald-100`}
              disabled={busy}
              onClick={() => mutate('submit')}
            >
              Отправить на проверку
            </button>
          </div>
        )}
      {error && (
        <p
          className={`text-sm ${error.includes('перенесены') ? 'text-emerald-800' : 'text-red-700'}`}
        >
          {error}
        </p>
      )}
    </section>
  )
}
