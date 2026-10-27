'use client'

import { useState } from 'react'
import FocusedTicketSession from './FocusedTicketSession'
import usePartyUnsavedChanges, {
  requestPartyLeave,
} from '@components/party/navigation/usePartyUnsavedChanges'
import {
  TicketError,
  TicketField,
  TicketLocationSelect,
  TicketPager,
} from './TicketingControls'
import { useTicketingCommand, useTicketingList } from './useTicketingData'
import {
  ticketButton,
  ticketCard,
  ticketControl,
  ticketDate,
  ticketKopecks,
  ticketLocalDate,
  ticketMoney,
  ticketPrimary,
  ticketRubles,
} from './ticketingUi'

const programDraft = (program, locations) => ({
  id: program?._id || '',
  revision: program?.revision || 0,
  title: program?.title || '',
  admission: program?.admission || 'session',
  price: ticketRubles(program?.unitPriceKopecks ?? 0),
  locationId: String(
    program?.locationId || (locations.length === 1 ? locations[0]._id : '')
  ),
  source: program?.source || 'internal',
  provider: program?.externalProvider || 'ticketscloud',
  externalId: program?.externalProgramId || '',
  status: program?.status || 'active',
  groupMin: String(program?.groupDiscount?.minQuantity || 0),
  groupAmount: ticketRubles(
    program?.groupDiscount?.amountPerTicketKopecks || 0
  ),
})

