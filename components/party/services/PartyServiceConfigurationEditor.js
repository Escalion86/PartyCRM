'use client'

import { useId, useRef, useState } from 'react'
import FieldHelp from '@components/FieldHelp'
import Modal from '@components/Modal'
import {
  editablePartyServiceConfiguration,
  normalizePartyServiceConfiguration,
  normalizePartyServiceOptions,
  normalizePartyServiceRanges,
} from '@helpers/partyServiceConfiguration'
import { getFormSnapshot } from '@helpers/useUnsavedChanges'

const types = {
  number: { label: 'Число', description: 'Ввод количества с расчётом за единицу.' },
  ranges: { label: 'Диапазоны', description: 'Ввод числа с отдельными правилами для каждого диапазона.' },
  select: { label: 'Список', description: 'Выбор одного варианта.' },
  checkboxes: { label: 'Галочки', description: 'Выбор нескольких вариантов.' },
}
const fieldLimit = 60
const itemLimit = 50
const numericLimit = 100000
const durationLimit = 10080
const inputClass =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 placeholder:text-slate-600 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-700 sm:text-sm'
const actionClass =
  'min-h-11 cursor-pointer rounded-md px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-60'
const secondaryButton = `${actionClass} border border-slate-300 text-slate-800 hover:bg-slate-50`
const primaryButton = `${actionClass} bg-sky-700 text-white hover:bg-sky-800`
const inlineButton = `${actionClass} text-sky-800 hover:bg-sky-50`

const rangeHelp = {
  min: 'Первое значение, к которому применяется диапазон. Например, для диапазона 11–20 укажите 11.',
  max: 'Последнее значение диапазона включительно. Если оставить поле пустым, диапазон будет действовать для больших значений без заданной верхней границы.',
  includedUnits: 'Сколько единиц покрывает цена диапазона. Если включено 10 единиц и в заказе указано 12, доплата будет за 2. Если поле пустое, ставка начинает действовать с первого положительного значения диапазона. При нуле ставка применяется ко всему количеству.',
  pricePerUnit: 'Доплата за каждую единицу сверх включённых. При 12 единицах, из которых 10 включены, ставка 150 ₽ добавит 300 ₽. Если оставить поле пустым, доплата равна нулю.',
  maxPrice: 'Ограничивает сумму по диапазону вместе с доплатой. Например, 5 900 ₽ и доплата 300 ₽ дают 6 200 ₽. При пределе 6 000 ₽ диапазон даст 6 000 ₽, после чего применятся остальные параметры. Оставьте поле пустым, если предел не нужен.',
}

const priceChangeHelp = 'Сумма, на которую меняется цена одного выполнения услуги. Положительное значение добавляет к цене, отрицательное уменьшает её. Пустое поле даёт 0 ₽.'
const durationChangeHelp = 'Количество минут, на которое меняется длительность одного выполнения. Положительное значение продлевает услугу, отрицательное сокращает. Пустое поле даёт 0 минут.'

const newOption = () => ({ id: crypto.randomUUID(), title: '', priceDelta: '', durationDelta: '' })
const numericType = (type) => type === 'number' || type === 'ranges'
const newField = (type) => ({
  id: crypto.randomUUID(),
  type,
  title: '',
  required: numericType(type),
  ...(numericType(type) ? { unit: '', allowDecimal: false } : {}),
  ...(type === 'ranges' ? { mode: 'adjustment', tiers: [] } : {}),
  ...(!numericType(type) ? { options: [] } : {}),
})
const replaceAt = (items, index, next) => items.map((item, position) => position === index ? next : item)
const removeAt = (items, index) => items.filter((_, position) => position !== index)

function FieldLabel({ id, label, help }) {
  return (
    <div className="flex min-w-0 items-center gap-1 text-sm font-medium text-slate-700">
      <label htmlFor={id} className="min-w-0 [overflow-wrap:anywhere]">{label}</label>
      {help && <FieldHelp label={label} text={help} />}
    </div>
  )
}

