'use client'

const input =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const button =
  'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 disabled:opacity-50'
const days = [
  'Воскресенье',
  'Понедельник',
  'Вторник',
  'Среда',
  'Четверг',
  'Пятница',
  'Суббота',
]
const blank = () => ({
  week: days.map(() => ({ closed: true, opens: '09:00', closes: '21:00' })),
  exceptions: [],
})
function Window({ value, onChange, label, onRemove, date, onDateChange }) {
  return (
    <fieldset className="grid min-w-0 gap-3 rounded-lg border border-slate-200 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <legend className="px-1 text-sm font-semibold">{label}</legend>
      {onDateChange ? (
        <label className="text-sm">
          Дата
          <input
            type="date"
            className={input}
            value={date || ''}
            onChange={(event) => onDateChange(event.target.value)}
          />
        </label>
      ) : null}
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!value.closed}
          onChange={(event) =>
            onChange({ ...value, closed: !event.target.checked })
          }
        />
        Рабочий день
      </label>
      <label className="text-sm">
        Открытие
        <input
          type="time"
          className={input}
          value={value.opens}
          disabled={value.closed}
          onChange={(event) =>
            onChange({ ...value, opens: event.target.value })
          }
        />
      </label>
      <label className="text-sm">
        Закрытие
        <input
          type="time"
          className={input}
          value={value.closes}
          disabled={value.closed}
          onChange={(event) =>
            onChange({ ...value, closes: event.target.value })
          }
        />
      </label>
      {onRemove ? (
        <button type="button" className={button} onClick={onRemove}>
          Убрать исключение
        </button>
      ) : null}
    </fieldset>
  )
}
export default function PartyWorkingScheduleEditor({
  value,
  onChange,
  disabled = false,
  inheritLabel = 'Использовать график компании',
  enableLabel,
}) {
  return (
    <fieldset className="min-w-0 space-y-3" disabled={disabled}>
      {enableLabel && value == null ? (
        <button type="button" className={button} onClick={() => onChange(blank())}>{enableLabel}</button>
      ) : <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
        <input
          type="checkbox"
          checked={value == null}
          onChange={(event) => onChange(event.target.checked ? null : blank())}
        />
        {inheritLabel}
      </label>}
      {value ? (
        <>
          <p className="text-xs text-slate-600">
            Отметьте рабочие дни и часы. Буферы подготовки и уборки тоже должны
            помещаться в график.
          </p>
          {days.map((day, index) => (
            <Window
              key={day}
              label={day}
              value={value.week[index]}
              onChange={(next) =>
                onChange({
                  ...value,
                  week: value.week.map((entry, position) =>
                    position === index ? next : entry
                  ),
                })
              }
            />
          ))}
          <h3 className="pt-2 text-sm font-semibold">
            Исключения на конкретные даты
          </h3>
          {(value.exceptions || []).map((entry, index) => (
            <Window
              key={index}
              label={`Исключение ${index + 1}`}
              value={entry}
              date={entry.date}
              onDateChange={(date) =>
                onChange({
                  ...value,
                  exceptions: value.exceptions.map((item, position) =>
                    position === index ? { ...item, date } : item
                  ),
                })
              }
              onChange={(next) =>
                onChange({
                  ...value,
                  exceptions: value.exceptions.map((item, position) =>
                    position === index ? next : item
                  ),
                })
              }
              onRemove={() =>
                onChange({
                  ...value,
                  exceptions: value.exceptions.filter(
                    (_, position) => position !== index
                  ),
                })
              }
            />
          ))}
          <button
            type="button"
            className={button}
            disabled={value.exceptions.length >= 366}
            onClick={() =>
              onChange({
                ...value,
                exceptions: [
                  ...value.exceptions,
                  { date: '', closed: true, opens: '09:00', closes: '21:00' },
                ],
              })
            }
          >
            Добавить исключение
          </button>
        </>
      ) : null}
    </fieldset>
  )
}
