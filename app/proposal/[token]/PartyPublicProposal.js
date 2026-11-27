'use client'

import { useEffect, useRef, useState } from 'react'

const moneyFormat = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  minimumFractionDigits: 0,
})
const quantityFormat = new Intl.NumberFormat('ru-RU', {
  maximumFractionDigits: 5,
})
const dateFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}

const buttonClass =
  'inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-default disabled:opacity-60'
const primaryButtonClass = `${buttonClass} bg-sky-800 text-white hover:bg-sky-900`
const secondaryButtonClass = `${buttonClass} border border-slate-300 bg-white text-slate-800 hover:bg-slate-50`

const termFields = [
  ['includedText', 'В стоимость включено'],
  ['paymentTerms', 'Условия оплаты'],
  ['additionalTerms', 'Дополнительные условия'],
  ['taxText', 'Налоги'],
]

function ProposalDate({ label, value, timeZone }) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  let displayDate
  try {
    displayDate = date.toLocaleDateString('ru-RU', { ...dateFormatOptions, timeZone: timeZone || 'UTC' })
  } catch (error) {
    if (!(error instanceof RangeError)) throw error
    displayDate = date.toLocaleDateString('ru-RU', { ...dateFormatOptions, timeZone: 'UTC' })
  }

  return (
    <div>
      <dt className="text-sm font-medium text-slate-600">{label}</dt>
      <dd className="mt-1 font-semibold text-slate-900">
        <time dateTime={date.toISOString()}>{displayDate}</time>
      </dd>
    </div>
  )
}

