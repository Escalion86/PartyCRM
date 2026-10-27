'use client'

import { useEffect, useState } from 'react'
import { apiJson } from '@helpers/apiClient'
import FieldHelp from '@components/FieldHelp'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import {
  REPORT_SECTIONS,
  starterPartyReportTemplates,
  simplePartyReportTemplate,
} from '@helpers/partyReportTemplates'

const control =
  'mt-1 min-h-10 w-full rounded-lg border border-slate-300 bg-white p-2 text-sm'
const button =
  'min-h-10 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:opacity-50'
const help = {
  reviewerPositionId:
    'Любой действующий сотрудник этой должности может проверить вопрос. Достаточно одного решения; сохраняется имя проверившего. Без должности проверяют владелец и администратор.',
  serviceId:
    'К какой услуге относится вопрос. Например, вопрос о дым-машине можно показывать только для заказов с этой услугой. Исполнителю повторно выбирать услугу не нужно.',
  locationId:
    'К какой площадке относится вопрос. Чтобы он появлялся только на этой площадке, включите условие совпадения связей.',
  resourceId:
    'К какому предмету реквизита относится вопрос. При включённом условии он появится, только если предмет есть в выбранном комплекте заказа.',
}
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
  reviewerPositionId: null,
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
    positions: [],
    orders: [],
  })
  const [draft, setDraft] = useState(null)
  const [draftBaseline, setDraftBaseline] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [previewOrderId, setPreviewOrderId] = useState('')
  const [previewStaffId, setPreviewStaffId] = useState('')
  const [preview, setPreview] = useState(null)
  usePartyUnsavedChanges(
    Boolean(draft && JSON.stringify(draft) !== draftBaseline),
    { label: 'форма отчёта', scope: activeCompanyId, pending: busy }
  )
  const openDraft = (value) => {
    const next = structuredClone(value)
    setDraft(next)
    setDraftBaseline(JSON.stringify(next))
  }
  useEffect(() => {
    let canceled = false
    const headers = { 'x-partycrm-company-id': activeCompanyId }
    Promise.allSettled(
      [
        '/api/party/report-templates',
        '/api/party/staff',
        '/api/party/services',
        '/api/party/locations',
        '/api/party/inventory',
        '/api/party/roles',
        '/api/party/orders',
      ].map((url) => apiJson(url, { headers }))
    )
      .then((results) => {
        if (canceled) return
        if (results[0].status === 'rejected') throw results[0].reason
        const [
          forms,
          staff,
          services,
          locations,
          inventory,
          positions,
          orders,
        ] = results.map((result) =>
          result.status === 'fulfilled' ? result.value : { data: [] }
        )
        setTemplates(forms.data || [])
        setCatalog({
          staff: staff.data || [],
          services: services.data || [],
          locations: locations.data || [],
          resources: inventory.data?.items || [],
          positions: (positions.data || []).filter(
            (item) => item.active !== false
          ),
          orders: orders.data || [],
        })
        if (results.slice(1).some((result) => result.status === 'rejected'))
          setMessage(
            'Формы загружены. Часть справочников недоступна вашей должности; можно настроить общие вопросы без этих связей.'
          )
      })
      .catch((cause) => {
        if (!canceled) setError(cause.message)
      })
    return () => {
      canceled = true
    }
  }, [activeCompanyId])
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
          fields: draft.fields.map((field) => ({
            ...field,
            reviewerStaffId: null,
          })),
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
  const loadPreview = async () => {
    setBusy(true)
    setError('')
    setPreview(null)
    try {
      const json = await apiJson('/api/party/report-templates/preview', {
        method: 'POST',
        headers: { 'x-partycrm-company-id': activeCompanyId },
        body: JSON.stringify({
          ...draft,
          orderId: previewOrderId,
          staffId: previewStaffId || undefined,
        }),
      })
      setPreview({
        ...json.data,
        source: JSON.stringify(draft),
        orderId: previewOrderId,
        staffId: previewStaffId,
      })
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
    <label
      className="text-sm"
      key={property}
      htmlFor={`report-${field.id}-${property}`}
    >
      {title} <FieldHelp text={help[property]} label={title} />
      <select
        id={`report-${field.id}-${property}`}
        className={control}
        value={field[property] || ''}
        onChange={(event) =>
          editField(index, { [property]: event.target.value || null })
        }
      >
        <option value="">
          {property === 'reviewerPositionId'
            ? 'Владелец / администратор'
            : 'Не выбран'}
        </option>
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
  const previewFresh =
    preview &&
    preview.source === JSON.stringify(draft) &&
    preview.orderId === previewOrderId &&
    preview.staffId === previewStaffId
  const invalidDeadline =
    draft?.dueOffsetMinutes !== null &&
    draft?.dueOffsetMinutes !== undefined &&
    (String(draft.dueOffsetMinutes).trim() === '' ||
      !Number.isInteger(Number(draft.dueOffsetMinutes)) ||
      Math.abs(Number(draft.dueOffsetMinutes)) > 525600)
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        Каждый исполнитель заполняет личный отчёт по сохранённой форме. Вопросы
        — текст с фотографиями; должность проверяющего и условия появления можно
        настроить отдельно.
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
              onClick={() => openDraft(simplePartyReportTemplate)}
            >
              Короткий личный отчёт: два вопроса
            </button>
            <button
              type="button"
              className={button}
              onClick={() =>
                openDraft({
                  title: '',
                  stage: 'before',
                  audience: 'individual',
                  active: true,
                  fields: [emptyField()],
                })
              }
            >
              Новая форма
            </button>
            <button
              type="button"
              className={button}
              onClick={() =>
                openDraft({
                  ...structuredClone(
                    starterPartyReportTemplates.find(
                      (item) => item.stage === 'after'
                    )
                  ),
                  title: 'Командный отчёт координатора',
                  audience: 'team',
                })
              }
            >
              Командный отчёт: взять образец
            </button>
            {starterPartyReportTemplates.map((template) => (
              <button
                key={template.stage}
                type="button"
                className={button}
                onClick={() => openDraft(template)}
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
                  {template.active ? 'Активна' : 'Отключена'} ·{' '}
                  {template.audience === 'team' ? 'Командная' : 'Личная'}
                </p>
              </div>
              <button
                type="button"
                className={button}
                onClick={() => {
                  openDraft(template)
                  setMessage('')
                }}
              >
                Редактировать
              </button>
            </article>
          ))}
        </>
      ) : (
        <fieldset
          disabled={busy}
          aria-label="Редактор формы отчёта"
          className="min-w-0 space-y-4 rounded-xl border border-sky-100 bg-white p-3 sm:p-5"
        >
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
          <label className="block text-sm">
            Кто заполняет
            <select
              className={`${control} cursor-pointer`}
              value={draft.audience || 'individual'}
              disabled={Boolean(draft._id)}
              onChange={(event) =>
                setDraft({ ...draft, audience: event.target.value })
              }
            >
              <option value="individual">
                Каждый исполнитель — личный отчёт
              </option>
              <option value="team">Координатор — командный отчёт</option>
            </select>
          </label>
          <section className="space-y-3 rounded-lg border border-slate-200 p-3">
            <h3 className="font-semibold">
              Срок и обязательность отчёта{' '}
              <FieldHelp
                label="срок и обязательность"
                text="Срок отсчитывается от начала или окончания заказа. Просрочка видна исполнителю. Ограничения закрытия и выплаты включаются независимо и снимаются после принятия отчёта."
              />
            </h3>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="cursor-pointer"
                checked={
                  draft.dueOffsetMinutes !== null &&
                  draft.dueOffsetMinutes !== undefined
                }
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    dueOffsetMinutes: event.target.checked
                      ? draft.stage === 'before'
                        ? -120
                        : 1440
                      : null,
                  })
                }
              />
              Установить срок сдачи
            </label>
            {draft.dueOffsetMinutes !== null &&
              draft.dueOffsetMinutes !== undefined && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-sm" htmlFor="report-due-offset">
                    Смещение, минут{' '}
                    <FieldHelp
                      label="смещение срока"
                      text="Отрицательное число — до выбранного момента, положительное — после. Например: −120 — за два часа, 1440 — через сутки."
                    />
                    <input
                      id="report-due-offset"
                      type="number"
                      min={-525600}
                      max={525600}
                      step={1}
                      className={control}
                      value={draft.dueOffsetMinutes}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          dueOffsetMinutes: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="text-sm">
                    От какого момента
                    <select
                      className={`${control} cursor-pointer`}
                      value={draft.dueAnchor || 'start'}
                      onChange={(event) =>
                        setDraft({ ...draft, dueAnchor: event.target.value })
                      }
                    >
                      <option value="start">Начало мероприятия</option>
                      <option value="end">Окончание мероприятия</option>
                    </select>
                  </label>
                </div>
              )}
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="cursor-pointer"
                checked={Boolean(draft.blockCloseUntilAccepted)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    blockCloseUntilAccepted: event.target.checked,
                  })
                }
              />
              Не закрывать заказ до принятия отчёта
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="cursor-pointer"
                disabled={draft.audience === 'team'}
                checked={Boolean(draft.blockPayoutUntilAccepted)}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    blockPayoutUntilAccepted: event.target.checked,
                  })
                }
              />
              Не выплачивать автору до принятия его личного отчёта{' '}
              <FieldHelp
                label="блокировка выплаты"
                text="Ограничение действует только на выплату автору этого личного отчёта. Отчёты других участников и командный отчёт его выплату не блокируют."
              />
            </label>
          </section>
          {draft.audience === 'team' && (
            <p className="text-sm text-slate-600">
              Координатор назначается в заказе. Он заполняет общий отчёт по
              команде; личные финансовые расчёты исполнителей оформляются
              отдельно. Тип опубликованной формы изменить нельзя — создайте
              новую.
            </p>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.active}
              onChange={(event) =>
                setDraft({ ...draft, active: event.target.checked })
              }
            />
            Доступна для новых отчётов
            <FieldHelp
              label="активность формы"
              text="Выключенная форма не предлагается для новых отчётов. Уже начатые отчёты сохраняются со своими вопросами, сроком и ограничениями."
            />
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
                  'reviewerPositionId',
                  'Должность проверяющего',
                  catalog.positions
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
                    onChange={(event) =>
                      editField(index, { applyWhenBound: event.target.checked })
                    }
                  />
                  Показывать только при совпадении выбранных связей
                  <FieldHelp
                    label="условие появления вопроса"
                    text="Если выключено, вопрос виден всегда. Если включено, все выбранные связи должны совпасть с заказом. Без подходящих вопросов вся форма недоступна. Уже начатый отчёт сохраняет свой набор вопросов."
                  />
                </label>
                <p className="text-xs text-slate-600">
                  {field.applyWhenBound
                    ? 'Поле попадёт в новый отчёт, если заказ содержит выбранную услугу, проходит на выбранной площадке и включает выбранный реквизит. Все заполненные связи должны совпасть. Проверяющий на это условие не влияет.'
                    : 'Поле показывается во всех отчётах этой формы. Связи указывают, к чему относится ответ.'}
                </p>
                {field.applyWhenBound && (
                  <p className="text-xs text-slate-600">
                    Подходящие поля определяются при создании отчёта. Изменения
                    заказа не меняют уже начатый отчёт.
                  </p>
                )}
                {field.applyWhenBound &&
                  !field.serviceId &&
                  !field.locationId &&
                  !field.resourceId && (
                    <p className="text-xs text-amber-800">
                      Выберите хотя бы одну связь: услугу, площадку или
                      реквизит.
                    </p>
                  )}
                {field.applyWhenBound && field.resourceId && (
                  <p className="text-xs text-slate-600">
                    Реквизит берётся из выбранного комплекта заказа. До
                    мероприятия нужен активный резерв; после учитывается и
                    освобождённый комплект оставшихся в заказе услуг.
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
                    onChange={(event) =>
                      editField(index, { requiredMedia: event.target.checked })
                    }
                  />
                  Обязательна фотография
                  <FieldHelp
                    label="обязательная фотография"
                    text="Для отправки нужна хотя бы одна фотография в этом ответе. Один текст или ссылка на сторонний файл не заменяют фото."
                  />
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="cursor-pointer"
                    checked={Boolean(field.allowNotApplicable)}
                    onChange={(event) =>
                      editField(index, {
                        allowNotApplicable: event.target.checked,
                      })
                    }
                  />
                  Разрешить «не применимо» с причиной
                  <FieldHelp
                    label="не применимо"
                    text="Исполнитель сможет пропустить этот вопрос, написав причину. Причина обязательна; фотография и текст самого ответа в этом случае не требуются."
                  />
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
                    <FieldHelp
                      label="общая творческая библиотека"
                      text="После принятия ответ попадёт в библиотеку опыта компании. Финансовые ответы в общую библиотеку не попадают."
                    />
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
          <section className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/50 p-3">
            <h3 className="font-semibold">
              Предпросмотр для заказа{' '}
              <FieldHelp
                label="предпросмотр отчёта"
                text="Выберите реальный заказ: система применит условия услуги, площадки и реквизита и покажет вопросы исполнителя. Предпросмотр не создаёт отчёт и не сохраняет изменения формы."
              />
            </h3>
            <label className="block text-sm">
              Заказ
              <select
                className={`${control} cursor-pointer`}
                value={previewOrderId}
                onChange={(event) => setPreviewOrderId(event.target.value)}
              >
                <option value="">Выберите заказ</option>
                {catalog.orders.map((order) => (
                  <option key={order._id} value={order._id}>
                    {order.title || order.serviceTitle || 'Заказ'}
                    {order.eventDate
                      ? ` · ${new Date(order.eventDate).toLocaleDateString('ru-RU')}`
                      : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              От чьего лица
              <select
                className={`${control} cursor-pointer`}
                value={previewStaffId}
                onChange={(event) => setPreviewStaffId(event.target.value)}
              >
                <option value="">
                  Все вопросы — без ограничения по должности
                </option>
                {catalog.staff
                  .filter((person) => person.status === 'active')
                  .map((person) => (
                    <option key={person._id} value={person._id}>
                      {[person.firstName, person.secondName]
                        .filter(Boolean)
                        .join(' ') || person._id}
                    </option>
                  ))}
              </select>
            </label>
            <button
              type="button"
              className={button}
              disabled={
                busy ||
                !previewOrderId ||
                !draft.fields.length ||
                draft.fields.some((field) => !field.label.trim())
              }
              onClick={loadPreview}
            >
              Показать вопросы исполнителя
            </button>
            {previewFresh ? (
              <div className="space-y-3">
                <p className="text-sm font-semibold">
                  {preview.order.title}
                  {preview.dueAt
                    ? ` · Сдать до ${new Date(preview.dueAt).toLocaleString('ru-RU')}`
                    : ''}
                </p>
                {!preview.fields.some((field) => field.applicable) && (
                  <p role="status" className="text-sm text-amber-800">
                    Нет доступных вопросов: проверьте условия и права должности.
                    Исполнителю эта форма не будет доступна.
                  </p>
                )}
                {preview.fields.map((field) => (
                  <div
                    key={field.id}
                    className={`rounded-lg border bg-white p-3 ${field.applicable ? 'border-slate-200' : 'border-dashed border-amber-300'}`}
                  >
                    <p className="text-sm font-semibold">
                      {field.label}
                      {field.required || field.requiredMedia ? ' *' : ''}
                    </p>
                    {field.applicable ? (
                      <>
                        <p className="mt-1 text-sm text-slate-500">
                          {field.instruction ||
                            'Ответ — текст с возможностью добавить фотографии.'}
                        </p>
                        <textarea
                          disabled
                          aria-label={`Предпросмотр: ${field.label}`}
                          rows={2}
                          className={`${control} resize-none bg-slate-50`}
                          placeholder="Здесь исполнитель напишет ответ"
                        />
                      </>
                    ) : (
                      <p className="mt-1 text-sm text-amber-800">
                        Не показывается: {field.exclusionReason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : preview ? (
              <p className="text-sm text-slate-600">
                Форма или заказ изменились. Обновите предпросмотр.
              </p>
            ) : null}
          </section>
          <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              className={`${button} bg-sky-50`}
              disabled={
                busy ||
                invalidDeadline ||
                !draft.title.trim() ||
                !draft.fields.length ||
                draft.fields.some(
                  (field) =>
                    !field.label.trim() ||
                    (field.applyWhenBound &&
                      !field.serviceId &&
                      !field.locationId &&
                      !field.resourceId)
                )
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
        </fieldset>
      )}
    </div>
  )
}