function ProgramEditor({ companyId, catalog, onChanged, programList }) {
  const [draft, setDraft] = useState(() =>
    programDraft(null, catalog.locations || [])
  )
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft))
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const command = useTicketingCommand(companyId)
  const dirty = JSON.stringify(draft) !== baseline
  usePartyUnsavedChanges(dirty, {
    label: 'программа посещений',
    scope: `${companyId}:ticket-program`,
    pending: command.busy,
  })
  const locked =
    command.busy ||
    command.uncertain ||
    !catalog.enabled ||
    !catalog.capabilities?.manage
  const set = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setNotice('')
    setError('')
  }
  const select = (id) => {
    if (
      !requestPartyLeave({
        kind: 'record',
        target: 'ticket-program-' + id,
        scope: `${companyId}:ticket-program`,
      })
    )
      return
    const next = programDraft(
      catalog.programs?.find((item) => String(item._id) === id),
      catalog.locations || []
    )
    setDraft(next)
    setBaseline(JSON.stringify(next))
    setNotice('')
    setError('')
  }
  const submit = async (event) => {
    event.preventDefault()
    const price = ticketKopecks(draft.price),
      groupAmount = ticketKopecks(draft.groupAmount),
      minQuantity = Number(draft.groupMin)
    if (
      !draft.title.trim() ||
      price === null ||
      groupAmount === null ||
      !Number.isSafeInteger(minQuantity) ||
      minQuantity < 0 ||
      minQuantity === 1
    ) {
      setError('Проверьте название, цену и условия скидки.')
      return
    }
    const payload = {
      title: draft.title.trim(),
      admission: draft.admission,
      unitPriceKopecks: price,
      locationId: draft.locationId || null,
      source: draft.source,
      externalProvider: draft.source === 'external' ? draft.provider : '',
      externalProgramId: draft.source === 'external' ? draft.externalId : '',
      status: draft.status,
      groupDiscount: { minQuantity, amountPerTicketKopecks: groupAmount },
      ...(draft.id
        ? { programId: draft.id, expectedRevision: draft.revision }
        : {}),
    }
    const result = await command.run(
      draft.id ? 'program.update' : 'program.create',
      payload
    )
    if (result) {
      const next = programDraft(result.data, catalog.locations || [])
      setDraft(next)
      setBaseline(JSON.stringify(next))
      setNotice('Программа сохранена.')
      onChanged()
    }
  }
  return (
    <form
      aria-label="Программа посещений"
      className="space-y-4 border-t border-sky-100 pt-4"
      onSubmit={submit}
    >
      {programList ? <TicketPager list={programList} /> : null}
      <TicketField label="Редактировать программу">
        <select
          className={ticketControl + ' cursor-pointer'}
          value={draft.id}
          disabled={locked}
          onChange={(event) => select(event.target.value)}
        >
          <option value="">Новая программа</option>
          {(catalog.programs || []).map((program) => (
            <option key={program._id} value={String(program._id)}>
              {program.title}
              {program.status === 'archived' ? ' · в архиве' : ''}
            </option>
          ))}
        </select>
      </TicketField>
      <div className="grid gap-3 sm:grid-cols-2">
        <TicketField label="Название программы">
          <input
            required
            maxLength="180"
            className={ticketControl}
            value={draft.title}
            disabled={locked}
            onChange={(event) => set('title', event.target.value)}
          />
        </TicketField>
        <TicketField label="Режим посещения">
          <select
            className={ticketControl + ' cursor-pointer'}
            value={draft.admission}
            disabled={locked}
            onChange={(event) => set('admission', event.target.value)}
          >
            <option value="session">По сеансам</option>
            <option value="open">Без фиксированного времени</option>
          </select>
        </TicketField>
        <TicketField label="Стандартная цена билета, ₽">
          <input
            required
            inputMode="decimal"
            className={ticketControl}
            value={draft.price}
            disabled={locked}
            onChange={(event) => set('price', event.target.value)}
          />
        </TicketField>
        <TicketLocationSelect
          locations={catalog.locations || []}
          value={draft.locationId}
          disabled={locked}
          onChange={(value) => set('locationId', value)}
        />
      </div>
      <p className="text-xs text-slate-500">
        Площадка подставляется в новые сеансы. Посещение без времени не занимает
        её на весь день.
      </p>
      <details className="rounded-xl border border-slate-200 p-3">
        <summary className="min-h-8 cursor-pointer text-sm font-semibold">
          Скидка за количество и внешние продажи
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <TicketField label="Скидка начиная с количества билетов (0 — выключена)">
            <input
              type="number"
              min="0"
              step="1"
              className={ticketControl}
              value={draft.groupMin}
              disabled={locked}
              onChange={(event) => set('groupMin', event.target.value)}
            />
          </TicketField>
          <TicketField label="Скидка на каждый билет, ₽">
            <input
              inputMode="decimal"
              className={ticketControl}
              value={draft.groupAmount}
              disabled={locked}
              onChange={(event) => set('groupAmount', event.target.value)}
            />
          </TicketField>
          <TicketField label="Где учитываются билеты">
            <select
              className={ticketControl + ' cursor-pointer'}
              value={draft.source}
              disabled={locked}
              onChange={(event) => set('source', event.target.value)}
            >
              <option value="internal">Отдельный остаток в CRM</option>
              <option value="external">Внешний билетный сервис</option>
            </select>
          </TicketField>
          {draft.source === 'external' ? (
            <>
              <TicketField label="Билетный сервис">
                <select
                  className={ticketControl + ' cursor-pointer'}
                  value={draft.provider}
                  disabled={locked}
                  onChange={(event) => set('provider', event.target.value)}
                >
                  <option value="ticketscloud">TicketsCloud</option>
                  <option value="krasbilet">Красбилет</option>
                  <option value="other">Другой</option>
                </select>
              </TicketField>
              <TicketField label="Идентификатор программы во внешнем сервисе">
                <input
                  className={ticketControl}
                  maxLength="180"
                  value={draft.externalId}
                  disabled={locked}
                  onChange={(event) => set('externalId', event.target.value)}
                />
              </TicketField>
              <p className="text-sm text-amber-900">
                Подключение внешнего сервиса ещё не выполнено. До его настройки
                продажи этой программы в CRM недоступны.
              </p>
            </>
          ) : null}
          <TicketField label="Состояние программы">
            <select
              className={ticketControl + ' cursor-pointer'}
              value={draft.status}
              disabled={locked}
              onChange={(event) => set('status', event.target.value)}
            >
              <option value="active">Активна</option>
              <option value="archived">В архиве</option>
            </select>
          </TicketField>
        </div>
      </details>
      <TicketError>{error || command.error}</TicketError>
      {notice ? (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      <button
        type="submit"
        className={ticketPrimary}
        disabled={
          command.busy ||
          !catalog.enabled ||
          !catalog.capabilities?.manage ||
          (!dirty && !command.uncertain)
        }
      >
        {command.busy
          ? 'Сохраняем…'
          : command.uncertain
            ? 'Повторить сохранение'
            : 'Сохранить программу'}
      </button>
    </form>
  )
}

const sessionDraft = (session, catalog) => ({
  id: session?._id || '',
  revision: session?.revision || 0,
  programId: String(session?.programId || ''),
  title: session?.title || '',
  locationId: String(
    session?.locationId ||
      (catalog.locations?.length === 1 ? catalog.locations[0]._id : '')
  ),
  startsAt: ticketLocalDate(session?.startsAt),
  endsAt: ticketLocalDate(session?.endsAt),
  capacity: String(session?.capacity || ''),
  status: session?.status || 'scheduled',
})

function SessionEditor({ companyId, catalog, selected, onChanged }) {
  const [draft, setDraft] = useState(() => sessionDraft(selected, catalog))
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft))
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const command = useTicketingCommand(companyId)
  const dirty = JSON.stringify(draft) !== baseline
  usePartyUnsavedChanges(dirty, {
    label: 'сеанс',
    scope: `${companyId}:ticket-session`,
    pending: command.busy,
  })
  const locked =
    command.busy ||
    command.uncertain ||
    !catalog.enabled ||
    !catalog.capabilities?.manage
  const set = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }))
    setError('')
    setNotice('')
  }
  const submit = async (event) => {
    event.preventDefault()
    const from = new Date(draft.startsAt),
      to = new Date(draft.endsAt),
      capacity = Number(draft.capacity)
    if (
      !draft.programId ||
      !draft.locationId ||
      !Number.isFinite(+from) ||
      !Number.isFinite(+to) ||
      to <= from ||
      !Number.isSafeInteger(capacity) ||
      capacity < 1
    ) {
      setError(
        'Выберите программу, площадку, время начала и окончания и положительную вместимость.'
      )
      return
    }
    const program = catalog.programs?.find(
      (item) => String(item._id) === draft.programId
    )
    const payload = {
      startsAt: from.toISOString(),
      endsAt: to.toISOString(),
      capacity,
      status: draft.status,
      ...(draft.id
        ? { sessionId: draft.id, expectedRevision: draft.revision }
        : {
            programId: draft.programId,
            locationId: draft.locationId,
            title: draft.title.trim() || program?.title || 'Сеанс',
          }),
    }
    const result = await command.run(
      draft.id ? 'session.update' : 'session.create',
      payload
    )
    if (result) {
      const next = sessionDraft(result.data, catalog)
      setDraft(next)
      setBaseline(JSON.stringify(next))
      setNotice('Сеанс сохранён.')
      onChanged()
    }
  }
  return (
    <form
      aria-label={draft.id ? 'Изменение сеанса' : 'Новый сеанс'}
      onSubmit={submit}
      className="space-y-4 border-t border-sky-100 pt-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TicketField label="Программа сеанса">
          <select
            required
            className={ticketControl + ' cursor-pointer'}
            value={draft.programId}
            disabled={locked || Boolean(draft.id)}
            onChange={(event) => {
              const program = catalog.programs?.find(
                (item) => String(item._id) === event.target.value
              )
              setDraft((previous) => ({
                ...previous,
                programId: event.target.value,
                title: program?.title || '',
                locationId: String(program?.locationId || previous.locationId),
              }))
            }}
          >
            <option value="">Выберите программу</option>
            {(catalog.programs || [])
              .filter((program) => program.admission === 'session')
              .map((program) => (
                <option key={program._id} value={String(program._id)}>
                  {program.title}
                </option>
              ))}
          </select>
        </TicketField>
        <TicketLocationSelect
          locations={catalog.locations || []}
          value={draft.locationId}
          disabled={locked || Boolean(draft.id)}
          onChange={(value) => set('locationId', value)}
        />
        <TicketField label="Начало сеанса">
          <input
            required
            type="datetime-local"
            className={ticketControl}
            value={draft.startsAt}
            disabled={locked}
            onChange={(event) => set('startsAt', event.target.value)}
          />
        </TicketField>
        <TicketField label="Окончание сеанса">
          <input
            required
            type="datetime-local"
            className={ticketControl}
            value={draft.endsAt}
            disabled={locked}
            onChange={(event) => set('endsAt', event.target.value)}
          />
        </TicketField>
        <TicketField label="Количество билетов для продаж в CRM">
          <input
            required
            type="number"
            min="1"
            step="1"
            max="100000"
            className={ticketControl}
            value={draft.capacity}
            disabled={locked}
            onChange={(event) => set('capacity', event.target.value)}
          />
        </TicketField>
        {draft.id ? (
          <TicketField label="Состояние сеанса">
            <select
              className={ticketControl + ' cursor-pointer'}
              value={draft.status}
              disabled={locked}
              onChange={(event) => set('status', event.target.value)}
            >
              <option value="scheduled">Запланирован</option>
              <option value="completed">Проведён</option>
              <option value="canceled">Отменён</option>
            </select>
          </TicketField>
        ) : null}
      </div>
      <TicketError>{error || command.error}</TicketError>
      {notice ? (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      <button
        type="submit"
        className={ticketPrimary}
        disabled={
          command.busy ||
          !catalog.enabled ||
          !catalog.capabilities?.manage ||
          (!dirty && !command.uncertain)
        }
      >
        {command.busy
          ? 'Сохраняем…'
          : command.uncertain
            ? 'Повторить сохранение'
            : 'Сохранить сеанс'}
      </button>
    </form>
  )
}

export default function TicketingSchedule({
  companyId,
  catalog,
  revision,
  onChanged,
  programList,
  initialSessionId = '',
}) {
  const [selected, setSelected] = useState(null)
  const [editorRevision, setEditorRevision] = useState(0)
  const cancellation = useTicketingCommand(companyId)
  const [notice, setNotice] = useState('')
  usePartyUnsavedChanges(false, {
    label: 'отмена сеанса',
    scope: companyId,
    pending: cancellation.busy,
  })
  const list = useTicketingList({
    companyId,
    section: 'sessions',
    enabled: true,
    revision,
  })
  const choose = (session) => {
    if (
      !requestPartyLeave({
        kind: 'record',
        target: 'ticket-session-' + (session?._id || 'new'),
        scope: `${companyId}:ticket-session`,
      })
    )
      return
    setSelected(session || {})
    setEditorRevision((value) => value + 1)
  }
  const cancelSession = async (session) => {
    const result = await cancellation.run('session.update', {
      sessionId: String(session._id),
      expectedRevision: session.revision,
      status: 'canceled',
    })
    if (result) {
      setNotice('Сеанс отменён.')
      onChanged()
    }
  }
  return (
    <section aria-label="Расписание сеансов" className="space-y-4">
      {catalog.limitations?.operationalOrdersLinked === false ? (
        <p className="text-sm text-slate-500">
          Здесь ведутся сеансы и билеты. Назначение команды и задачи для сеансов
          пока не подключены.
        </p>
      ) : null}
      <TicketError>{cancellation.error}</TicketError>
      <FocusedTicketSession
        companyId={companyId}
        sessionId={initialSessionId}
        revision={revision}
        canEdit={catalog.enabled && catalog.capabilities?.manage}
        onChoose={choose}
      />
      {notice ? (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}
      {catalog.capabilities?.manage ? (
        <details className={ticketCard}>
          <summary className="min-h-11 cursor-pointer font-semibold text-sky-950">
            Программы и цены
          </summary>
          <ProgramEditor
            companyId={companyId}
            catalog={catalog}
            onChanged={onChanged}
            programList={programList}
          />
        </details>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-sky-950">Сеансы</h2>
        {catalog.enabled && catalog.capabilities?.manage ? (
          <button
            type="button"
            className={ticketButton}
            onClick={() => choose(null)}
          >
            Добавить сеанс
          </button>
        ) : null}
      </div>
      {selected && catalog.capabilities?.manage ? (
        <div className={ticketCard}>
          <SessionEditor
            key={editorRevision}
            companyId={companyId}
            catalog={catalog}
            selected={selected}
            onChanged={onChanged}
          />
        </div>
      ) : null}
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        {list.rows.map((session) => {
          const program = catalog.programs?.find(
            (item) => String(item._id) === String(session.programId)
          )
          return (
            <article key={session._id} className={ticketCard + ' space-y-2'}>
              <h3 className="font-semibold break-words text-sky-950">
                {session.title || program?.title || 'Сеанс'}
              </h3>
              <p className="text-sm text-slate-600">
                {ticketDate(session.startsAt)} — {ticketDate(session.endsAt)}
              </p>
              <p className="text-sm text-slate-600">
                {session.status === 'canceled'
                  ? 'Отменён'
                  : session.status === 'completed'
                    ? 'Проведён'
                    : 'Запланирован'}
              </p>
              {session.availabilityKnown !== false &&
              program?.source !== 'external' &&
              Number.isInteger(session.availableCount) ? (
                <p className="text-sm font-semibold text-sky-800">
                  Доступно в CRM: {session.availableCount}
                </p>
              ) : (
                <p className="text-sm text-amber-800">Остаток не подтверждён</p>
              )}
              {Number.isSafeInteger(program?.unitPriceKopecks) ? (
                <p className="text-sm text-slate-600">
                  {ticketMoney(program.unitPriceKopecks)} за билет
                </p>
              ) : null}
              {catalog.enabled && catalog.capabilities?.manage ? (
                <button
                  type="button"
                  className={ticketButton}
                  onClick={() => choose(session)}
                >
                  Изменить сеанс
                </button>
              ) : null}
              {!catalog.enabled &&
              catalog.capabilities?.manage &&
              catalog.maintenanceActions?.includes('session.cancel') &&
              session.status === 'scheduled' ? (
                <button
                  type="button"
                  className={ticketButton}
                  disabled={cancellation.busy}
                  onClick={() => cancelSession(session)}
                >
                  {cancellation.busy ? 'Отменяем…' : 'Отменить сеанс'}
                </button>
              ) : null}
            </article>
          )
        })}
      </div>
      {!list.busy && !list.error && !list.rows.length ? (
        <p className={ticketCard + ' text-sm text-slate-500'}>
          Сеансы ещё не добавлены. Для программы без фиксированного времени
          сеанс не требуется.
        </p>
      ) : null}
      <TicketPager list={list} />
    </section>
  )
}
