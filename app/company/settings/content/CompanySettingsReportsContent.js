'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import {
  REPORT_SECTIONS,
  starterPartyReportTemplates,
} from '@helpers/partyReportTemplates'

const control =
  'mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm'
const button =
  'min-h-10 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:opacity-50'
const emptyField = () => ({
  id: crypto.randomUUID(),
  label: '',
  instruction: '',
  required: false,
  requiredMedia: false,
  allowNotApplicable: false,
  applyWhenBound: false,
  section: 'general',
  reviewerStaffId: null,
  resourceId: null,
  serviceId: null,
  locationId: null,
  shareCreative: false,
})

export default function CompanySettingsReportsContent({ activeCompanyId }) {
  const [templates, setTemplates] = useState([])
  const [catalog, setCatalog] = useState({
    staff: [],
    services: [],
    locations: [],
    resources: [],
  })
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => {
    let canceled = false
    const headers = { 'x-partycrm-company-id': activeCompanyId }
    Promise.all(
      [
        '/api/party/report-templates',
        '/api/party/staff',
        '/api/party/services',
        '/api/party/locations',
        '/api/party/inventory',
      ].map((url) => apiJson(url, { headers }))
    )
      .then(([forms, staff, services, locations, inventory]) => {
        if (canceled) return
        setTemplates(forms.data || [])
        setCatalog({
          staff: staff.data || [],
          services: services.data || [],
          locations: locations.data || [],
          resources: inventory.data?.items || [],
        })
      })
      .catch((cause) => {
        if (!canceled) setError(cause.message)
      })
    return () => {
      canceled = true
    }
  }, [activeCompanyId])
  useEffect(() => {
    if (!draft) return
    const protect = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [draft])
  const editField = (index, patch) =>
    setDraft((previous) => ({
      ...previous,
      fields: previous.fields.map((field, current) =>
        current === index ? { ...field, ...patch } : field
      ),
    }))
  const save = async () => {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const json = await apiJson('/api/party/report-templates', {
        method: 'POST',
        headers: { 'x-partycrm-company-id': activeCompanyId },
        body: JSON.stringify({
          ...draft,
          previousTemplateId: draft._id || undefined,
        }),
      })
      const previousId = draft._id
      setTemplates((previous) => [
        ...previous.filter((item) => item._id !== previousId),
        json.data,
      ])
      setDraft(null)
      setMessage('Форма сохранена. Уже созданные отчёты сохранят свою версию.')
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }
  const move = (index, delta) =>
    setDraft((previous) => {
      const fields = [...previous.fields]
      ;[fields[index], fields[index + delta]] = [
        fields[index + delta],
        fields[index],
      ]
      return { ...previous, fields }
    })
  const options = (field, index, property, title, items) => (
    <label className="text-sm" key={property}>
      {title}
      <select
        className={control}
        value={field[property] || ''}
        onChange={(event) =>
          editField(index, { [property]: event.target.value || null })
        }
      >
        <option value="">Не выбран</option>
        {items.map((item) => (
          <option key={item._id} value={item._id}>
            {item.title ||
              [item.firstName, item.secondName].filter(Boolean).join(' ') ||
              item._id}
          </option>
        ))}
      </select>
    </label>
  )
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Каждое поле — форматируемый текст с фотографиями. Разделы проверяются
        отдельно; ответственный и связи с услугой, площадкой и реквизитом
        задаются для каждого поля.
      </p>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {message}
        </p>
      )}
      {!draft ? (
        <>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={button}
              onClick={() =>
                setDraft({
                  title: '',
                  stage: 'before',
                  active: true,
                  fields: [emptyField()],
                })
              }
            >
              Новая форма
            </button>
            {starterPartyReportTemplates.map((template) => (
              <button
                key={template.stage}
                type="button"
                className={button}
                onClick={() => setDraft(structuredClone(template))}
              >
                Взять за основу: {template.title}
              </button>
            ))}
          </div>
          {templates.length === 0 && (
            <p className="text-sm text-slate-500">
              Создайте форму с нуля или настройте предложенный образец.
            </p>
          )}
          {templates.map((template) => (
            <article
              key={template._id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-100 bg-white p-4"
            >
              <div>
                <h3 className="font-semibold">{template.title}</h3>
                <p className="text-sm text-slate-500">
                  {template.stage === 'before' ? 'До' : 'После'} мероприятия ·
                  версия {template.version} · {template.fields.length} полей ·{' '}
                  {template.active ? 'Активна' : 'Отключена'}
                </p>
              </div>
              <button
                type="button"
                className={button}
                onClick={() => {
                  setDraft(structuredClone(template))
                  setMessage('')
                }}
              >
                Редактировать
              </button>
            </article>
          ))}
        </>
      ) : (
        <div className="space-y-4 rounded-xl border border-sky-100 bg-white p-3 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Название формы
              <input
                className={control}
                value={draft.title}
                maxLength={160}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </label>
            <label className="text-sm">
              Этап
              <select
                className={control}
                value={draft.stage}
                disabled={Boolean(draft._id)}
                onChange={(event) =>
                  setDraft({ ...draft, stage: event.target.value })
                }
              >
                <option value="before">До мероприятия</option>
                <option value="after">После мероприятия</option>
              </select>
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) =>
                setDraft({ ...draft, active: event.target.checked })
              }
            />
            Доступна для новых отчётов
          </label>
          {draft.fields.map((field, index) => (
            <fieldset
              key={field.id}
              className="space-y-3 rounded-lg border border-slate-200 p-3"
            >
              <legend className="px-1 text-sm font-semibold">
                Поле {index + 1}
              </legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm">
                  Название
                  <input
                    className={control}
                    value={field.label}
                    onChange={(event) =>
                      editField(index, { label: event.target.value })
                    }
                  />
                </label>
                <label className="text-sm">
                  Раздел
                  <select
                    className={control}
                    value={field.section}
                    onChange={(event) =>
                      editField(index, {
                        section: event.target.value,
                        shareCreative:
                          event.target.value === 'creative' &&
                          field.shareCreative,
                      })
                    }
                  >
                    {Object.entries(REPORT_SECTIONS).map(([id, title]) => (
                      <option key={id} value={id}>
                        {title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="block text-sm">
                Подсказка исполнителю
                <textarea
                  className={control}
                  rows={2}
                  value={field.instruction}
                  onChange={(event) =>
                    editField(index, { instruction: event.target.value })
                  }
                />
              </label>
              <div className="grid gap-3 sm:grid-cols-2">
                {options(
                  field,
                  index,
                  'reviewerStaffId',
                  'Проверяющий',
                  catalog.staff
                )}
                {options(
                  field,
                  index,
                  'resourceId',
                  'Реквизит',
                  catalog.resources
                )}
                {options(field, index, 'serviceId', 'Услуга', catalog.services)}
                {options(
                  field,
                  index,
                  'locationId',
                  'Площадка',
                  catalog.locations
                )}
              </div>
              <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="cursor-pointer"
                    checked={Boolean(field.applyWhenBound)}
                    onChange={(event) => editField(index, { applyWhenBound: event.target.checked })}
                  />
                  Показывать только при совпадении выбранных связей
                </label>
                <p className="text-xs text-slate-600">
                  {field.applyWhenBound
                    ? 'Поле попадёт в новый отчёт, если заказ содержит выбранную услугу, проходит на выбранной площадке и включает выбранный реквизит. Все заполненные связи должны совпасть. Проверяющий на это условие не влияет.'
                    : 'Поле показывается во всех отчётах этой формы. Связи указывают, к чему относится ответ.'}
                </p>
                {field.applyWhenBound && (
                  <p className="text-xs text-slate-600">Подходящие поля определяются при создании отчёта. Изменения заказа не меняют уже начатый отчёт.</p>
                )}
                {field.applyWhenBound && !field.serviceId && !field.locationId && !field.resourceId && (
                  <p className="text-xs text-amber-800">Выберите хотя бы одну связь: услугу, площадку или реквизит.</p>
                )}
                {field.applyWhenBound && field.resourceId && (
                  <p className="text-xs text-slate-600">
                    Реквизит берётся из выбранного комплекта заказа. До мероприятия нужен активный резерв; после учитывается и освобождённый комплект оставшихся в заказе услуг.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={(event) =>
                      editField(index, { required: event.target.checked })
                    }
                  />
                  Обязательно
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="cursor-pointer"
                    checked={Boolean(field.requiredMedia)}
                    onChange={(event) => editField(index, { requiredMedia: event.target.checked })}
                  />
                  Обязательна фотография
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="cursor-pointer"
                    checked={Boolean(field.allowNotApplicable)}
                    onChange={(event) => editField(index, { allowNotApplicable: event.target.checked })}
                  />
                  Разрешить «не применимо» с причиной
                </label>
                {field.section === 'creative' && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={field.shareCreative}
                      onChange={(event) =>
                        editField(index, {
                          shareCreative: event.target.checked,
                        })
                      }
                    />
                    Показывать творческую часть другим исполнителям компании
                  </label>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={button}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  Выше
                </button>
                <button
                  type="button"
                  className={button}
                  disabled={index === draft.fields.length - 1}
                  onClick={() => move(index, 1)}
                >
                  Ниже
                </button>
                <button
                  type="button"
                  className={button}
                  onClick={() =>
                    setDraft({
                      ...draft,
                      fields: draft.fields.filter(
                        (_, current) => current !== index
                      ),
                    })
                  }
                >
                  Удалить поле
                </button>
              </div>
            </fieldset>
          ))}
          <button
            type="button"
            className={button}
            onClick={() =>
              setDraft({ ...draft, fields: [...draft.fields, emptyField()] })
            }
          >
            Добавить поле
          </button>
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              className={`${button} bg-sky-50`}
              disabled={
                busy ||
                !draft.title.trim() ||
                !draft.fields.length ||
                draft.fields.some((field) => !field.label.trim() || (field.applyWhenBound && !field.serviceId && !field.locationId && !field.resourceId))
              }
              onClick={save}
            >
              {busy
                ? 'Сохранение…'
                : draft._id
                  ? 'Сохранить новую версию'
                  : 'Сохранить форму'}
            </button>
            <button
              type="button"
              className={button}
              disabled={busy}
              onClick={() => setDraft(null)}
            >
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
