'use client'

import { useState } from 'react'
import PhoneInput from '@components/PhoneInput'
import { normalizePhoneNumber } from '@helpers/phoneInput'
import usePartyUnsavedChanges, {
  requestPartyLeave,
} from '@components/party/navigation/usePartyUnsavedChanges'
import { TicketError, TicketField, TicketPager } from './TicketingControls'
import { useTicketingCommand, useTicketingList } from './useTicketingData'
import {
  ticketButton,
  ticketCard,
  ticketControl,
  ticketDate,
  ticketKopecks,
  ticketMoney,
  ticketPrimary,
  ticketRubles,
} from './ticketingUi'

export default function TicketSaleForm({
  companyId,
  catalog,
  revision,
  onChanged,
  programList,
}) {
  const caps = catalog.capabilities || {}
  const [programId, setProgramId] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [discount, setDiscount] = useState('')
  const [visitDate, setVisitDate] = useState('')
  const [contact, setContact] = useState({ name: '', phone: null, email: '' })
  const [received, setReceived] = useState(false)
  const [method, setMethod] = useState('cash')
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [openedAt] = useState(() => Date.now())
  const command = useTicketingCommand(companyId)
  const program = catalog.programs?.find(
    (item) => String(item._id) === programId
  )
  const sessions = useTicketingList({
    companyId,
    section: 'sessions',
    enabled: Boolean(
      program && program.admission === 'session' && catalog.enabled
    ),
    filters: new URLSearchParams(programId ? { programId } : {}).toString(),
    revision,
  })
  const choices = sessions.rows.filter(
    (session) =>
      session.status === 'scheduled' &&
      +new Date(session.endsAt || session.startsAt) >= openedAt
  )
  const session = sessions.rows.find((item) => String(item._id) === sessionId)
  const qty = Number(quantity)
  const price =
    caps.discounts && unitPrice !== ''
      ? ticketKopecks(unitPrice)
      : program?.unitPriceKopecks
  const groupDiscount =
    qty >= Number(program?.groupDiscount?.minQuantity || Infinity)
      ? qty *
        Math.min(
          Number(program?.groupDiscount?.amountPerTicketKopecks || 0),
          price || 0
        )
      : 0
  const discountAmount =
    caps.discounts && discount !== '' ? ticketKopecks(discount) : 0
  const total =
    Number.isSafeInteger(price) &&
    Number.isSafeInteger(qty) &&
    Number.isSafeInteger(discountAmount)
      ? qty * price - groupDiscount - discountAmount
      : null
  const dirty =
    !result &&
    Boolean(
      programId ||
      sessionId ||
      quantity !== '1' ||
      unitPrice ||
      discount ||
      visitDate ||
      Object.values(contact).some(Boolean) ||
      received
    )
  usePartyUnsavedChanges(dirty, {
    label: 'продажа билетов',
    scope: `${companyId}:ticket-sale`,
    pending: command.busy,
  })
  const locked =
    command.busy || command.uncertain || !catalog.enabled || !caps.sell
  const external = program?.source === 'external'
  const reset = () => {
    if (
      !requestPartyLeave({
        kind: 'record',
        target: 'ticket-sale-new',
        scope: `${companyId}:ticket-sale`,
      })
    )
      return
    setProgramId('')
    setSessionId('')
    setQuantity('1')
    setUnitPrice('')
    setDiscount('')
    setVisitDate('')
    setContact({ name: '', phone: null, email: '' })
    setReceived(false)
    setMethod('cash')
    setResult(null)
    setError('')
  }
  const submit = async (event) => {
    event.preventDefault()
    if (command.busy || !catalog.enabled || !caps.sell || external) return
    setError('')
    if (
      !program ||
      !Number.isSafeInteger(qty) ||
      qty < 1 ||
      !Number.isSafeInteger(total) ||
      total < 0
    ) {
      setError('Выберите программу и проверьте количество, цену и скидку.')
      return
    }
    if (
      program.admission === 'session' &&
      (!session || session.status !== 'scheduled')
    ) {
      setError('Выберите действующий сеанс.')
      return
    }
    if (
      program.admission === 'session' &&
      (session.availabilityKnown === false ||
        (Number.isInteger(session.availableCount) &&
          qty > session.availableCount))
    ) {
      setError(
        'Для выбранного количества нет подтверждённых свободных билетов.'
      )
      return
    }
    const payload = {
      programId,
      quantity: qty,
      ...(program.admission === 'session' ? { sessionId } : {}),
      ...(caps.discounts
        ? { unitPriceKopecks: price, discountKopecks: discountAmount }
        : {}),
    }
    if (caps.contactsEdit && Object.values(contact).some(Boolean)) {
      const phone = contact.phone ? normalizePhoneNumber(contact.phone) : null
      if (contact.phone && !phone) {
        setError('Проверьте номер телефона.')
        return
      }
      payload.contact = {
        name: contact.name.trim(),
        ...(phone ? { phone } : {}),
        ...(contact.email.trim() ? { email: contact.email.trim() } : {}),
      }
    }
    if (program.admission === 'open' && visitDate) {
      payload.visitDate = visitDate
    }
    if (received && caps.payments && total > 0)
      payload.initialPayment = { amountKopecks: total, method }
    const saved = await command.run('sale.create', payload)
    if (saved) {
      setResult({
        sale: saved.data,
        paid: Boolean(payload.initialPayment),
        total,
      })
      onChanged()
    }
  }
  if (result)
    return (
      <section
        aria-label="Продажа сохранена"
        className={ticketCard + ' space-y-4'}
      >
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 font-semibold text-emerald-900"
        >
          {result.total === 0
            ? 'Бесплатное посещение оформлено.'
            : result.paid
              ? 'Продажа и полученная оплата записаны.'
              : 'Бронь создана. Получение оплаты не отмечено.'}
        </p>
        <p className="text-sm text-slate-600">
          {result.sale.programTitle || program?.title} ·{' '}
          {result.sale.quantity || quantity} билетов ·{' '}
          {ticketMoney(result.total)}
        </p>
        {result.paid ? (
          <p className="text-sm text-slate-600">
            Оплата отмечена сотрудником:{' '}
            {method === 'card' ? 'картой' : 'наличными'}. Фискальный чек и
            списание через терминал здесь не выполнялись.
          </p>
        ) : null}
        <button type="button" className={ticketPrimary} onClick={reset}>
          Новая продажа
        </button>
      </section>
    )
  return (
    <form
      aria-label="Продажа билетов"
      onSubmit={submit}
      className={ticketCard + ' space-y-4'}
    >
      <div>
        <h2 className="text-lg font-semibold text-sky-950">Продать билеты</h2>
        <p className="mt-1 text-sm text-slate-500">
          Выберите программу и количество. Оплату отмечайте после её получения.
        </p>
      </div>
      <TicketField label="Программа">
        <select
          required
          className={ticketControl + ' cursor-pointer'}
          value={programId}
          disabled={locked}
          onChange={(event) => {
            setProgramId(event.target.value)
            setSessionId('')
            setUnitPrice('')
            setDiscount('')
            setError('')
          }}
        >
          <option value="">Выберите программу</option>
          {(catalog.programs || [])
            .filter((item) => item.status !== 'archived')
            .map((item) => (
              <option key={item._id} value={String(item._id)}>
                {item.title} ·{' '}
                {item.admission === 'open' ? 'без сеанса' : 'по сеансам'}
              </option>
            ))}
        </select>
      </TicketField>
      {programList ? <TicketPager list={programList} /> : null}
      {external ? (
        <p
          role="status"
          className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          Остаток внешнего сервиса не подтверждён. Продажа этой программы здесь
          пока недоступна.
        </p>
      ) : program ? (
        <p className="text-xs text-slate-500">
          Учитываются билеты, выделенные для продаж в CRM. Остатки внешних
          каналов сюда не включены.
        </p>
      ) : null}
      {program?.admission === 'session' ? (
        <div className="space-y-2">
          <TicketField label="Сеанс">
            <select
              required
              className={ticketControl + ' cursor-pointer'}
              value={sessionId}
              disabled={locked || external}
              onChange={(event) => setSessionId(event.target.value)}
            >
              <option value="">Выберите дату и время</option>
              {choices.map((item) => (
                <option key={item._id} value={String(item._id)}>
                  {ticketDate(item.startsAt)}
                  {Number.isInteger(item.availableCount) &&
                  item.availabilityKnown !== false &&
                  !external
                    ? ` · доступно ${item.availableCount}`
                    : ' · остаток не подтверждён'}
                </option>
              ))}
            </select>
          </TicketField>
          <TicketPager list={sessions} />
          {!sessions.busy && !sessions.error && !choices.length ? (
            <p className="text-sm text-slate-500">
              В загруженных записях нет предстоящих сеансов.
              {sessions.nextCursor ? ' Загрузите следующие.' : ''}
            </p>
          ) : null}
        </div>
      ) : null}
      {program?.admission === 'open' ? (
        <div className="space-y-2">
          <TicketField label="Дата посещения (необязательно, время компании)">
            <input
              type="date"
              className={ticketControl}
              value={visitDate}
              disabled={locked || external}
              onChange={(event) => setVisitDate(event.target.value)}
            />
          </TicketField>
          <p className="text-xs text-slate-500">
            Без фиксированного времени. Продажа не бронирует площадку на весь
            день и не показывает число людей внутри.
          </p>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <TicketField label="Количество билетов">
          <input
            required
            className={ticketControl}
            type="number"
            min="1"
            step="1"
            max="1000"
            value={quantity}
            disabled={locked || external}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </TicketField>
        <TicketField label="Цена билета, ₽">
          <input
            className={ticketControl}
            inputMode="decimal"
            value={
              caps.discounts && unitPrice !== ''
                ? unitPrice
                : ticketRubles(program?.unitPriceKopecks)
            }
            disabled={locked || external || !caps.discounts}
            onChange={(event) => setUnitPrice(event.target.value)}
          />
        </TicketField>
        <TicketField label="Дополнительная скидка, ₽">
          <input
            className={ticketControl}
            inputMode="decimal"
            value={caps.discounts && discount !== '' ? discount : '0.00'}
            disabled={locked || external || !caps.discounts}
            onChange={(event) => setDiscount(event.target.value)}
          />
        </TicketField>
      </div>
      {groupDiscount > 0 ? (
        <p className="text-sm text-slate-600">
          Скидка за количество применена автоматически:{' '}
          {ticketMoney(groupDiscount)}.
        </p>
      ) : null}
      <p className="text-lg font-semibold text-sky-950">
        Итого: {ticketMoney(total)}
      </p>
      {caps.contactsEdit ? (
        <details className="rounded-xl border border-slate-200 p-3" open>
          <summary className="min-h-8 cursor-pointer text-sm font-semibold text-slate-700">
            Контакт покупателя
          </summary>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            <TicketField label="Имя покупателя">
              <input
                className={ticketControl}
                maxLength="120"
                value={contact.name}
                disabled={locked}
                onChange={(event) =>
                  setContact((previous) => ({
                    ...previous,
                    name: event.target.value,
                  }))
                }
              />
            </TicketField>
            <PhoneInput
              tone="party"
              noMargin
              fullWidth
              label="Телефон покупателя"
              value={contact.phone}
              disabled={locked}
              onChange={(phone) =>
                setContact((previous) => ({ ...previous, phone }))
              }
              className="w-full"
            />
            <TicketField label="Email покупателя">
              <input
                className={ticketControl}
                type="email"
                maxLength="160"
                value={contact.email}
                disabled={locked}
                onChange={(event) =>
                  setContact((previous) => ({
                    ...previous,
                    email: event.target.value,
                  }))
                }
              />
            </TicketField>
          </div>
        </details>
      ) : null}
      {caps.payments ? (
        <div className="space-y-3 rounded-xl bg-slate-50 p-3">
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={received}
              disabled={locked || external}
              onChange={(event) => setReceived(event.target.checked)}
            />
            Оплата уже получена
          </label>
          {received ? (
            <TicketField label="Способ полученной оплаты">
              <select
                className={ticketControl + ' cursor-pointer'}
                value={method}
                disabled={locked}
                onChange={(event) => setMethod(event.target.value)}
              >
                <option value="cash">Наличные</option>
                <option value="card">Карта</option>
              </select>
            </TicketField>
          ) : (
            <p className="text-xs text-slate-500">
              Без отметки оплаты будет создана бронь.
            </p>
          )}
        </div>
      ) : null}
      <div className="sticky bottom-[calc(var(--party-mobile-nav-height,0px)+env(safe-area-inset-bottom))] z-20 space-y-2 rounded-xl border-t border-sky-100 bg-white p-3 shadow-sm md:bottom-0">
        <TicketError>{error || command.error}</TicketError>
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            className={ticketPrimary}
            disabled={
              command.busy ||
              !catalog.enabled ||
              !caps.sell ||
              !program ||
              external
            }
          >
            {command.busy
              ? 'Сохраняем…'
              : command.uncertain
                ? 'Повторить сохранение'
                : total === 0 && program
                  ? 'Оформить бесплатное посещение'
                  : received && caps.payments
                    ? 'Записать продажу и оплату'
                    : 'Создать бронь'}
          </button>
          <button
            type="button"
            className={ticketButton}
            disabled={command.busy || command.uncertain}
            onClick={reset}
          >
            Очистить
          </button>
        </div>
      </div>
    </form>
  )
}
