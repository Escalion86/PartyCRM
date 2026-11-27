'use client'

import { useId } from 'react'

const input =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 sm:text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 aria-invalid:border-red-700'
const signed = (value) => (value > 0 ? '+' : '−') + Math.abs(value).toLocaleString('ru-RU')
const changes = (option, canPrice) => [
  canPrice && Number(option.priceDelta) ? `${signed(option.priceDelta)} ₽` : '',
  Number(option.durationDelta) ? `${signed(option.durationDelta)} мин` : '',
].filter(Boolean).join(' · ')

export default function PartyOrderServiceParameters({
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
                    className="size-4 shrink-0 cursor-pointer accent-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-default"
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
          className="min-h-11 cursor-pointer rounded-lg border border-sky-200 bg-white px-3 text-sm font-semibold text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
          onClick={() => onChange({ participants: '', addonIds: [], optionIds: {} })}>
          Сбросить параметры
        </button>
      )}
    </fieldset>
  )
}
