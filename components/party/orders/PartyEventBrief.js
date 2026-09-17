'use client'

import Input from '@components/Input'
import Textarea from '@components/Textarea'

const textFields = [
  ['occasion', 'Повод'],
  ['celebrantName', 'Имя именинника'],
  ['guestAgeRange', 'Возраст гостей'],
  ['interests', 'Интересы'],
  ['previousPrograms', 'Предыдущие программы'],
  ['characters', 'Герои'],
  ['costumeOptions', 'Варианты костюмов'],
  ['eventFormat', 'Формат праздника'],
  ['venueConditions', 'Условия площадки'],
  ['cakeAndGifts', 'Торт и подарки'],
  ['wishes', 'Пожелания'],
  ['restrictions', 'Ограничения'],
]

const hasValue = (value) =>
  value !== null && value !== undefined && String(value).trim() !== ''

export const hasPartyEventBrief = (brief) =>
  Boolean(
    brief &&
      [...textFields.map(([field]) => field), 'celebrantAge', 'guestCount'].some(
        (field) => hasValue(brief[field])
      )
  )

const BriefGroup = ({ title, description, children }) => (
  <section className="rounded-xl border border-sky-100 bg-white p-3 sm:p-4">
    <h3 className="font-semibold text-slate-900">{title}</h3>
    {description ? (
      <p className="mt-1 text-sm text-slate-500">{description}</p>
    ) : null}
    <div className="mt-3 grid gap-3 sm:grid-cols-2">{children}</div>
  </section>
)

export function PartyEventBriefEditor({ value = {}, onChange }) {
  const change = (field, nextValue) =>
    onChange({ ...value, [field]: nextValue })

  return (
    <div className="grid gap-3">
      <p className="text-sm text-slate-600">
        Заполните известные детали. Бриф можно дополнять по мере общения с
        клиентом.
      </p>
      <BriefGroup
        title="Гости и повод"
        description="Кто празднует и для какой компании готовим программу."
      >
        <Input
          label="Повод"
          value={value.occasion || ''}
          onChange={(next) => change('occasion', next)}
          placeholder="Например: день рождения"
          fullWidth
          tone="party"
        />
        <Input
          label="Имя именинника"
          value={value.celebrantName || ''}
          onChange={(next) => change('celebrantName', next)}
          fullWidth
          tone="party"
        />
        <Input
          label="Возраст именинника"
          type="number"
          min={0}
          max={120}
          value={value.celebrantAge ?? ''}
          onChange={(next) => change('celebrantAge', next)}
          fullWidth
          tone="party"
        />
        <Input
          label="Количество гостей"
          type="number"
          min={0}
          max={10000}
          value={value.guestCount ?? ''}
          onChange={(next) => change('guestCount', next)}
          fullWidth
          tone="party"
        />
        <div className="sm:col-span-2">
          <Input
            label="Возраст гостей"
            value={value.guestAgeRange || ''}
            onChange={(next) => change('guestAgeRange', next)}
            placeholder="Например: в основном 5–7 лет"
            fullWidth
            tone="party"
          />
        </div>
      </BriefGroup>

      <BriefGroup
        title="Программа и образы"
        description="Что нравится гостям и какие варианты уже обсуждали."
      >
        <Textarea
          label="Интересы"
          value={value.interests || ''}
          onChange={(next) => change('interests', next)}
          rows={3}
          fullWidth
          tone="party"
        />
        <Textarea
          label="Предыдущие программы"
          value={value.previousPrograms || ''}
          onChange={(next) => change('previousPrograms', next)}
          rows={3}
          fullWidth
          tone="party"
        />
        <Textarea
          label="Герои"
          value={value.characters || ''}
          onChange={(next) => change('characters', next)}
          rows={3}
          fullWidth
          tone="party"
        />
        <Textarea
          label="Варианты костюмов"
          value={value.costumeOptions || ''}
          onChange={(next) => change('costumeOptions', next)}
          rows={3}
          fullWidth
          tone="party"
        />
      </BriefGroup>

      <BriefGroup
        title="Формат и важные условия"
        description="Организационные детали, которые должна учесть команда."
      >
        <Textarea
          label="Формат праздника"
          value={value.eventFormat || ''}
          onChange={(next) => change('eventFormat', next)}
          rows={3}
          fullWidth
          tone="party"
        />
        <Textarea
          label="Условия площадки"
          value={value.venueConditions || ''}
          onChange={(next) => change('venueConditions', next)}
          rows={3}
          fullWidth
          tone="party"
        />
        <Textarea
          label="Торт и подарки"
          value={value.cakeAndGifts || ''}
          onChange={(next) => change('cakeAndGifts', next)}
          rows={3}
          fullWidth
          tone="party"
        />
        <Textarea
          label="Пожелания"
          value={value.wishes || ''}
          onChange={(next) => change('wishes', next)}
          rows={3}
          fullWidth
          tone="party"
        />
        <div className="sm:col-span-2">
          <Textarea
            label="Ограничения"
            value={value.restrictions || ''}
            onChange={(next) => change('restrictions', next)}
            placeholder="Аллергии, особенности здоровья, запреты площадки и другие ограничения"
            rows={3}
            fullWidth
            tone="party"
          />
        </div>
      </BriefGroup>
    </div>
  )
}

export function PartyEventBriefView({ value = {} }) {
  const items = [
    ...textFields.slice(0, 2).map(([field, label]) => [label, value[field]]),
    ['Возраст именинника', value.celebrantAge],
    ['Количество гостей', value.guestCount],
    ...textFields.slice(2).map(([field, label]) => [label, value[field]]),
  ].filter(([, content]) => hasValue(content))

  if (!items.length) {
    return <p className="text-sm text-slate-500">Бриф пока не заполнен.</p>
  }

  return (
    <dl className="grid gap-2 sm:grid-cols-2">
      {items.map(([label, content]) => (
        <div
          key={label}
          className="min-w-0 rounded-lg border border-slate-100 bg-slate-50 p-3"
        >
          <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
            {label}
          </dt>
          <dd className="mt-1 text-sm whitespace-pre-wrap break-words text-slate-900">
            {content}
          </dd>
        </div>
      ))}
    </dl>
  )
}
