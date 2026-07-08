'use client'

import Input from '@components/Input'
import Textarea from '@components/Textarea'

export default function PartyAddressBlock({
  value,
  onChange,
  title = 'Адрес',
  tone = 'party',
  styleVariant = 'plain',
  labels = {},
  visibleFields = {
    town: true,
    street: true,
    house: true,
    room: true,
    comment: true,
  },
  commentRows = 2,
  commentPlaceholder = '',
  noMargin = false,
}) {
  const blockClassName =
    styleVariant === 'card'
      ? 'rounded-xl border border-sky-100 bg-sky-50/40 p-3'
      : ''

  const getLabel = (key, fallback) => labels[key] || fallback

  return (
    <div className={blockClassName}>
      {title ? (
        <p className="mb-1 text-sm font-semibold text-sky-700">{title}</p>
      ) : null}

      {(visibleFields.town || visibleFields.street) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {visibleFields.town && (
            <Input
              label={getLabel('town', 'Город')}
              value={value?.town || ''}
              onChange={(next) => onChange('town', next)}
              fullWidth
              tone={tone}
              noMargin={noMargin}
            />
          )}
          {visibleFields.street && (
            <Input
              label={getLabel('street', 'Улица')}
              value={value?.street || ''}
              onChange={(next) => onChange('street', next)}
              fullWidth
              tone={tone}
              noMargin={noMargin}
            />
          )}
        </div>
      )}

      {(visibleFields.house || visibleFields.room) && (
        <div className="flex flex-col gap-2 sm:flex-row">
          {visibleFields.house && (
            <Input
              label={getLabel('house', 'Дом')}
              value={value?.house || ''}
              onChange={(next) => onChange('house', next)}
              fullWidth
              tone={tone}
              noMargin={noMargin}
            />
          )}
          {visibleFields.room && (
            <Input
              label={getLabel('room', 'Зал/комната')}
              value={value?.room || ''}
              onChange={(next) => onChange('room', next)}
              fullWidth
              tone={tone}
              noMargin={noMargin}
            />
          )}
        </div>
      )}

      {visibleFields.comment && (
        <Textarea
          label={getLabel('comment', 'Комментарий')}
          value={value?.comment || ''}
          onChange={(next) => onChange('comment', next)}
          fullWidth
          tone={tone}
          noMargin={noMargin}
          rows={commentRows}
          placeholder={commentPlaceholder}
        />
      )}
    </div>
  )
}
