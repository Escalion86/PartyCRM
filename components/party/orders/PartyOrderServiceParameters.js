'use client'

import { useId } from 'react'

const input =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 aria-invalid:border-red-700'
const checkbox =
  'size-4 shrink-0 cursor-pointer accent-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-default'
const resetButton =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 bg-white px-3 text-sm font-semibold text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700'
const signed = (value) => (value > 0 ? '+' : '−') + Math.abs(value).toLocaleString('ru-RU')
const changes = (option, canPrice) => [
  canPrice && Number(option.priceDelta) ? `${signed(option.priceDelta)} ₽` : '',
  Number(option.durationDelta) ? `${signed(option.durationDelta)} мин` : '',
].filter(Boolean).join(' · ')

const hasValue = (value) => value != null && value !== '' && (!Array.isArray(value) || value.length > 0)
const isValidNumberInput = (value) => (typeof value === 'number' || typeof value === 'string') &&
  Number.isFinite(Number(String(value).replace(',', '.')))
const knownOption = (field, value) => field.options.some((option) => option.id === value)

function CustomServiceField({ field, id, value, error, canPrice, onChange }) {
  const errorId = `${id}-error`
  const errorProps = error ? { 'aria-invalid': true, 'aria-describedby': errorId } : {}
  const errorText = error && <p id={errorId} className="mt-1 text-sm text-red-800">{error}</p>

  if (field.type === 'checkboxes') {
    const selected = Array.isArray(value) ? value.filter((option) => knownOption(field, option)) : []
    return (
      <fieldset className="min-w-0 sm:col-span-full">
        <legend className="text-sm font-medium [overflow-wrap:anywhere]">
          {field.title}{field.required && <span className="ml-1 font-normal text-slate-600">(обязательно)</span>}
        </legend>
        <div className="grid gap-x-3 sm:grid-cols-2">
          {field.options.map((option, index) => {
            const delta = changes(option, canPrice)
            return (
              <label key={option.id} className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 text-sm has-[:disabled]:cursor-default">
                <input
                  type="checkbox"
                  className={checkbox}
                  checked={selected.includes(option.id)}
                  {...(index === 0 ? errorProps : {})}
                  onChange={(event) => onChange(event.target.checked
                    ? [...selected, option.id]
                    : selected.filter((optionId) => optionId !== option.id))}
                />
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {option.title}{delta && <span className="block text-xs text-sky-900">{delta}</span>}
                </span>
              </label>
            )
          })}
        </div>
        {errorText}
      </fieldset>
    )
  }

  if (field.type === 'select') {
    return (
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium [overflow-wrap:anywhere]">{field.title}</label>
        <select
          id={id}
          className={`${input} cursor-pointer`}
          required={field.required}
          value={knownOption(field, value) ? value : ''}
          {...errorProps}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{field.required ? 'Выберите вариант' : 'Без выбора'}</option>
          {field.options.map((option) => {
            const delta = changes(option, canPrice)
            return <option key={option.id} value={option.id}>{option.title}{delta ? ` (${delta})` : ''}</option>
          })}
        </select>
        {errorText}
      </div>
    )
  }

  const tiers = field.type === 'ranges' ? field.tiers : []
  const ranges = tiers.map(({ min, max }) => max == null ? `от ${min}` : `${min}–${max}`)
  const descriptions = [`${id}-unit`, ranges.length ? `${id}-ranges` : '', error ? errorId : ''].filter(Boolean)

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <label htmlFor={id} className="text-sm font-medium [overflow-wrap:anywhere]">{field.title}</label>
        <span id={`${id}-unit`} className="text-xs text-slate-600 [overflow-wrap:anywhere]">{field.unit}</span>
      </div>
      <input
        id={id}
        className={input}
        type="number"
        inputMode={field.allowDecimal ? 'decimal' : 'numeric'}
        min={tiers[0]?.min ?? field.min ?? 0}
        max={tiers.at(-1)?.max ?? field.max ?? 100000}
        step={field.allowDecimal ? '0.01' : 1}
        required={field.required}
        value={isValidNumberInput(value) ? String(value).replace(',', '.') : ''}
        {...errorProps}
        aria-describedby={descriptions.join(' ')}
        onChange={(event) => onChange(event.target.value)}
      />
      {ranges.length > 0 && (
        <p id={`${id}-ranges`} className="mt-1 text-xs text-slate-600">
          Допустимые значения — {ranges.join(', ')}
        </p>
      )}
      {errorText}
    </div>
  )
}

