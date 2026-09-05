'use client'

import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { apiJson } from '@helpers/apiClient'
import PartyReportReconciliation from './PartyReportReconciliation'

const RichEditor = dynamic(() => import('./PartyReportRichEditor'), {
  ssr: false,
  loading: () => (
    <p className="p-3 text-sm text-slate-500">Загрузка редактора…</p>
  ),
})
const labels = {
  draft: 'Черновик',
  submitted: 'На проверке',
  accepted: 'Принят',
  revision_requested: 'Нужны правки',
}
const button =
  'min-h-10 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'

function ReportCard({ report, companyId, onUpdate, staff, onDirtyChange }) {
  const [answers, setAnswers] = useState(() =>
    Object.fromEntries(
      (report.answers || []).map((answer) => [
        answer.fieldId,
        {
          html: answer.html || '',
          notApplicable: Boolean(answer.notApplicable),
          notApplicableReason: answer.notApplicableReason || '',
        },
      ])
    )
  )
  const [editing, setEditing] = useState('')
  const [comments, setComments] = useState({})
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const changeAnswer = (fieldId, patch) => {
    setError('')
    setAnswers((previous) => ({
      ...previous,
      [fieldId]: { ...previous[fieldId], ...patch },
    }))
    setDirty(true)
  }
  const person = staff?.find(
    (item) => String(item._id) === String(report.staffId)
  )
  const canEdit =
    report.canEdit &&
    report.answers.some((answer) =>
      ['draft', 'revision_requested'].includes(answer.status)
    )
  useEffect(() => {
    onDirtyChange?.(report._id, dirty || uploading)
    return () => onDirtyChange?.(report._id, false)
  }, [dirty, uploading, onDirtyChange, report._id])
  useEffect(() => {
    if (!dirty && !uploading) return
    const protect = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [dirty, uploading])
  const mutate = async (action, extra = {}) => {
    setBusy(true)
    setError('')
    try {
      const json = await apiJson('/api/party/reports', {
        method: 'PATCH',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify({
          _id: report._id,
          revision: report.revision,
          action,
          ...(action === 'review' ? {} : { answers }),
          ...extra,
        }),
      })
      setDirty(false)
      onUpdate(json.data)
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <article className="space-y-4 rounded-xl border border-sky-100 bg-white p-3 sm:p-4">
      <div>
        <h3 className="font-semibold text-slate-900">
          {report.templateSnapshot?.title || 'Отчёт'} ·{' '}
          {report.stage === 'before' ? 'До мероприятия' : 'После мероприятия'}
        </h3>
        <p className="text-sm text-slate-500">
          {[person?.firstName, person?.secondName].filter(Boolean).join(' ') ||
            report.staffName ||
            'Исполнитель'}{' '}
          · {labels[report.status] || report.status} · Версия формы{' '}
          {report.templateSnapshot?.version || 1}
        </p>
      </div>
      {(report.templateSnapshot?.fields || []).map((field) => {
        const answer = report.answers?.find((item) => item.fieldId === field.id)
        const localAnswer = answers[field.id] || {
          html: '',
          notApplicable: false,
          notApplicableReason: '',
        }
        const editable =
          report.canEdit &&
          ['draft', 'revision_requested'].includes(answer?.status)
        return (
          <section
            key={field.id}
            className="space-y-2 border-t border-slate-100 pt-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-medium">
                {field.label}
                {field.required || field.requiredMedia ? ' *' : ''}
              </h4>
              <span className="text-xs text-slate-500">
                {labels[answer?.status] || ''}
              </span>
            </div>
            {field.instruction && (
              <p className="text-sm whitespace-pre-wrap text-slate-500">
                {field.instruction}
              </p>
            )}
            {field.requiredMedia && !localAnswer.notApplicable && (
              <p className="text-sm text-sky-800">
                Для отправки добавьте хотя бы одну фотографию прямо в ответ.
              </p>
            )}
            {field.allowNotApplicable && editable && (
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="cursor-pointer"
                  disabled={busy || uploading}
                  checked={localAnswer.notApplicable}
                  onChange={(event) => {
                    changeAnswer(field.id, {
                      notApplicable: event.target.checked,
                    })
                    setEditing('')
                  }}
                />
                Не применимо к этому празднику
              </label>
            )}
            {localAnswer.notApplicable ? (
              editable ? (
                <label className="block text-sm">
                  Причина — обязательна при отправке
                  <textarea
                    className="mt-1 w-full rounded-lg border border-slate-300 p-2"
                    rows={2}
                    maxLength={2000}
                    disabled={busy || uploading}
                    value={localAnswer.notApplicableReason}
                    onChange={(event) =>
                      changeAnswer(field.id, {
                        notApplicableReason: event.target.value,
                      })
                    }
                  />
                </label>
              ) : (
                <p className="rounded-lg bg-slate-50 p-3 text-sm whitespace-pre-wrap text-slate-700">
                  Не применимо: {localAnswer.notApplicableReason}
                </p>
              )
            ) : editing === field.id && editable ? (
              <RichEditor
                key={`${report._id}:${field.id}:${report.revision}`}
                value={localAnswer.html}
                companyId={companyId}
                reportId={report._id}
                fieldId={field.id}
                label={field.label}
                disabled={busy}
                requiredMedia={field.requiredMedia}
                onUploadingChange={setUploading}
                onChange={(html) => {
                  changeAnswer(field.id, { html })
                }}
              />
            ) : (
              <div
                className="party-report-rich min-h-8 text-sm break-words [&_img]:my-2 [&_img]:h-auto [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6"
                dangerouslySetInnerHTML={{
                  __html: localAnswer.html || '<p>Пока не заполнено</p>',
                }}
              />
            )}
            {editable && !localAnswer.notApplicable && (
              <button
                type="button"
                className={button}
                disabled={busy || uploading}
                onClick={() => setEditing(editing === field.id ? '' : field.id)}
              >
                {editing === field.id
                  ? 'Свернуть редактор'
                  : 'Редактировать поле'}
              </button>
            )}
            {answer?.reviewComment && (
              <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">
                Комментарий проверяющего: {answer.reviewComment}
              </p>
            )}
            {(field.canReview || answer?.canReview) &&
              ['submitted', 'accepted'].includes(answer?.status) && (
                <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                  <label className="block text-sm">
                    Комментарий к проверке
                    <input
                      className="mt-1 w-full rounded border border-slate-300 p-2"
                      value={comments[field.id] || ''}
                      onChange={(event) =>
                        setComments((previous) => ({
                          ...previous,
                          [field.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {answer.status === 'submitted' && (
                      <button
                        type="button"
                        className={button}
                        disabled={busy || dirty || uploading}
                        onClick={() =>
                          mutate('review', {
                            fieldId: field.id,
                            decision: 'accepted',
                            comment: comments[field.id] || '',
                          })
                        }
                      >
                        Принять поле
                      </button>
                    )}
                    <button
                      type="button"
                      className={button}
                      disabled={
                        busy ||
                        dirty ||
                        uploading ||
                        !comments[field.id]?.trim()
                      }
                      onClick={() =>
                        mutate('review', {
                          fieldId: field.id,
                          decision: 'revision_requested',
                          comment: comments[field.id],
                        })
                      }
                    >
                      На доработку
                    </button>
                  </div>
                </div>
              )}
          </section>
        )
      })}
      {(report.templateSnapshot?.fields || []).some(
        (field) => field.section === 'finance' && field.reconciliationValueType
      ) && (
        <PartyReportReconciliation
          reportId={report._id}
          companyId={companyId}
          canCreate={report.canEdit}
          onDirtyChange={onDirtyChange}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            className={button}
            disabled={busy || uploading}
            onClick={() => mutate('save')}
          >
            Сохранить черновик
          </button>
          <button
            type="button"
            className={`${button} bg-sky-50`}
            disabled={busy || uploading}
            onClick={() => mutate('submit')}
          >
            Отправить на проверку
          </button>
          <span role="status" className="text-xs text-slate-500">
            {uploading
              ? 'Загрузка фотографии…'
              : busy
                ? 'Сохранение…'
                : dirty
                  ? 'Есть несохранённые изменения'
                  : 'Сохранено'}
          </span>
        </div>
      )}
    </article>
  )
}

export default function PartyOrderReports({
  companyId,
  orderId,
  staffId,
  staff = [],
  onDirtyChange,
}) {
  const [reports, setReports] = useState([])
  const [templates, setTemplates] = useState([])
  const [templateId, setTemplateId] = useState('')
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const availableTemplates = templates.filter(
    (template) =>
      !reports.some(
        (report) =>
          String(report.staffId) === String(staffId) &&
          String(report.templateFamilyId) === String(template.familyId)
      )
  )
  const load = useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const query = new URLSearchParams({
        orderId,
      })
      const json = await apiJson(`/api/party/reports?${query}`, {
        headers: { 'x-partycrm-company-id': companyId },
      })
      setReports(json.data.reports || [])
      setTemplates(json.data.templates || [])
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }, [companyId, orderId])
  useEffect(() => {
    load()
  }, [load])
  const create = async () => {
    setBusy(true)
    setError('')
    try {
      const json = await apiJson('/api/party/reports', {
        method: 'POST',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify({ orderId, staffId, templateId }),
      })
      setReports((previous) => [
        ...previous.filter((item) => item._id !== json.data._id),
        json.data,
      ])
      setTemplateId('')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3">
      {staffId && availableTemplates.length > 0 && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="min-w-0 flex-1 text-sm">
            Форма отчёта
            <select
              className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white p-2"
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
            >
              <option value="">Выберите форму</option>
              {availableTemplates.map((item) => (
                <option key={item._id} value={item._id}>
                  {item.title} · {item.stage === 'before' ? 'До' : 'После'}{' '}
                  мероприятия
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`${button} self-end`}
            disabled={busy || !templateId}
            onClick={create}
          >
            Заполнить отчёт
          </button>
        </div>
      )}
      {busy && (
        <p role="status" className="text-sm text-slate-500">
          Загрузка…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}{' '}
          <button
            type="button"
            className="cursor-pointer underline"
            onClick={load}
          >
            Повторить
          </button>
        </p>
      )}
      {!busy && !error && !reports.length && (
        <p className="text-sm text-slate-500">
          Отчётов по формам пока нет.
          {staffId && !templates.length
            ? ' Для этого заказа нет подходящих активных форм. Администратор может настроить их в настройках компании.'
            : ''}
        </p>
      )}
      {reports.map((report) => (
        <ReportCard
          key={`${report._id}:${report.revision}`}
          report={report}
          companyId={companyId}
          staff={staff}
          onDirtyChange={onDirtyChange}
          onUpdate={(next) =>
            setReports((previous) =>
              previous.map((item) => (item._id === next._id ? next : item))
            )
          }
        />
      ))}
    </div>
  )
}
