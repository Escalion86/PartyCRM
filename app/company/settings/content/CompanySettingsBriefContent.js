'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import { PARTY_BRIEF_FIELD_TYPES } from '@helpers/partyBriefTemplates'
import { PartyEventBriefEditor } from '@components/party/orders/PartyEventBrief'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'

const control =
  'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900'
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-medium text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'

export default function CompanySettingsBriefContent({ activeCompanyId }) {
  const [draft, setDraft] = useState(null)
  const [savedDraft, setSavedDraft] = useState('')
  const [removed, setRemoved] = useState([])
  const [removedFieldPolicy, setRemovedFieldPolicy] = useState({})
  const [preview, setPreview] = useState(null)
  const [previewAnswers, setPreviewAnswers] = useState({})
  const [persistedIds, setPersistedIds] = useState(new Set())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const draftKey = draft
    ? JSON.stringify({ title: draft.title, fields: draft.fields })
    : ''
  usePartyUnsavedChanges(
    Boolean(draft && (draftKey !== savedDraft || removed.length)),
    { label: 'форма брифа', scope: activeCompanyId, pending: busy }
  )
  const headers = { 'x-partycrm-company-id': activeCompanyId }

  useEffect(() => {
    let alive = true
    apiJson('/api/party/brief-template', {
      cache: 'no-store',
      headers: { 'x-partycrm-company-id': activeCompanyId },
    })
      .then((result) => {
        if (alive) {
          setDraft(result.data)
          setSavedDraft(
            JSON.stringify({
              title: result.data.title,
              fields: result.data.fields,
            })
          )
          setPersistedIds(
            new Set((result.data.fields || []).map((field) => field.id))
          )
        }
      })
      .catch((failure) => {
        if (alive) setError(failure.message || 'Не удалось загрузить форму')
      })
    return () => {
      alive = false
    }
  }, [activeCompanyId])

  const edit = (change) => {
    setDraft((previous) => ({ ...previous, ...change }))
    setPreview(null)
    setNotice('')
  }
  const editField = (id, change) =>
    edit({
      fields: draft.fields.map((field) =>
        field.id === id ? { ...field, ...change } : field
      ),
    })
  const move = (index, offset) => {
    const fields = [...draft.fields]
    const target = index + offset
    if (target < 0 || target >= fields.length) return
    ;[fields[index], fields[target]] = [fields[target], fields[index]]
    edit({ fields })
  }
  const removeField = (field, index) => {
    if (persistedIds.has(field.id))
      setRemoved((previous) => [...previous, { field, index }])
    edit({ fields: draft.fields.filter((entry) => entry.id !== field.id) })
  }
  const chooseRemoval = (id, choice) => {
    if (choice === 'keep') {
      const item = removed.find((entry) => entry.field.id === id)
      const fields = [...draft.fields]
      fields.splice(Math.min(item.index, fields.length), 0, item.field)
      setRemoved((previous) =>
        previous.filter((entry) => entry.field.id !== id)
      )
      edit({ fields })
    } else setPreview(null)
    setRemovedFieldPolicy((previous) => ({ ...previous, [id]: choice }))
  }

  const submit = async (previewOnly) => {
    if (busy || !draft) return
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const payload = {
        title: draft.title,
        fields: draft.fields,
        expectedRevision: draft.revision,
        removedFieldPolicy,
        preview: previewOnly,
      }
      const result = await apiJson('/api/party/brief-template', {
        method: 'PATCH',
        headers,
        body: JSON.stringify(payload),
      })
      if (previewOnly) setPreview(result.data)
      else {
        setDraft(result.data)
        setSavedDraft(
          JSON.stringify({
            title: result.data.title,
            fields: result.data.fields,
          })
        )
        setPreview(null)
        setRemoved([])
        setRemovedFieldPolicy({})
        setPersistedIds(
          new Set((result.data.fields || []).map((field) => field.id))
        )
        setNotice(
          'Новая форма опубликована. Она применяется к незакрытым заказам; закрытые сохраняют прежнюю форму.'
        )
      }
    } catch (failure) {
      setError(failure.message || 'Не удалось сохранить форму')
    } finally {
      setBusy(false)
    }
  }

  const decisionsMade = removed.every(
    ({ field }) => removedFieldPolicy[field.id] === 'archive'
  )
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-600">
        Одна форма брифа для компании. Все вопросы обязательны при переходе
        заказа на следующий этап. Незавершённый бриф можно сохранить в новой
        заявке.
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {!draft ? (
        <p role="status" className="text-sm text-slate-500">
          Загрузка формы…
        </p>
      ) : (
        <>
          <label className="block text-sm font-medium">
            Название формы
            <input
              maxLength={180}
              className={control}
              value={draft.title}
              disabled={busy}
              onChange={(event) => edit({ title: event.target.value })}
            />
          </label>
          <fieldset disabled={busy} className="space-y-3">
            <legend className="mb-2 text-sm font-semibold">
              Вопросы · {draft.fields.length}
            </legend>
            {draft.fields.map((field, index) => (
              <div
                key={field.id}
                className="space-y-3 rounded-xl border border-sky-100 bg-white p-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row">
                  <label className="min-w-0 flex-1 text-sm">
                    Вопрос
                    <input
                      maxLength={240}
                      className={control}
                      value={field.label}
                      onChange={(event) =>
                        editField(field.id, { label: event.target.value })
                      }
                    />
                  </label>
                  <label className="text-sm sm:w-52">
                    Тип ответа
                    <select
                      className={`${control} cursor-pointer`}
                      disabled={
                        Boolean(field.legacyKey) || persistedIds.has(field.id)
                      }
                      value={field.type}
                      onChange={(event) =>
                        editField(field.id, {
                          type: event.target.value,
                          options:
                            event.target.value === 'select'
                              ? ['Первый вариант']
                              : [],
                        })
                      }
                    >
                      {Object.entries(PARTY_BRIEF_FIELD_TYPES).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                </div>
                {field.type === 'select' && (
                  <label className="block text-sm">
                    Варианты ответа, каждый с новой строки
                    <textarea
                      className={control}
                      rows={3}
                      value={(field.options || []).join('\n')}
                      onChange={(event) =>
                        editField(field.id, {
                          options: event.target.value.split('\n'),
                        })
                      }
                    />
                  </label>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    aria-label={`Поднять вопрос ${field.label}`}
                    className={button}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    Выше
                  </button>
                  <button
                    type="button"
                    aria-label={`Опустить вопрос ${field.label}`}
                    className={button}
                    disabled={index === draft.fields.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    Ниже
                  </button>
                  <button
                    type="button"
                    className={`${button} ml-auto text-red-700`}
                    onClick={() => removeField(field, index)}
                  >
                    Убрать вопрос
                  </button>
                </div>
              </div>
            ))}
            <button
              type="button"
              className={button}
              disabled={draft.fields.length >= 100}
              onClick={() =>
                edit({
                  fields: [
                    ...draft.fields,
                    {
                      id: `new_${crypto.randomUUID().replaceAll('-', '')}`,
                      label: '',
                      type: 'text',
                      options: [],
                      legacyKey: null,
                      required: true,
                    },
                  ],
                })
              }
            >
              Добавить вопрос
            </button>
          </fieldset>
          {removed.length > 0 && (
            <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <h3 className="text-sm font-semibold text-amber-900">
                Что сделать с убранными вопросами
              </h3>
              <p className="text-xs text-amber-900">
                Удаление вопроса не удаляет его ответы. Выберите действие для
                каждого вопроса.
              </p>
              {removed.map(({ field }) => (
                <label key={field.id} className="block text-sm">
                  {field.label}
                  <select
                    className={`${control} cursor-pointer`}
                    disabled={busy}
                    value={removedFieldPolicy[field.id] || ''}
                    onChange={(event) =>
                      chooseRemoval(field.id, event.target.value)
                    }
                  >
                    <option value="">Выберите действие</option>
                    <option value="keep">Оставить вопрос в форме</option>
                    <option value="archive">
                      Убрать вопрос, сохранить ответы в архиве
                    </option>
                  </select>
                </label>
              ))}
            </section>
          )}
          <button
            type="button"
            className={button}
            disabled={
              busy ||
              !draft.title.trim() ||
              !decisionsMade ||
              draft.fields.some((field) => !field.label.trim())
            }
            onClick={() => submit(true)}
          >
            {busy ? 'Проверка…' : 'Предпросмотр изменений'}
          </button>
          {preview && (
            <section className="space-y-4 rounded-xl border border-sky-200 bg-sky-50 p-3 sm:p-4">
              <h3 className="font-semibold">Как будет выглядеть бриф</h3>
              <p className="text-sm text-slate-600">
                Новая форма будет использоваться в {preview.affectedOpenOrders}{' '}
                незакрытых заказах. Сохранённых ответов в архиве:{' '}
                {preview.archivedAnswerCount}. Закрытые заказы сохранят свою
                форму.
              </p>
              <PartyEventBriefEditor
                template={preview}
                value={previewAnswers}
                onChange={setPreviewAnswers}
              />
              <button
                type="button"
                disabled={busy}
                className="min-h-11 cursor-pointer rounded-lg bg-sky-600 px-4 py-2 font-semibold text-white disabled:opacity-50"
                onClick={() => submit(false)}
              >
                {busy ? 'Публикация…' : 'Опубликовать форму'}
              </button>
            </section>
          )}
        </>
      )}
    </div>
  )
}