function CustomServiceParameters({ title, configuration, parameters, error, showError, canEdit, canPrice, onChange, subject = 'услуги' }) {
  const id = useId()
  const { fields } = configuration
  const values = parameters.values ?? {}
  const errorField = error?.field?.startsWith('values.') ? error.field.slice(7) : null
  const fieldWithError = fields.find((field) => field.id === errorField) || (!error?.field ? fields[0] : null)
  const activeError = error && (showError || (fieldWithError && hasValue(values[fieldWithError.id])))
  const needsReset = Boolean(error) && (
    !Object.hasOwn(parameters, 'values') || Object.entries(values).some(([fieldId, value]) => {
      const field = fields.find((entry) => entry.id === fieldId)
      if (!field) return true
      if (!hasValue(value)) return false
      if (field.type === 'select') return !knownOption(field, value)
      if (field.type === 'checkboxes') return !Array.isArray(value) || value.some((option) => !knownOption(field, option))
      return !isValidNumberInput(value)
    })
  )

  return (
    <fieldset data-service-parameters disabled={!canEdit} className="min-w-0 space-y-3 border-t border-sky-200 pt-3 sm:col-span-full">
      <legend className="sr-only">Параметры {subject} «{title}»</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((field) => (
          <CustomServiceField
            key={field.id}
            field={field}
            id={`${id}-${field.id}`}
            value={Object.hasOwn(values, field.id) ? values[field.id] : undefined}
            error={activeError && fieldWithError?.id === field.id ? error.message : null}
            canPrice={canPrice}
            onChange={(value) => {
              const next = { ...values, [field.id]: value }
              if (!hasValue(value)) delete next[field.id]
              onChange({ values: next })
            }}
          />
        ))}
      </div>
      {needsReset && !activeError && <p className="text-sm text-red-800">Параметры {subject} изменились в справочнике. Сбросьте прежний выбор.</p>}
      {!fieldWithError && activeError && <p className="text-sm text-red-800">{error.message}</p>}
      {needsReset && canEdit && (
        <button type="button" className={resetButton} onClick={(event) => {
          const controls = event.currentTarget.closest('[data-service-parameters]')
          onChange({ values: {} })
          controls?.querySelector(':is(input, select):not(:disabled)')?.focus()
        }}>
          Сбросить параметры
        </button>
      )}
    </fieldset>
  )
}

function LegacyServiceParameters({
  title,
  configuration,
  parameters,
  error,
  showError,
  canEdit,
  canPrice,
  onChange,
}) {
  const id = useId()
  const participantsRequired = configuration.participantTiers.length > 0
  const invisibleSelection = error && (
    (error.field === 'participants' && !participantsRequired) ||
    error.field === 'optionIds' ||
    error.field === 'addonIds'
  )
  const activeError = error && (showError || (error.field === 'participants' && parameters.participants !== ''))
  const errorProps = (field) => {
    const invalid = activeError && (error.field === field || (!error.field && (
      participantsRequired ? field === 'participants' : field === `optionIds.${configuration.optionGroups[0]?.id}`
    )))
    return invalid ? { 'aria-invalid': true, 'aria-describedby': `${id}-error` } : {}
  }

  return (
    <fieldset data-service-parameters disabled={!canEdit} className="min-w-0 space-y-3 border-t border-sky-200 pt-3 sm:col-span-full">
      <legend className="sr-only">Параметры услуги «{title}»</legend>
      {(participantsRequired || configuration.optionGroups.length > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {participantsRequired && (
            <label className="min-w-0 text-sm font-medium">
              Участники
              <input
                className={input}
                type="number"
                inputMode="numeric"
                min={1}
                max={100000}
                step={1}
                required
                value={parameters.participants ?? ''}
                {...errorProps('participants')}
                onChange={(event) => onChange({ ...parameters, participants: event.target.value })}
              />
            </label>
          )}
          {configuration.optionGroups.map((group) => (
            <label className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]" key={group.id}>
              {group.title}
              <select
                className={`${input} cursor-pointer`}
                required={group.required}
                value={Object.hasOwn(parameters.optionIds || {}, group.id) ? parameters.optionIds[group.id] : ''}
                {...errorProps(`optionIds.${group.id}`)}
                onChange={(event) => {
                  const optionIds = { ...parameters.optionIds, [group.id]: event.target.value }
                  if (!event.target.value) delete optionIds[group.id]
                  onChange({ ...parameters, optionIds })
                }}
              >
                <option value="">{group.required ? 'Выберите вариант' : 'Без выбора'}</option>
                {group.options.map((option) => {
                  const delta = changes(option, canPrice)
                  return <option key={option.id} value={option.id}>{option.title}{delta ? ` (${delta})` : ''}</option>
                })}
              </select>
            </label>
          ))}
        </div>
      )}
      {configuration.addons.length > 0 && (
        <div role="group" aria-labelledby={`${id}-addons`}>
          <p id={`${id}-addons`} className="text-sm font-semibold">Дополнения</p>
          <div className="grid gap-x-3 sm:grid-cols-2">
            {configuration.addons.map((option) => {
              const selected = parameters.addonIds?.includes(option.id)
              const delta = changes(option, canPrice)
              return (
                <label key={option.id} className="flex min-h-11 min-w-0 cursor-pointer items-center gap-2 text-sm has-[:disabled]:cursor-default">
                  <input
                    type="checkbox"
                    className={checkbox}
                    checked={Boolean(selected)}
                    {...errorProps('addonIds')}
                    onChange={(event) => onChange({
                      ...parameters,
                      addonIds: event.target.checked
                        ? [...(parameters.addonIds || []), option.id]
                        : parameters.addonIds.filter((optionId) => optionId !== option.id),
                    })}
                  />
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {option.title}{delta ? <span className="block text-xs text-sky-900">{delta}</span> : null}
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      )}
      {activeError && <p id={`${id}-error`} className="text-sm text-red-800">{error.message}</p>}
      {invisibleSelection && canEdit && (
        <button type="button"
          className={resetButton}
          onClick={() => onChange({ participants: '', addonIds: [], optionIds: {} })}>
          Сбросить параметры
        </button>
      )}
    </fieldset>
  )
}

export default function PartyOrderServiceParameters(props) {
  return Array.isArray(props.configuration.fields) ? <CustomServiceParameters {...props} /> : <LegacyServiceParameters {...props} />
}
