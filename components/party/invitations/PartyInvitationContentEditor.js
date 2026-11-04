'use client'

const input =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
export const emptyInvitationContent = () => ({
  heading: 'Приглашаем на праздник!',
  message: 'Будем рады видеть вас!',
  instructions: '',
  logoUrl: '',
  backgroundUrl: '',
  accentColor: '#0369a1',
  backgroundColor: '#f0f9ff',
  textColor: '#0f172a',
  publicContact: '',
  showEndTime: false,
})
export default function PartyInvitationContentEditor({
  value,
  onChange,
  disabled,
}) {
  const edit = (key, next) => onChange({ ...value, [key]: next })
  return (
    <fieldset className="min-w-0 space-y-4" disabled={disabled}>
      {[
        ['heading', 'Заголовок', 240],
        ['message', 'Текст приглашения', 5000],
        ['instructions', 'Инструкции гостям', 5000],
        ['publicContact', 'Публичные контакты для гостей', 5000],
      ].map(([field, label, maxLength]) => (
        <label className="block text-sm" key={field}>
          {label}
          {field === 'heading' ? (
            <input
              className={input}
              value={value[field] || ''}
              maxLength={maxLength}
              onChange={(event) => edit(field, event.target.value)}
            />
          ) : (
            <textarea
              className={input}
              rows={3}
              value={value[field] || ''}
              maxLength={maxLength}
              onChange={(event) => edit(field, event.target.value)}
            />
          )}
        </label>
      ))}
      <p className="text-xs leading-5 text-slate-600">
        Укажите только те контакты и сведения, которые можно показать всем
        получателям ссылки. Данные клиента и бриф автоматически не публикуются.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ['logoUrl', 'Ссылка на существующий логотип'],
          ['backgroundUrl', 'Ссылка на изображение обложки'],
        ].map(([field, label]) => (
          <label className="text-sm" key={field}>
            {label}
            <input
              className={input}
              value={value[field] || ''}
              maxLength={2000}
              placeholder="https://… или /images/…"
              onChange={(event) => edit(field, event.target.value)}
            />
          </label>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ['accentColor', 'Заголовки'],
          ['backgroundColor', 'Фон страницы'],
          ['textColor', 'Основной текст'],
        ].map(([field, label]) => (
          <label className="text-sm" key={field}>
            {label}
            <input
              type="color"
              className={`${input} cursor-pointer`}
              value={value[field] || '#ffffff'}
              onChange={(event) => edit(field, event.target.value)}
            />
            <span className="text-xs text-slate-600">{value[field]}</span>
          </label>
        ))}
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={value.showEndTime === true}
          onChange={(event) => edit('showEndTime', event.target.checked)}
        />
        Показать время окончания программы
      </label>
    </fieldset>
  )
}
