'use client'

const roles = { partnerClientId: 'Партнёр / агентство', payerClientId: 'Плательщик', onsiteClientId: 'Контакт на месте' }
const methods = { phone: 'Звонок', telegram: 'Telegram', whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email' }
const personName = person => [person?.firstName, person?.secondName].filter(Boolean).join(' ') || person?.phone || 'Без имени'
const control = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-sm'

export function PartyOrderContactRolesEditor({ value = {}, clients = [], onChange }) {
  const change = (key, next) => onChange({ ...value, [key]: next })
  return <section className="space-y-3 rounded-xl border border-sky-100 p-3" aria-label="Роли контактов и правила связи">
    <h3 className="font-semibold">Роли контактов и правила связи</h3>
    <p className="text-sm text-slate-500">Основной клиент выше — заказчик. Укажите дополнительные роли, если это другие люди или организации; один контакт может выполнять несколько ролей. Плательщик здесь — контакт для согласования оплаты, фактические платежи учитываются отдельно.</p>
    <div className="grid gap-3 sm:grid-cols-2">{Object.entries(roles).map(([key,label]) => <label key={key} className="min-w-0 text-sm">{label}
      <select className={`${control} cursor-pointer`} value={value[key] || ''} onChange={event => change(key, event.target.value || null)}>
        <option value="">Не указан</option>
        {value[key] && !clients.some(person => String(person._id) === String(value[key])) && <option value={value[key]}>Сохранённый контакт</option>}
        {clients.filter(person => person.status !== 'archived' || String(person._id) === String(value[key])).map(person => <option key={person._id} value={person._id}>{personName(person)}</option>)}
      </select>
    </label>)}</div>
    <label className="block text-sm">От чьего имени представляться<input className={control} maxLength={240} value={value.representAs || ''} onChange={event => change('representAs', event.target.value)} placeholder="Например: команда агентства «Праздник»" /></label>
    <fieldset><legend className="text-sm font-medium">Согласованные способы связи</legend><div className="mt-2 flex flex-wrap gap-3">{Object.entries(methods).map(([key,label]) => <label key={key} className="flex min-h-11 cursor-pointer items-center gap-2 text-sm"><input type="checkbox" checked={(value.allowedContactMethods || []).includes(key)} onChange={event => change('allowedContactMethods', event.target.checked ? [...(value.allowedContactMethods || []), key] : (value.allowedContactMethods || []).filter(item => item !== key))} />{label}</label>)}</div></fieldset>
    <label className="block text-sm">Инструкция по связи для команды<textarea className={control} rows={3} maxLength={2000} value={value.communicationNotes || ''} onChange={event => change('communicationNotes', event.target.value)} placeholder="Кому звонить по приезде, через кого согласовывать изменения" /></label>
    <p className="text-xs text-slate-500">Контакт на месте и инструкции видны назначенным исполнителям. Способы связи служат памяткой и не блокируют отправку сообщений технически.</p>
  </section>
}

export function PartyOrderContactRolesView({ value = {}, clientsById = new Map() }) {
  return <div className="space-y-3 text-sm">
    {Object.entries(roles).map(([key,label]) => {const person=clientsById.get(String(value[key] || ''));return <div key={key}><p className="text-xs text-slate-500">{label}</p><p className="break-words font-medium">{value[key] ? person ? personName(person) : 'Сохранённый контакт — карточка недоступна' : 'Не указан'}</p>{person?.phone && <p>{person.phone}</p>}{person?.email && <p className="break-all">{person.email}</p>}</div>})}
    {value.representAs && <div><p className="text-xs text-slate-500">Представляться от имени</p><p className="whitespace-pre-wrap break-words">{value.representAs}</p></div>}
    {value.allowedContactMethods?.length > 0 && <p>Согласованные способы связи: {value.allowedContactMethods.map(key => methods[key]).filter(Boolean).join(', ')}</p>}
    {value.communicationNotes && <div><p className="text-xs text-slate-500">Инструкция команде</p><p className="whitespace-pre-wrap break-words">{value.communicationNotes}</p></div>}
  </div>
}
