'use client'

const emptyConfiguration = { participantTiers: [], addons: [], optionGroups: [] }
const listLimit = 50
const fieldClass =
  'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-600 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-700'
const buttonClass =
  'min-h-11 cursor-pointer rounded-md px-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-60'

const newChoice = () => ({
  id: crypto.randomUUID(),
  title: '',
  priceDelta: '',
  durationDelta: '',
})

const replaceAt = (items, index, item) =>
  items.map((existing, position) => position === index ? item : existing)
const removeAt = (items, index) =>
  items.filter((_, position) => position !== index)

function NumberField({ label, value, onChange, min, max, step = 1, placeholder, required }) {
  return (
    <label className="flex min-w-0 flex-col justify-between text-sm text-slate-700">
      {label}
      <input
        className={fieldClass}
        type="number"
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        required={required}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function NameField({ label, value, onChange }) {
  return (
    <label className="flex min-w-0 flex-col text-sm text-slate-700">
      {label}
      <input
        className={fieldClass}
        required
        maxLength={180}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function AddButton({ children, onClick, count }) {
  return (
    <button
      className={`${buttonClass} text-sky-800 hover:bg-sky-50`}
      type="button"
      disabled={count >= listLimit}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function RemoveButton({ label, onClick }) {
  return (
    <button
      className={`${buttonClass} text-red-800 hover:bg-red-50`}
      type="button"
      aria-label={label}
      onClick={onClick}
    >
      Удалить
    </button>
  )
}

function ConfigurationSection({ title, count, children }) {
  return (
    <details className="min-w-0">
      <summary className="min-h-11 cursor-pointer rounded-md px-3 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-sky-700">
        {title}
        {count > 0 && (
          <span className="ms-2 font-normal tabular-nums text-slate-600">({count})</span>
        )}
      </summary>
      <div className="space-y-3 px-3 pb-3 pt-1">{children}</div>
    </details>
  )
}

function TierEditor({ tier, index, onChange, onRemove }) {
  const update = (field) => (value) => onChange({ ...tier, [field]: value })
  return (
    <fieldset className="min-w-0 border-t border-slate-200 pt-2">
      <legend className="pe-2 text-sm font-medium text-slate-900">Диапазон {index + 1}</legend>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <NumberField label="От, человек" min={1} max={100000} required value={tier.min} onChange={update('min')} />
        <NumberField label="До, человек" min={1} max={100000} placeholder="Без ограничения" value={tier.max} onChange={update('max')} />
        <NumberField label="Цена диапазона, ₽" min={0} step={0.01} placeholder="Базовая" value={tier.price} onChange={update('price')} />
        <NumberField label="Длительность, мин" min={0} max={10080} placeholder="Базовая" value={tier.durationMinutes} onChange={update('durationMinutes')} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-3">
        <NumberField label="Включено участников" min={0} max={100000} value={tier.includedParticipants} onChange={update('includedParticipants')} />
        <NumberField label="За каждого сверх включённых, ₽" min={0} step={0.01} value={tier.pricePerParticipant} onChange={update('pricePerParticipant')} />
        <NumberField label="Максимум за диапазон, ₽" min={0} step={0.01} value={tier.maxPrice} onChange={update('maxPrice')} />
      </div>
      <div className="mt-1 flex justify-end">
        <RemoveButton label={`Удалить диапазон ${index + 1}`} onClick={onRemove} />
      </div>
    </fieldset>
  )
}

function ChoiceEditor({ choice, label, onChange, onRemove }) {
  const update = (field) => (value) => onChange({ ...choice, [field]: value })
  return (
    <fieldset className="min-w-0 border-t border-slate-200 pt-2">
      <legend className="sr-only">{label}</legend>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-[2fr_1fr_1fr]">
        <div className="col-span-2 lg:col-span-1">
          <NameField label="Название" value={choice.title} onChange={update('title')} />
        </div>
        <NumberField label="Изменение цены, ₽" step={0.01} placeholder="0" value={choice.priceDelta} onChange={update('priceDelta')} />
        <NumberField label="Изменение минут" min={-10080} max={10080} placeholder="0" value={choice.durationDelta} onChange={update('durationDelta')} />
      </div>
      <div className="mt-1 flex justify-end">
        <RemoveButton label={`Удалить ${label.toLowerCase()}`} onClick={onRemove} />
      </div>
    </fieldset>
  )
}

function OptionGroupEditor({ group, index, onChange, onRemove }) {
  const updateOptions = (options) => onChange({ ...group, options })
  return (
    <fieldset className="min-w-0 space-y-2 border-t border-slate-200 pt-2">
      <legend className="pe-2 text-sm font-medium text-slate-900">Список {index + 1}</legend>
      <NameField
        label="Название списка"
        value={group.title}
        onChange={(title) => onChange({ ...group, title })}
      />
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-slate-800">
        <input
          className="size-4 cursor-pointer accent-sky-700"
          type="checkbox"
          checked={group.required}
          onChange={(event) => onChange({ ...group, required: event.target.checked })}
        />
        Обязательно выбрать вариант
      </label>
      <div className="space-y-2 border-s border-slate-200 ps-3">
        {group.options.map((option, position) => (
          <ChoiceEditor
            key={option.id}
            choice={option}
            label={`Вариант ${position + 1}`}
            onChange={(item) => updateOptions(replaceAt(group.options, position, item))}
            onRemove={() => updateOptions(removeAt(group.options, position))}
          />
        ))}
        <AddButton count={group.options.length} onClick={() => updateOptions([...group.options, newChoice()])}>
          Добавить вариант
        </AddButton>
      </div>
      <div className="flex justify-end">
        <RemoveButton label={`Удалить список ${index + 1}`} onClick={onRemove} />
      </div>
    </fieldset>
  )
}

export default function PartyServiceConfigurationEditor({ value, onChange, disabled }) {
  const configuration = value ?? emptyConfiguration
  const { participantTiers, addons, optionGroups } = configuration
  const put = (field, entries) => {
    const next = { ...configuration, [field]: entries }
    onChange(next.participantTiers.length || next.addons.length || next.optionGroups.length ? next : null)
  }
  const addTier = () => {
    const lastMax = participantTiers.at(-1)?.max
    const min = participantTiers.length === 0 ? 1 : ''
    put('participantTiers', [
      ...participantTiers,
      { min: lastMax && Number(lastMax) < 100000 ? Number(lastMax) + 1 : min },
    ])
  }

  return (
    <fieldset disabled={disabled} className="mt-4 min-w-0 border-t border-slate-200 pt-4">
      <legend className="text-sm font-semibold text-slate-900">Параметры расчёта</legend>
      <p className="mb-3 text-sm text-slate-600">Оператор укажет параметры в заказе и увидит итоговую цену и длительность.</p>
      <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
        <ConfigurationSection title="Диапазоны участников" count={participantTiers.length}>
          <p className="text-sm text-slate-600">
            Границы включаются в диапазон. Доплата начисляется за каждого участника сверх включённых. Если число включённых пустое, доплата начинается с нижней границы диапазона.
          </p>
          {participantTiers.map((tier, index) => (
            <TierEditor
              key={index}
              tier={tier}
              index={index}
              onChange={(item) => put('participantTiers', replaceAt(participantTiers, index, item))}
              onRemove={() => put('participantTiers', removeAt(participantTiers, index))}
            />
          ))}
          <AddButton count={participantTiers.length} onClick={addTier}>Добавить диапазон</AddButton>
        </ConfigurationSection>
        <ConfigurationSection title="Дополнения" count={addons.length}>
          <p className="text-sm text-slate-600">В заказе можно отметить несколько дополнений. Изменения цены и длительности складываются.</p>
          {addons.map((addon, index) => (
            <ChoiceEditor
              key={addon.id}
              choice={addon}
              label={`Дополнение ${index + 1}`}
              onChange={(item) => put('addons', replaceAt(addons, index, item))}
              onRemove={() => put('addons', removeAt(addons, index))}
            />
          ))}
          <AddButton count={addons.length} onClick={() => put('addons', [...addons, newChoice()])}>
            Добавить дополнение
          </AddButton>
        </ConfigurationSection>
        <ConfigurationSection title="Списки вариантов" count={optionGroups.length}>
          <p className="text-sm text-slate-600">В заказе можно выбрать один вариант из каждого списка.</p>
          {optionGroups.map((group, index) => (
            <OptionGroupEditor
              key={group.id}
              group={group}
              index={index}
              onChange={(item) => put('optionGroups', replaceAt(optionGroups, index, item))}
              onRemove={() => put('optionGroups', removeAt(optionGroups, index))}
            />
          ))}
          <AddButton count={optionGroups.length} onClick={() => put('optionGroups', [
            ...optionGroups,
            { id: crypto.randomUUID(), title: '', required: false, options: [newChoice()] },
          ])}>
            Добавить список
          </AddButton>
        </ConfigurationSection>
      </div>
    </fieldset>
  )
}