function TextField({ label, help, value, onChange, inputRef, placeholder, maxLength = 180 }) {
  const id = useId()
  return (
    <div className="min-w-0">
      <FieldLabel id={id} label={label} help={help} />
      <input
        id={id}
        className={inputClass}
        required
        maxLength={maxLength}
        placeholder={placeholder}
        ref={inputRef}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function NumberField({ label, help, value, onChange, min, max, step = 1, placeholder, required, inputRef }) {
  const id = useId()
  return (
    <div className="flex min-w-0 flex-col justify-between">
      <FieldLabel id={id} label={label} help={help} />
      <input
        id={id}
        className={inputClass}
        type="number"
        inputMode={step === 1 ? 'numeric' : 'decimal'}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        required={required}
        ref={inputRef}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  )
}

function Checkbox({ checked, onChange, children, help }) {
  return (
    <div className="flex items-center gap-1">
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-800">
        <input className="size-4 shrink-0 cursor-pointer accent-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
        {children}
      </label>
      {help && <FieldHelp label={children} text={help} />}
    </div>
  )
}

function RemoveButton({ label, onClick }) {
  return (
    <button type="button" className={`${actionClass} text-red-800 hover:bg-red-50`} aria-label={label} onClick={onClick}>
      Удалить
    </button>
  )
}

function NumericRules({ draft, change, priceOnly }) {
  const step = draft.allowDecimal ? 0.01 : 1
  return (
    <div className="grid grid-cols-2 gap-3">
      <NumberField label="Минимум" help="Наименьшее допустимое значение в заказе. Если оставить поле пустым, минимум равен нулю."
        min={0} max={numericLimit} step={step} value={draft.min} onChange={change('min')} />
      <NumberField label="Максимум" help="Наибольшее допустимое значение в заказе. Оставьте поле пустым, если для этого параметра не нужен свой предел."
        min={0} max={numericLimit} step={step} value={draft.max} onChange={change('max')} />
      <NumberField label="Цена за единицу, ₽" help="Цена меняется на эту сумму за каждую введённую единицу. Например, 3 единицы по 150 ₽ добавят 450 ₽. Отрицательная ставка уменьшает цену."
        step={0.01} placeholder="0" value={draft.pricePerUnit} onChange={change('pricePerUnit')} />
      {!priceOnly && <NumberField label="Минут за единицу" help="На сколько минут меняется длительность за одну единицу. Например, 3 единицы по 5 минут добавят 15 минут. Отрицательная ставка сокращает длительность."
        min={-durationLimit} max={durationLimit} placeholder="0" value={draft.durationPerUnit} onChange={change('durationPerUnit')} />}
    </div>
  )
}

const numberFormat = new Intl.NumberFormat('ru-RU')
const numberText = (value) => numberFormat.format(value)
const changeText = (value, unit) => (value > 0 ? '+' : '') + numberText(value ?? 0) + ' ' + unit
const cardListClass = 'grid gap-2 sm:grid-cols-2'

function ConfigurationCard({ title, summary, details, editLabel, removeLabel, onEdit, onRemove }) {
  return (
    <li className="flex min-w-0 flex-col justify-between gap-2 rounded-xl border border-slate-200 px-3 pt-3 pb-1">
      <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
        <p className="text-sm font-semibold text-slate-900">{title}</p>
        <p className="text-sm text-slate-700">{summary}</p>
        {details && <p className="text-xs text-slate-600">{details}</p>}
      </div>
      <div className="flex flex-wrap gap-x-1">
        <button type="button" className={inlineButton} aria-label={editLabel} aria-haspopup="dialog" onClick={onEdit}>
          Редактировать
        </button>
        <RemoveButton label={removeLabel} onClick={onRemove} />
      </div>
    </li>
  )
}

function newRange(tiers, allowDecimal) {
  const lastMax = tiers.at(-1)?.max
  const nextMin = lastMax == null ? '' : Math.round((lastMax + (allowDecimal ? 0.01 : 1)) * 100) / 100
  return { min: tiers.length ? (nextMin <= numericLimit ? nextMin : '') : 0 }
}

function RangeRules({ draft, change, baseInUse, openRule, removeRule, addRef, priceOnly }) {
  const { tiers, mode, unit } = draft
  const isBase = mode === 'base'
  const modeId = useId()
  return (
    <>
      <div>
        <FieldLabel id={modeId} label="Как применяется диапазон"
          help={priceOnly
            ? 'Диапазон может задать базовую цену или изменить её на указанную сумму. Базовую цену может задавать только один параметр в этом разделе.'
            : 'Диапазон может задать базовую цену и длительность или добавить к ним свои значения. Базовые значения может задавать только один параметр услуги.'} />
        <select id={modeId} className={inputClass + ' cursor-pointer'} value={mode ?? 'adjustment'} onChange={(event) => change('mode')(event.target.value)}>
          <option value="adjustment">{priceOnly ? 'Изменяет цену' : 'Изменяет цену и длительность'}</option>
          <option value="base" disabled={baseInUse}>{priceOnly ? 'Задаёт базовую цену' : 'Задаёт базовую цену и длительность'}</option>
        </select>
      </div>
      {baseInUse && <p className="text-sm text-slate-600">{priceOnly ? 'Базовую цену задаёт другой параметр.' : 'Базовую цену и длительность задаёт другой параметр.'}</p>}
      {tiers.length > 0 && (
        <ul aria-label="Диапазоны" className={cardListClass}>
          {tiers.map((tier, index) => {
            const lower = numberText(tier.min)
            const boundary = tier.max == null ? 'От ' + lower : lower + '–' + numberText(tier.max)
            const price = isBase ? (tier.price == null ? (priceOnly ? 'Базовая цена' : 'Цена услуги') : numberText(tier.price) + ' ₽') : changeText(tier.price, '₽')
            const duration = isBase ? (tier.durationMinutes == null ? 'Длительность услуги' : numberText(tier.durationMinutes) + ' мин') : changeText(tier.durationMinutes, 'мин')
            const details = [
              tier.pricePerUnit ? changeText(tier.pricePerUnit, '₽') + ' за единицу сверх включённых' : '',
              tier.includedUnits != null ? 'Включено ' + numberText(tier.includedUnits) : '',
              tier.maxPrice != null ? 'До ' + numberText(tier.maxPrice) + ' ₽' : '',
            ].filter(Boolean).join(' · ')
            return (
              <ConfigurationCard
                key={tier.min}
                title={[boundary, unit.trim()].filter(Boolean).join(' ')}
                summary={priceOnly ? price : price + ' · ' + duration}
                details={details}
                editLabel={'Редактировать диапазон ' + (index + 1)}
                removeLabel={'Удалить диапазон ' + (index + 1)}
                onEdit={(event) => openRule(event, index)}
                onRemove={() => removeRule(index)}
              />
            )
          })}
        </ul>
      )}
      <button type="button" ref={addRef} className={secondaryButton} aria-haspopup="dialog" disabled={tiers.length >= itemLimit} onClick={openRule}>
        Добавить диапазон
      </button>
    </>
  )
}

function ChoiceRules({ options, openRule, removeRule, addRef, priceOnly }) {
  return (
    <>
      {options.length > 0 && (
        <ul aria-label="Варианты" className={cardListClass}>
          {options.map((option, index) => (
            <ConfigurationCard
              key={option.id}
              title={option.title}
              summary={priceOnly ? changeText(option.priceDelta, '₽') : changeText(option.priceDelta, '₽') + ' · ' + changeText(option.durationDelta, 'мин')}
              editLabel={'Редактировать вариант ' + option.title}
              removeLabel={'Удалить вариант ' + option.title}
              onEdit={(event) => openRule(event, index)}
              onRemove={() => removeRule(index)}
            />
          ))}
        </ul>
      )}
      <button type="button" ref={addRef} className={secondaryButton} aria-haspopup="dialog" disabled={options.length >= itemLimit} onClick={openRule}>
        Добавить вариант
      </button>
    </>
  )
}

function RangeFields({ range, change, field, firstInput, priceOnly }) {
  const isBase = field.mode === 'base'
  const step = field.allowDecimal ? 0.01 : 1
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="От" help={rangeHelp.min} inputRef={firstInput} required min={0} max={numericLimit} step={step} value={range.min} onChange={change('min')} />
        <NumberField label="До" help={rangeHelp.max} min={0} max={numericLimit} step={step} placeholder="И больше" value={range.max} onChange={change('max')} />
        <NumberField label={isBase ? 'Цена диапазона, ₽' : 'Изменение цены, ₽'} min={isBase ? 0 : undefined} step={0.01}
          help={priceOnly ? (isBase ? 'Базовое значение для этого диапазона.' : 'Сумма, на которую диапазон меняет базовую цену.')
            : isBase ? 'Базовая цена услуги для этого диапазона. Если оставить поле пустым, берётся цена из карточки услуги.' : priceChangeHelp}
          placeholder={isBase ? 'Базовая' : '0'} value={range.price} onChange={change('price')} />
        {!priceOnly && <NumberField label={isBase ? 'Длительность, мин' : 'Изменение длительности, мин'} min={isBase ? 0 : -durationLimit} max={durationLimit}
          help={isBase ? 'Базовая длительность услуги для этого диапазона. Если оставить поле пустым, берётся длительность из карточки услуги.' : durationChangeHelp}
          placeholder={isBase ? 'Базовая' : '0'} value={range.durationMinutes} onChange={change('durationMinutes')} />}
      </div>
      <div className="grid grid-cols-2 gap-3 border-t border-slate-200 pt-3 sm:grid-cols-3">
        <NumberField label="Включено единиц" help={rangeHelp.includedUnits} min={0} max={numericLimit} step={step} value={range.includedUnits} onChange={change('includedUnits')} />
        <NumberField label="За единицу сверх включённых, ₽" help={rangeHelp.pricePerUnit} min={isBase ? 0 : undefined} step={0.01} value={range.pricePerUnit} onChange={change('pricePerUnit')} />
        <NumberField label="Предел цены диапазона, ₽" help={rangeHelp.maxPrice} min={0} step={0.01} value={range.maxPrice} onChange={change('maxPrice')} />
      </div>
    </div>
  )
}

function RuleModal({ field, entry, onClose, onSave, priceOnly }) {
  const [draft, setDraft] = useState(entry.initial)
  const [error, setError] = useState('')
  const firstInput = useRef(null)
  const errorRef = useRef(null)
  const range = field.type === 'ranges'
  const ruleName = range ? 'диапазон' : 'вариант'
  const editing = entry.index != null
  const change = (key) => (value) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setError('')
  }
  const save = () => {
    try {
      const current = range ? field.tiers : field.options
      const next = editing ? replaceAt(current, entry.index, draft) : [...current, draft]
      onSave(range
        ? normalizePartyServiceRanges(next, { ...field, title: field.title.trim() || 'Диапазоны' })
        : normalizePartyServiceOptions(next))
    } catch (cause) {
      setError(cause.message || 'Проверьте значения')
      requestAnimationFrame(() => errorRef.current?.focus())
    }
  }
  return (
    <Modal open tone="party" size="lg" title={(editing ? 'Редактировать ' : 'Добавить ') + ruleName}
      initialFocusRef={firstInput} onClose={onClose}
      hasUnsavedChanges={getFormSnapshot(entry.initial) !== getFormSnapshot(draft)}
      footer={({ requestClose }) => (
        <div className="w-full space-y-2">
          {error && <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className={secondaryButton} onClick={requestClose}>Отмена</button>
            <button type="button" className={primaryButton} onClick={save}>Сохранить {ruleName}</button>
          </div>
        </div>
      )}
    >
      {range ? <RangeFields range={draft} change={change} field={field} firstInput={firstInput} priceOnly={priceOnly} /> : (
        <div className="space-y-3">
          <TextField label="Название варианта" inputRef={firstInput} value={draft.title} onChange={change('title')} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Изменение цены, ₽" help={priceOnly ? 'Сумма, на которую этот вариант меняет цену аренды в текущем разделе.' : priceChangeHelp} step={0.01} placeholder="0" value={draft.priceDelta} onChange={change('priceDelta')} />
            {!priceOnly && <NumberField label="Изменение длительности, мин" help={durationChangeHelp} min={-durationLimit} max={durationLimit} placeholder="0" value={draft.durationDelta} onChange={change('durationDelta')} />}
          </div>
        </div>
      )}
    </Modal>
  )
}

export default function PartyServiceConfigurationEditor({ value, onChange, disabled, onDialogOpenChange, priceOnly = false, title = 'Параметры расчёта' }) {
  const { fields } = editablePartyServiceConfiguration(value)
  const [editor, setEditor] = useState(null)
  const [ruleEditor, setRuleEditor] = useState(null)
  const [error, setError] = useState('')
  const initialFocus = useRef(null)
  const titleField = useRef(null)
  const trigger = useRef(null)
  const addParameter = useRef(null)
  const addRule = useRef(null)
  const ruleTrigger = useRef(null)
  const errorRef = useRef(null)
  const draft = editor?.draft
  const editing = editor?.index != null
  const choosingType = editor?.choosingType
  const ruleKey = draft?.type === 'ranges' ? 'tiers' : 'options'

  const open = (event, index = null) => {
    const initial = fields[index] ?? null
    trigger.current = event.currentTarget
    setError('')
    setEditor({ index, initial, draft: initial, choosingType: !initial })
    onDialogOpenChange?.(true)
  }
  const close = () => {
    setEditor(null)
    onDialogOpenChange?.(false)
    requestAnimationFrame(() => trigger.current?.focus())
  }
  const choose = (type) => {
    const next = draft?.type === type ? draft : newField(type)
    setEditor({ ...editor, initial: next === draft ? editor.initial : next, draft: next, choosingType: false })
    requestAnimationFrame(() => titleField.current?.focus())
  }
  const change = (key) => (next) => {
    setError('')
    setEditor((current) => ({ ...current, draft: { ...current.draft, [key]: next } }))
  }
  const openRule = (event, index = null) => {
    ruleTrigger.current = event.currentTarget
    const initial = index == null
      ? ruleKey === 'tiers' ? newRange(draft.tiers, draft.allowDecimal) : newOption()
      : draft[ruleKey][index]
    setRuleEditor({ index, initial })
  }
  const focusRuleAdd = () => {
    const target = addRule.current?.disabled ? titleField.current || initialFocus.current : addRule.current
    target?.focus()
  }
  const closeRule = () => {
    setRuleEditor(null)
    requestAnimationFrame(() => {
      const previous = ruleTrigger.current
      if (previous?.isConnected && !previous.disabled) previous.focus()
      else focusRuleAdd()
    })
  }
  const removeRule = (index) => {
    change(ruleKey)(removeAt(draft[ruleKey], index))
    requestAnimationFrame(focusRuleAdd)
  }
  const save = () => {
    try {
      const next = editing ? replaceAt(fields, editor.index, draft) : [...fields, draft]
      onChange(normalizePartyServiceConfiguration({ fields: next }))
      close()
    } catch (cause) {
      setError(cause.message || 'Проверьте настройки параметра')
      requestAnimationFrame(() => errorRef.current?.focus())
    }
  }
  const baseInUse = fields.some((field) => field.id !== draft?.id && field.type === 'ranges' && field.mode === 'base')

  return (
    <>
      <fieldset disabled={disabled} className="mt-4 min-w-0 space-y-3 border-t border-slate-200 pt-4">
        <legend className="text-sm font-semibold text-slate-900">{title}</legend>
        {fields.length > 0 && (
          <ul aria-label="Настроенные параметры" className={cardListClass}>
            {fields.map((field, index) => (
              <ConfigurationCard
                key={field.id}
                title={field.title}
                summary={[types[field.type]?.label, field.unit].filter(Boolean).join(' · ')}
                details={field.tiers ? `Диапазонов: ${field.tiers.length}` : field.options ? `Вариантов: ${field.options.length}` : ''}
                editLabel={`Редактировать параметр ${field.title}`}
                removeLabel={`Удалить параметр ${field.title}`}
                onEdit={(event) => open(event, index)}
                onRemove={() => {
                  const next = removeAt(fields, index)
                  onChange(next.length ? { fields: next } : null)
                  requestAnimationFrame(() => addParameter.current?.focus())
                }}
              />
            ))}
          </ul>
        )}
        <button type="button" ref={addParameter} className={secondaryButton} disabled={fields.length >= fieldLimit} aria-haspopup="dialog" onClick={open}>
          Добавить параметр
        </button>
      </fieldset>
      {editor && (
        <Modal open tone="party" size="2xl" title={editing ? 'Редактировать параметр' : 'Добавить параметр'}
          initialFocusRef={initialFocus} onClose={close} inactive={Boolean(ruleEditor)}
          hasUnsavedChanges={getFormSnapshot(editor.initial) !== getFormSnapshot(draft)}
          footer={({ requestClose }) => (
            <div className="w-full space-y-2">
              {error && <p ref={errorRef} tabIndex={-1} role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
              <div className="flex flex-wrap justify-end gap-2">
                <button type="button" className={secondaryButton} onClick={requestClose}>Отмена</button>
                {!choosingType && <button type="button" className={primaryButton} onClick={save}>Сохранить параметр</button>}
              </div>
            </div>
          )}
        >
          {choosingType ? (
            <div className="grid gap-2 sm:grid-cols-2" aria-label="Тип параметра" role="group">
              {Object.entries(types).map(([type, { label, description }], index) => (
                <button type="button" ref={index === 0 ? initialFocus : undefined} key={type} onClick={() => choose(type)}
                  className="min-h-11 cursor-pointer rounded-lg border border-slate-200 px-3 py-3 text-start hover:border-sky-400 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-sky-700">
                  <span className="block text-sm font-semibold text-slate-900">{label}</span>
                  <span className="mt-1 block text-sm text-slate-600">{description}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {!editing && <button type="button" className={inlineButton} onClick={() => {
                setError('')
                setEditor({ ...editor, choosingType: true })
                requestAnimationFrame(() => initialFocus.current?.focus())
              }}>Назад к типам</button>}
              <TextField label="Название параметра" inputRef={editing ? initialFocus : titleField} value={draft.title} onChange={change('title')} />
              {numericType(draft.type) && (
                <TextField label="Единица измерения" help="Подпись рядом с числом в заказе. Например, чел., км или ч."
                  maxLength={80} placeholder="Например, человек или км" value={draft.unit} onChange={change('unit')} />
              )}
              <div className="flex flex-wrap gap-x-5">
                <Checkbox checked={draft.required} onChange={change('required')}
                  help="Оператор должен заполнить поле при оформлении заказа. Для группы галочек достаточно выбрать хотя бы один вариант.">Обязательный параметр</Checkbox>
                {numericType(draft.type) && <Checkbox checked={draft.allowDecimal} onChange={change('allowDecimal')}
                  help="Позволяет вводить значения с точностью до двух знаков после запятой, например 2,5 часа.">Разрешены дробные значения</Checkbox>}
              </div>
              {draft.type === 'number' && <NumericRules draft={draft} change={change} priceOnly={priceOnly} />}
              {draft.type === 'ranges' && <RangeRules draft={draft} change={change} baseInUse={baseInUse} openRule={openRule} removeRule={removeRule} addRef={addRule} priceOnly={priceOnly} />}
              {!numericType(draft.type) && <ChoiceRules options={draft.options} openRule={openRule} removeRule={removeRule} addRef={addRule} priceOnly={priceOnly} />}
            </div>
          )}
        </Modal>
      )}
      {ruleEditor && (
        <RuleModal entry={ruleEditor} field={draft} priceOnly={priceOnly} onClose={closeRule} onSave={(rules) => {
          change(ruleKey)(rules)
          closeRule()
        }} />
      )}
    </>
  )
}