function ProposalVariant({ variant, index, multiple, selected, disabled, busy, canRespond, onRespond }) {
  const terms = termFields.filter(([key]) => variant[key])
  return (
    <section
      aria-labelledby={`proposal-variant-${index}`}
      className={`min-w-0 rounded-2xl border bg-white p-5 sm:p-7 ${selected ? 'border-sky-700' : 'border-slate-200'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 id={`proposal-variant-${index}`} className="text-xl font-bold text-slate-950 [overflow-wrap:anywhere]">
            {multiple ? `Вариант ${index + 1}` : 'Состав предложения'}
          </h2>
          {variant.number ? (
            <p className="mt-1 text-sm text-slate-600 [overflow-wrap:anywhere]">
              КП № {variant.number}{variant.version > 1 ? ` · версия ${variant.version}` : ''}
            </p>
          ) : null}
        </div>
        {selected ? <span className="rounded-md bg-sky-100 px-2.5 py-1 text-sm font-semibold text-sky-900">Выбрано</span> : null}
      </div>

      <ul className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
        {variant.items.map((item, itemIndex) => (
          <li key={itemIndex} className="grid gap-x-5 gap-y-1.5 py-3.5 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 [overflow-wrap:anywhere]">
              <p className="font-semibold text-slate-900">{item.title}</p>
              {item.description ? (
                <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-slate-700">{item.description}</p>
              ) : null}
              <p className="mt-1 text-sm text-slate-600">
                {quantityFormat.format(item.quantity)} {item.unit || 'шт.'} × {moneyFormat.format(item.unitPrice)}
                {item.durationMinutes ? ` · ${item.durationMinutes} мин` : ''}
                {item.discount > 0 ? ` · скидка ${moneyFormat.format(item.discount)}` : ''}
              </p>
            </div>
            <p className="font-semibold tabular-nums text-slate-900 sm:text-right">{moneyFormat.format(item.total)}</p>
          </li>
        ))}
      </ul>

      <dl className="mt-5 space-y-2 tabular-nums">
        {variant.discount > 0 ? (
          <>
            <div className="flex flex-wrap justify-between gap-x-4 text-sm text-slate-700">
              <dt>Стоимость позиций</dt>
              <dd>{moneyFormat.format(variant.subtotal)}</dd>
            </div>
            <div className="flex flex-wrap justify-between gap-x-4 text-sm text-slate-700">
              <dt>Скидка на предложение</dt>
              <dd>−{moneyFormat.format(variant.discount)}</dd>
            </div>
          </>
        ) : null}
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 font-bold text-slate-950">
          <dt>Итого</dt>
          <dd className="text-2xl">{moneyFormat.format(variant.total)}</dd>
        </div>
      </dl>

      {terms.length > 0 ? (
        <dl className="mt-5 space-y-3 border-t border-slate-200 pt-5 text-sm">
          {terms.map(([key, label]) => (
            <div key={key}>
              <dt className="font-semibold text-slate-900">{label}</dt>
              <dd className="mt-1 whitespace-pre-wrap leading-6 text-slate-700 [overflow-wrap:anywhere]">{variant[key]}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {canRespond ? (
        <button
          type="button"
          className={`${selected ? secondaryButtonClass : primaryButtonClass} mt-5 w-full sm:w-auto`}
          disabled={disabled}
          onClick={() => onRespond(selected ? 'reset' : 'accept', index)}
          aria-label={multiple && !busy ? `${selected ? 'Отменить выбор варианта' : 'Выбрать вариант'} ${index + 1}` : undefined}
        >
          {busy ? 'Сохраняем…' : selected ? 'Отменить выбор' : multiple ? 'Выбрать вариант' : 'Принять предложение'}
        </button>
      ) : null}
    </section>
  )
}

export default function PartyPublicProposal({ token, initialProposal }) {
  const [proposal, setProposal] = useState(initialProposal)
  const [pending, setPending] = useState(null)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const errorRef = useRef(null)
  const { companyName, eventTitle, eventDate, validUntil, timeZone, decision, selectedVariant, canRespond, variants } = proposal
  const multiple = variants.length > 1

  useEffect(() => {
    if (error) errorRef.current?.focus()
  }, [error])

  const respond = async (action, variant) => {
    if (pending || stale || !canRespond) return
    setPending({ action, variant })
    setError('')
    try {
      const response = await fetch(`/api/party/public/proposals/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ action, ...(action === 'accept' ? { variant } : {}), revision: proposal.revision }),
      })
      if (response.status === 409) {
        setStale(true)
        setError('Предложение изменилось. Обновите страницу, чтобы увидеть актуальные условия.')
        return
      }
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success || !result.data) {
        const message = result?.message || result?.error?.message || result?.error
        throw new Error(typeof message === 'string' ? message : 'Не удалось сохранить ответ. Попробуйте ещё раз.')
      }
      setProposal(result.data)
    } catch (requestError) {
      setError(requestError instanceof TypeError ? 'Проверьте подключение к интернету и попробуйте ещё раз.' : requestError.message)
    } finally {
      setPending(null)
    }
  }

  const answer = decision === 'accepted'
    ? multiple ? `Вы выбрали вариант ${selectedVariant + 1}.` : 'Вы приняли предложение.'
    : decision === 'rejected' ? 'Вы отклонили предложение.' : ''
  const status = [answer, !canRespond ? 'Приём ответов завершён.' : ''].filter(Boolean).join(' ')

  return (
    <main className="min-h-dvh bg-slate-100 px-4 py-6 text-slate-950 selection:bg-sky-200 sm:py-12">
      <article className="mx-auto w-full max-w-2xl space-y-5">
        <header className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
          <h1 className="text-balance text-3xl font-bold tracking-tight text-sky-950 sm:text-4xl">
            Коммерческое предложение
          </h1>
          {eventTitle ? <p className="mt-3 text-lg font-semibold [overflow-wrap:anywhere]">{eventTitle}</p> : null}
          {companyName ? <p className="mt-1 text-slate-700 [overflow-wrap:anywhere]">{companyName}</p> : null}
          {eventDate || validUntil ? (
            <dl className="mt-5 grid gap-x-6 gap-y-4 border-t border-slate-200 pt-5 sm:grid-cols-2">
              <ProposalDate label="Дата мероприятия" value={eventDate} timeZone={timeZone} />
              <ProposalDate label="Действует до" value={validUntil} timeZone={timeZone} />
            </dl>
          ) : null}
        </header>

        <p role="status" className={status ? 'rounded-lg bg-sky-100 px-4 py-3 text-sm font-medium text-sky-950' : 'sr-only'}>
          {status}
        </p>

        {variants.map((variant, index) => (
          <ProposalVariant
            key={`${variant.number}-${variant.version}-${index}`}
            variant={variant}
            index={index}
            multiple={multiple}
            selected={decision === 'accepted' && selectedVariant === index}
            disabled={Boolean(pending) || stale}
            busy={pending?.variant === index}
            canRespond={canRespond}
            onRespond={respond}
          />
        ))}

        {canRespond ? (
          <button
            type="button"
            className={`${secondaryButtonClass} w-full sm:w-auto`}
            disabled={Boolean(pending) || stale}
            onClick={() => respond(decision === 'rejected' ? 'reset' : 'reject')}
          >
            {pending && pending.variant === undefined ? 'Сохраняем…' : decision === 'rejected' ? 'Отменить отказ' : 'Отклонить предложение'}
          </button>
        ) : null}

        {error ? (
          <div ref={errorRef} tabIndex={-1} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-950">
            <p>{error}</p>
            {stale ? (
              <button type="button" className={secondaryButtonClass} onClick={() => window.location.reload()}>
                Обновить страницу
              </button>
            ) : null}
          </div>
        ) : null}
      </article>
    </main>
  )
}
