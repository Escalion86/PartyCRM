'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiJson } from '@helpers/apiClient'

const button =
  'min-h-10 cursor-pointer rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-semibold text-sky-800 disabled:cursor-not-allowed disabled:opacity-50'
const control =
  'min-h-10 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm'
const money = (kopecks) =>
  new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
  }).format(Number(kopecks || 0) / 100)
const date = (value) =>
  value
    ? new Date(value).toLocaleDateString('ru-RU', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    : '—'
const defaultPeriod = () => {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${now.getDate() <= 15 ? 'H1' : 'H2'}`
}

export default function PartyPayrollWorkspace({ companies }) {
  const [companyId, setCompanyId] = useState(companies[0]?.id || '')
  const [periodKey, setPeriodKey] = useState(defaultPeriod)
  const [statement, setStatement] = useState(null)
  const [settlements, setSettlements] = useState([])
  const [staff, setStaff] = useState([])
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const headers = useMemo(
    () => ({ 'x-partycrm-company-id': companyId }),
    [companyId]
  )

  const load = useCallback(async () => {
    if (!companyId || !periodKey) return
    setBusy(true)
    setError('')
    try {
      const query = new URLSearchParams({ periodKey })
      const [statementsResult, settlementsResult, staffResult] =
        await Promise.all([
          apiJson(`/api/party/payroll-statements?${query}`, {
            headers,
            cache: 'no-store',
          }),
          apiJson(`/api/party/financial-settlements?${query}`, {
            headers,
            cache: 'no-store',
          }),
          apiJson('/api/party/staff', { headers, cache: 'no-store' }),
        ])
      setStatement(statementsResult.data?.[0] || null)
      setSettlements(settlementsResult.data || [])
      setStaff(staffResult.data || [])
    } catch (cause) {
      setError(cause.message)
    } finally {
      setBusy(false)
    }
  }, [companyId, headers, periodKey])
  useEffect(() => {
    load()
  }, [load])

  const mutate = async (path, body) => {
    setBusy(true)
    setError('')
    try {
      await apiJson(path, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      })
      await load()
    } catch (cause) {
      setError(cause.message)
      setBusy(false)
    }
  }
  const changeStatement = async (action) => {
    setBusy(true)
    setError('')
    try {
      await apiJson(`/api/party/payroll-statements/${statement._id}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ action }),
      })
      await load()
    } catch (cause) {
      setError(cause.message)
      setBusy(false)
    }
  }
  const pay = (settlement) =>
    mutate(`/api/party/financial-settlements/${settlement._id}/operations`, {
      type: 'payment',
      amountKopecks: settlement.totals.balance,
      comment: `Выплата по ведомости ${periodKey}`,
      idempotencyKey: crypto.randomUUID(),
    })
  const staffById = new Map(staff.map((person) => [String(person._id), person]))
  const name = (staffId) => {
    const person = staffById.get(String(staffId))
    return (
      [person?.firstName, person?.secondName].filter(Boolean).join(' ') ||
      'Сотрудник'
    )
  }

  return (
    <section className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">
      <p className="text-sm font-semibold text-sky-700 uppercase">
        Финансы команды
      </p>
      <h1 className="mt-2 text-3xl font-semibold">Ведомости выплат</h1>
      <p className="mt-3 max-w-3xl text-slate-600">
        Сверьте каждый праздник, утвердите расчёты, зафиксируйте выплаты и затем
        закройте ведомость.
      </p>
      <div className="mt-6 flex flex-col gap-3 rounded-xl border border-sky-100 bg-white p-4 sm:flex-row sm:items-end">
        {companies.length > 1 && (
          <label className="grid gap-1 text-sm">
            Компания
            <select
              className={control}
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="grid gap-1 text-sm">
          Расчётный период
          <input
            className={control}
            value={periodKey}
            pattern="\d{4}-\d{2}-H[12]"
            onChange={(event) => setPeriodKey(event.target.value)}
            placeholder="2026-09-H1"
          />
        </label>
        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => mutate('/api/party/payroll-statements', { periodKey })}
        >
          {statement?.status === 'draft'
            ? 'Пересобрать ведомость'
            : 'Сформировать ведомость'}
        </button>
      </div>
      {statement && (
        <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Ведомость {statement.periodKey}</h2>
              <p className="mt-1 text-sm text-slate-600">
                Сверка: {date(statement.reconciliationStart)}–
                {date(
                  new Date(+new Date(statement.reconciliationEndExclusive) - 1)
                )}
                . Выплата: {date(statement.paymentStart)}–
                {date(new Date(+new Date(statement.paymentEndExclusive) - 1))}.
              </p>
            </div>
            <span className="rounded bg-white px-2 py-1 text-sm font-semibold">
              {statement.status === 'draft'
                ? 'Черновик'
                : statement.status === 'approved'
                  ? 'Утверждена'
                  : 'Выплачена'}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {statement.status === 'draft' && (
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={() => changeStatement('approve')}
              >
                Утвердить ведомость
              </button>
            )}
            {statement.status === 'approved' && (
              <button
                type="button"
                className={button}
                disabled={busy}
                onClick={() => changeStatement('mark_paid')}
              >
                Закрыть как выплаченную
              </button>
            )}
          </div>
        </div>
      )}
      <div className="mt-5 grid gap-3">
        {settlements.map((item) => (
          <article
            key={item._id}
            className="rounded-xl border border-sky-100 bg-white p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold">{name(item.staffId)}</h3>
                <p className="text-sm text-slate-500">
                  Праздник {date(item.eventDate)} ·{' '}
                  {item.status === 'approved'
                    ? 'расчёт утверждён'
                    : 'расчёт не утверждён'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-slate-500">Остаток</p>
                <p className="text-lg font-semibold">
                  {money(item.totals?.balance)}
                </p>
              </div>
            </div>
            {statement?.status === 'approved' &&
              item.status === 'approved' &&
              item.totals?.balance > 0 && (
                <button
                  type="button"
                  className={`${button} mt-3`}
                  disabled={busy}
                  onClick={() => pay(item)}
                >
                  Зафиксировать выплату {money(item.totals.balance)}
                </button>
              )}
          </article>
        ))}
        {!busy && !settlements.length && (
          <p className="rounded-xl border border-sky-100 bg-white p-4 text-sm text-slate-500">
            В этом периоде расчётов пока нет.
          </p>
        )}
      </div>
      {busy && <p className="mt-4 text-sm text-slate-500">Обновляем данные…</p>}
      {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
    </section>
  )
}
