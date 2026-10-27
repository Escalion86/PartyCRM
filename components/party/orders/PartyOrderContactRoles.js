'use client'

import FieldHelp from '@components/FieldHelp'
import {
  buildPartyOrderContacts,
  PARTY_ORDER_CONTACT_METHOD_LABELS as methods,
  PARTY_ORDER_CONTACT_ROLE_LABELS as roles,
  removePartyOrderContact,
  setPartyOrderContactComment,
  setPartyOrderContactSetting,
} from '@helpers/partyOrderContacts'

const personName = (person) =>
  [person?.firstName, person?.secondName, person?.thirdName]
    .filter(Boolean)
    .join(' ') ||
  person?.name ||
  person?.phone ||
  'Сохранённый контакт'
const control =
  'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white p-2 text-sm'
const action =
  'min-h-10 cursor-pointer rounded border border-slate-200 px-3 py-1 text-sm text-sky-700 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-50'

export function PartyOrderContactRolesEditor({
  value = {},
  clients = [],
  primaryClientId,
  otherContacts = [],
  onChange,
  onChangeContactRoles = onChange,
  onChangeOtherContacts,
  renderPrimaryClient,
  onAddContact,
  onEditContact,
  onViewContact,
  canEdit = true,
  canEditOtherContacts = canEdit,
  canEditSettings = canEdit,
  canEditSystemRoles = canEditSettings,
  showSettings = true,
}) {
  const contacts = buildPartyOrderContacts({
    clientId: primaryClientId,
    otherContacts,
    contactRoles: value,
  })
  const clientsById = new Map(
    clients.map((client) => [String(client._id), client])
  )
  const change = (key, next) =>
    onChangeContactRoles?.({ ...value, [key]: next })
  const setSetting = (contact, patch) =>
    onChangeContactRoles?.(
      setPartyOrderContactSetting(value, contact.clientId, {
        performerCanContact: contact.performerCanContact,
        allowedContactMethods: contact.allowedContactMethods,
        ...patch,
      })
    )
  const remove = (contact) => {
    if (
      contact.systemRoles.length &&
      !window.confirm(
        'Убрать контакт и связи «' +
          contact.systemRoles.map((role) => roles[role]).join(', ') +
          '» из заказа? Уже проведённые платежи сохранятся.'
      )
    )
      return
    const next = removePartyOrderContact({
      clientId: contact.clientId,
      otherContacts,
      contactRoles: value,
    })
    if (canEditSettings) onChangeContactRoles?.(next.contactRoles)
    onChangeOtherContacts?.(next.otherContacts)
  }
  const linkedIds = new Set(contacts.map((contact) => contact.clientId))
  const candidates = clients.filter(
    (client) =>
      client.status !== 'archived' && !linkedIds.has(String(client._id))
  )

  return (
    <section
      className="min-w-0 space-y-3"
      aria-label="Клиент и контакты заказа"
    >
      <p className="text-sm text-slate-500">
        Укажите, кем приходится каждый контакт и с кем исполнителю можно
        связываться.
      </p>
      {!primaryClientId && renderPrimaryClient ? renderPrimaryClient : null}
      {contacts.map((contact) => {
        const person = clientsById.get(contact.clientId)
        const index = contact.otherContactIndices[0]
        return (
          <div
            key={contact.clientId}
            className="min-w-0 space-y-3 rounded-xl border border-sky-100 bg-sky-50/40 p-3"
          >
            {contact.isPrimary && renderPrimaryClient ? (
              renderPrimaryClient
            ) : (
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold break-words">
                    {personName(person)}
                  </p>
                  {person?.phone ? (
                    <p className="text-sm text-slate-500">{person.phone}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {onViewContact ? (
                    <button
                      type="button"
                      className={action}
                      onClick={() => onViewContact(contact.clientId, index)}
                    >
                      Открыть
                    </button>
                  ) : null}
                  {canEdit && onEditContact ? (
                    <button
                      type="button"
                      className={action}
                      onClick={() => onEditContact(contact.clientId, index)}
                    >
                      Изменить
                    </button>
                  ) : null}
                  {canEdit &&
                  canEditOtherContacts &&
                  !contact.isPrimary &&
                  (!contact.systemRoles.length || canEditSystemRoles) ? (
                    <button
                      type="button"
                      className={action}
                      onClick={() => remove(contact)}
                    >
                      Убрать
                    </button>
                  ) : null}
                </div>
              </div>
            )}
            {contact.isPrimary || contact.systemRoles.length ? (
              <div className="flex flex-wrap gap-1 text-xs text-slate-600">
                {contact.isPrimary ? (
                  <span className="rounded bg-white px-2 py-1">Заказчик</span>
                ) : null}
                {contact.systemRoles.map((role) => (
                  <span key={role} className="rounded bg-white px-2 py-1">
                    {roles[role]}
                  </span>
                ))}
              </div>
            ) : null}
            <label className="block text-sm">
              Кем является
              <input
                className={control}
                value={contact.comments.join('; ')}
                maxLength={180}
                disabled={!canEdit || !canEditOtherContacts}
                onChange={(event) =>
                  onChangeOtherContacts?.(
                    setPartyOrderContactComment(
                      otherContacts,
                      contact.clientId,
                      event.target.value
                    )
                  )
                }
                placeholder={
                  contact.isPrimary
                    ? 'Например: мама именинника'
                    : 'Например: бабушка, организатор, контакт на площадке'
                }
              />
            </label>
            {showSettings ? (
              <>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    disabled={!canEdit || !canEditSettings}
                    checked={contact.performerCanContact}
                    onChange={(event) =>
                      setSetting(contact, {
                        performerCanContact: event.target.checked,
                      })
                    }
                  />
                  Доступен исполнителю
                  <FieldHelp
                    label="доступность контакта исполнителю"
                    text="Отметьте людей, которым исполнитель может звонить или писать по этому заказу. Дополнительно действуют права его должности."
                  />
                </label>
                <fieldset>
                  <legend className="flex items-center gap-1 text-sm">
                    Памятка способов связи
                    <FieldHelp
                      label="памятка способов связи"
                      text="Например, с бабушкой договорились созваниваться, а маме удобнее Telegram. Это памятка, она не блокирует другие способы связи."
                    />
                  </legend>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {Object.entries(methods).map(([key, label]) => (
                      <label
                        key={key}
                        className="flex min-h-10 cursor-pointer items-center gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          disabled={!canEdit || !canEditSettings}
                          checked={contact.allowedContactMethods.includes(key)}
                          onChange={(event) =>
                            setSetting(contact, {
                              allowedContactMethods: event.target.checked
                                ? [...contact.allowedContactMethods, key]
                                : contact.allowedContactMethods.filter(
                                    (method) => method !== key
                                  ),
                            })
                          }
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            ) : null}
          </div>
        )
      })}
      {canEdit && canEditOtherContacts ? (
        onAddContact ? (
          <button type="button" className={action} onClick={onAddContact}>
            Добавить контакт
          </button>
        ) : (
          <label className="block text-sm">
            Добавить контакт
            <select
              className={control + ' cursor-pointer'}
              value=""
              onChange={(event) => {
                if (event.target.value)
                  onChangeOtherContacts?.([
                    ...otherContacts,
                    { clientId: event.target.value, comment: '' },
                  ])
              }}
            >
              <option value="">Выберите из клиентов</option>
              {candidates.map((client) => (
                <option key={client._id} value={client._id}>
                  {personName(client)}
                </option>
              ))}
            </select>
          </label>
        )
      ) : null}
      {showSettings ? (
        <details className="rounded-xl border border-sky-100 p-3">
          <summary className="min-h-8 cursor-pointer text-sm font-medium">
            Инструкция для команды
          </summary>
          <div className="mt-2 space-y-3">
            <label className="block text-sm">
              От чьего имени представляться
              <FieldHelp
                label="от чьего имени представляться"
                text="Например: «Я от агентства Радуга», если заказ передал партнёр. Поле можно оставить пустым."
              />
              <input
                aria-label="От чьего имени представляться"
                className={control}
                maxLength={240}
                disabled={!canEdit || !canEditSettings}
                value={value.representAs || ''}
                onChange={(event) => change('representAs', event.target.value)}
                placeholder="Например: команда агентства «Радуга»"
              />
            </label>
            <label className="block text-sm">
              Что важно знать о связи с клиентом
              <textarea
                aria-label="Что важно знать о связи с клиентом"
                className={control}
                rows={3}
                maxLength={2000}
                disabled={!canEdit || !canEditSettings}
                value={value.communicationNotes || ''}
                onChange={(event) =>
                  change('communicationNotes', event.target.value)
                }
                placeholder="Кому звонить по приезде, через кого согласовывать изменения"
              />
            </label>
            {value.allowedContactMethods?.length ? (
              <p className="text-xs text-slate-500">
                Общая памятка для команды:{' '}
                {value.allowedContactMethods
                  .map((key) => methods[key])
                  .filter(Boolean)
                  .join(', ')}
                . Для каждого контакта можно задать свои способы выше.
              </p>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  )
}

export function PartyOrderContactRolesView({
  value = {},
  clientsById = new Map(),
  primaryClientId,
  otherContacts = [],
  showPrimary = true,
  showSettings = true,
}) {
  const contacts = buildPartyOrderContacts({
    clientId: primaryClientId,
    otherContacts,
    contactRoles: value,
  }).filter((contact) => showPrimary || !contact.isPrimary)
  return (
    <div className="space-y-3 text-sm">
      {contacts.map((contact) => {
        const person = clientsById.get(contact.clientId)
        const labels = [
          contact.isPrimary ? 'Заказчик' : '',
          ...contact.systemRoles.map((role) => roles[role]),
          ...contact.comments,
        ].filter(Boolean)
        return (
          <div
            key={contact.clientId}
            className="rounded-lg border border-slate-100 p-3"
          >
            <p className="font-medium break-words">{personName(person)}</p>
            {labels.length ? (
              <p className="text-xs break-words text-slate-500">
                {labels.join(' · ')}
              </p>
            ) : null}
            {person?.phone ? (
              <a
                className="mt-1 inline-flex min-h-10 cursor-pointer items-center text-sky-700"
                href={'tel:+' + String(person.phone).replace(/\D/g, '')}
              >
                {person.phone}
              </a>
            ) : null}
            {person?.email ? <p className="break-all">{person.email}</p> : null}
            {showSettings ? (
              <p className="text-xs text-slate-500">
                {contact.performerCanContact
                  ? 'Доступен исполнителю'
                  : 'Скрыт от исполнителя'}
              </p>
            ) : null}
            {showSettings && contact.allowedContactMethods.length ? (
              <p className="text-xs">
                Памятка:{' '}
                {contact.allowedContactMethods
                  .map((key) => methods[key])
                  .join(', ')}
              </p>
            ) : null}
          </div>
        )
      })}
      {showSettings && value.representAs ? (
        <p className="break-words whitespace-pre-wrap">
          Представляться: {value.representAs}
        </p>
      ) : null}
      {showSettings && value.communicationNotes ? (
        <p className="break-words whitespace-pre-wrap">
          {value.communicationNotes}
        </p>
      ) : null}
    </div>
  )
}

export function PartyPerformerContacts({ contacts = [] }) {
  if (!contacts.length) return null
  return (
    <div className="space-y-3">
      {contacts.map((contact) => (
        <div
          key={contact._id}
          className="rounded-lg border border-slate-100 p-3 text-sm"
        >
          {contact.name ? (
            <p className="font-semibold break-words">{contact.name}</p>
          ) : null}
          {contact.label ? (
            <p className="text-xs break-words text-slate-500">
              {contact.label}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {contact.phone ? (
              <a
                className={action + ' inline-flex items-center'}
                href={'tel:+' + String(contact.phone).replace(/\D/g, '')}
              >
                Позвонить
              </a>
            ) : null}
            {contact.whatsapp ? (
              <a
                className={action + ' inline-flex items-center'}
                href={
                  'https://wa.me/' + String(contact.whatsapp).replace(/\D/g, '')
                }
                target="_blank"
                rel="noopener noreferrer"
              >
                WhatsApp
              </a>
            ) : null}
            {contact.telegram &&
            /^[a-z\d_]+$/i.test(contact.telegram.replace(/^@/, '')) ? (
              <a
                className={action + ' inline-flex items-center'}
                href={'https://t.me/' + contact.telegram.replace(/^@/, '')}
                target="_blank"
                rel="noopener noreferrer"
              >
                Telegram
              </a>
            ) : null}
            {contact.email ? (
              <a
                className={action + ' inline-flex items-center'}
                href={'mailto:' + contact.email}
              >
                Email
              </a>
            ) : null}
          </div>
          {contact.allowedContactMethods?.length ? (
            <p className="mt-1 text-xs text-slate-500">
              Памятка:{' '}
              {contact.allowedContactMethods
                .map((key) => methods[key])
                .filter(Boolean)
                .join(', ')}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  )
}
