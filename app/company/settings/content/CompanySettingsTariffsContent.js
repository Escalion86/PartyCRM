'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Modal from '@components/Modal'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import { apiJson } from '@helpers/apiClient'
import { formatMoney } from '@helpers/formatMoney'
import {
  getPartyBalanceTopUpRequest,
  getPartyTariffCheckoutRequest,
} from '@helpers/partyBillingCheckout'
import {
  getPartyBillingProviderOptions,
  getPartyPaymentStatusLabel,
  getPartyTariffAccessRows,
  getPartyTariffActionState,
} from '@helpers/partyBillingViewModel'
import {
  getPartyCompanyTariffAccess,
  serializePartyTariffAccess,
} from '@helpers/partyTariffAccess'

const formatDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const PROVIDER_LABELS = {
  yookassa: 'YooKassa',
  tochka: 'Точка',
}
const DEFAULT_TOP_UP_AMOUNT = '3000'
const sectionClass = 'min-w-0 rounded-2xl border border-sky-100 bg-white p-4 sm:p-5'
const buttonClass =
  'min-h-11 cursor-pointer rounded-lg px-4 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-50'
const primaryButton = `${buttonClass} bg-sky-700 text-white hover:bg-sky-800`
const secondaryButton = `${buttonClass} border border-sky-200 text-sky-800 hover:bg-sky-50`
const errorClass = 'rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-800'

function TariffAccessList({ access }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
      {getPartyTariffAccessRows(access).map(({ label, value }) => (
        <div key={label} className="flex justify-between gap-2">
          <dt className="text-slate-600">{label}</dt>
          <dd className="text-right font-medium text-slate-900">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export default function CompanySettingsTariffsContent({ activeCompanyId }) {
  const [tariffs, setTariffs] = useState([])
  const [userData, setUserData] = useState(null)
  const [payments, setPayments] = useState([])
  const [billingConfig, setBillingConfig] = useState(null)
  const [billingDiagnostics, setBillingDiagnostics] = useState(null)
  const [selectedProvider, setSelectedProvider] = useState('')
  const [topUpAmount, setTopUpAmount] = useState(DEFAULT_TOP_UP_AMOUNT)
  const [loading, setLoading] = useState(true)
  const [payingTariffId, setPayingTariffId] = useState('')
  const [topUpLoading, setTopUpLoading] = useState(false)
  const [error, setError] = useState('')
  const [dialog, setDialog] = useState('')
  const [actionError, setActionError] = useState('')
  const submitting = useRef(false)
  const actionPending = topUpLoading || Boolean(payingTariffId)
  const topUpDirty = dialog === 'balance' && topUpAmount !== DEFAULT_TOP_UP_AMOUNT
  usePartyUnsavedChanges(topUpDirty, {
    label: 'сумма пополнения баланса',
    scope: activeCompanyId,
    pending: actionPending,
  })

  const openDialog = (nextDialog) => {
    setActionError('')
    setDialog(nextDialog)
  }

  const closeDialog = () => {
    if (submitting.current) return
    setDialog('')
    setTopUpAmount(DEFAULT_TOP_UP_AMOUNT)
  }

  const buildRequestOptions = useCallback(
    (options = {}) => ({
      ...options,
      headers: {
        ...(options.headers ?? {}),
        ...(activeCompanyId
          ? { 'x-partycrm-company-id': activeCompanyId }
          : {}),
      },
    }),
    [activeCompanyId]
  )

  const loadData = useCallback(async () => {
    if (!activeCompanyId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const [
        tariffsRes,
        userRes,
        paymentsRes,
        configRes,
        diagnosticsRes,
      ] = await Promise.all([
        apiJson('/api/party/tariffs', { cache: 'no-store' }),
        apiJson(
          '/api/party/billing/me',
          buildRequestOptions({ cache: 'no-store' })
        ),
        apiJson(
          '/api/party/billing/payments?limit=20',
          buildRequestOptions({ cache: 'no-store' })
        ),
        apiJson('/api/party/billing/config', { cache: 'no-store' }),
        apiJson(
          '/api/party/billing/diagnostics',
          buildRequestOptions({ cache: 'no-store' })
        ),
      ])
      setTariffs(tariffsRes.data ?? [])
      setUserData(userRes.data ?? null)
      setPayments(paymentsRes.data ?? [])
      setBillingConfig(configRes.data ?? null)
      setBillingDiagnostics(diagnosticsRes.data ?? null)
      setSelectedProvider((prev) => {
        const options = getPartyBillingProviderOptions(configRes.data)
        if (options.some(({ value }) => value === prev)) return prev
        const preferredProvider = options.find(
          ({ value }) => value === configRes.data?.defaultProvider
        )
        return preferredProvider?.value ?? options[0]?.value ?? ''
      })
    } catch (err) {
      setError(err?.message || 'Не удалось загрузить тарифы')
    } finally {
      setLoading(false)
    }
  }, [activeCompanyId, buildRequestOptions])

  useEffect(() => {
    loadData()
  }, [loadData])

  const providerOptions = getPartyBillingProviderOptions(billingConfig)
  const availableTariffs = dialog === 'tariff' ? tariffs.filter((tariff) => !tariff.hidden) : []
  const activeTariff = userData?.access?.tariff ??
    tariffs.find((tariff) => String(tariff._id) === String(userData?.tariffId))

  const handleTariffAction = async (tariff) => {
    if (submitting.current) return
    const request = getPartyTariffCheckoutRequest({ tariff })
    if (!request) {
      setActionError('Не удалось выбрать тариф')
      return
    }
    submitting.current = true
    setPayingTariffId(String(tariff._id))
    setActionError('')
    try {
      await apiJson(request.endpoint, buildRequestOptions({
        method: 'POST',
        body: JSON.stringify(request.body),
      }))
      await loadData()
      setDialog('')
    } catch (err) {
      setActionError(err?.message || 'Не удалось изменить тариф')
    } finally {
      submitting.current = false
      setPayingTariffId('')
    }
  }

  const handleTopUpBalance = async (event) => {
    event.preventDefault()
    if (submitting.current) return
    const request = getPartyBalanceTopUpRequest({
      provider: selectedProvider,
      amount: topUpAmount,
    })
    if (!request) {
      setActionError('Выберите способ оплаты и укажите сумму пополнения')
      return
    }

    submitting.current = true
    setTopUpLoading(true)
    setActionError('')
    try {
      const res = await apiJson(request.endpoint, buildRequestOptions({
        method: 'POST',
        body: JSON.stringify(request.body),
      }))
      if (res.data?.confirmationUrl) {
        window.open(res.data.confirmationUrl, '_blank')
        setTopUpAmount(DEFAULT_TOP_UP_AMOUNT)
        await loadData()
        setDialog('')
        return
      }
      setActionError('Не удалось создать платёж на пополнение баланса')
    } catch (err) {
      setActionError(err?.message || 'Не удалось пополнить баланс')
    } finally {
      submitting.current = false
      setTopUpLoading(false)
    }
  }

  if (loading && !userData) {
    return (
      <div role="status" className={`${sectionClass} text-sm text-slate-600`}>
        Загружаем тарифы и платежи...
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {error && <p role="alert" className={errorClass}>{error}</p>}

      <section className={sectionClass}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h2 className="font-semibold text-slate-900">Текущий тариф</h2>
          <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-900">
            {activeTariff?.title || 'Не выбран'}
          </span>
          <button
            type="button"
            className={secondaryButton}
            onClick={() => openDialog('tariff')}
            disabled={!userData || loading}
          >
            Сменить тариф
          </button>
        </div>
        {userData?.tariffActiveUntil && (
          <p className="mt-3 text-sm text-slate-600">
            Активен до {formatDate(userData.tariffActiveUntil)}
          </p>
        )}
        {userData?.access?.trialActive && userData?.trialEndsAt && (
          <p className="mt-3 text-sm font-medium text-emerald-800">
            Пробный период до {formatDate(userData.trialEndsAt)}
          </p>
        )}
        {userData?.access && (
          <div className="mt-4 border-t border-slate-200 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-900">Доступ по тарифу</h3>
            <TariffAccessList access={userData.access} />
          </div>
        )}
      </section>

      <section className={`${sectionClass} flex flex-wrap items-center justify-between gap-3`}>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-semibold text-slate-900">Баланс</h2>
          <p className="text-xl font-semibold tabular-nums text-slate-900">
            {userData ? formatMoney(userData.balance ?? 0) : '—'}
          </p>
        </div>
        <button
          type="button"
          className={primaryButton}
          onClick={() => openDialog('balance')}
          disabled={!userData || loading}
        >
          Пополнить
        </button>
      </section>

      <section className={sectionClass}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold text-slate-900">История платежей</h2>
          <button
            type="button"
            className={secondaryButton}
            onClick={loadData}
            disabled={loading}
          >
            {loading ? 'Обновляем…' : 'Обновить'}
          </button>
        </div>
        {payments.length > 0 ? (
          <div className="mt-4 grid gap-2">
            {payments.map((payment) => (
              <div
                key={payment._id}
                className="flex flex-col gap-2 rounded-xl bg-slate-50 p-3 text-sm md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <div className="font-medium text-slate-900">
                    {payment.comment || payment.purpose || 'Платёж'}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {formatDate(payment.createdAt)}
                  </div>
                </div>
                <div className="text-left md:text-right">
                  <div
                    className={`font-semibold ${
                      payment.type === 'charge'
                        ? 'text-red-600'
                        : 'text-green-600'
                    }`}
                  >
                    {payment.type === 'charge' ? '-' : '+'}
                    {formatMoney(payment.amount)}
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {getPartyPaymentStatusLabel(payment.status)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate-500">Платежей пока нет.</p>
        )}
      </section>

      <Modal
        open={dialog === 'tariff'}
        title="Сменить тариф"
        tone="party"
        size="lg"
        onClose={closeDialog}
        disableBackdropClick={actionPending}
      >
        <div className="grid gap-3">
          {dialog === 'tariff' && actionError && (
            <p role="alert" className={errorClass}>{actionError}</p>
          )}
          {availableTariffs.map((tariff) => {
            const action = getPartyTariffActionState({
              tariff,
              activeTariffId: userData?.tariffId,
              loading: actionPending,
            })
            const access = serializePartyTariffAccess(
              getPartyCompanyTariffAccess({ tariffId: tariff._id }, [tariff])
            )
            return (
              <article
                key={tariff._id}
                className={`min-w-0 rounded-xl border p-4 ${
                  action.isActive ? 'border-sky-300 bg-sky-50' : 'border-slate-200'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold text-slate-900">{tariff.title}</h3>
                    {tariff.subtitle && (
                      <p className="mt-1 text-sm text-slate-600">{tariff.subtitle}</p>
                    )}
                    <p className="mt-1 text-lg font-semibold tabular-nums text-slate-900">
                      {action.isFree ? 'Бесплатно' : `${formatMoney(tariff.price)}/мес`}
                    </p>
                  </div>
                  {action.isActive ? (
                    <span className="rounded-full bg-sky-100 px-3 py-1 text-sm font-semibold text-sky-900">
                      Текущий тариф
                    </span>
                  ) : (
                    <button
                      type="button"
                      className={primaryButton}
                      disabled={action.disabled}
                      onClick={() => handleTariffAction(tariff)}
                    >
                      {payingTariffId === String(tariff._id) ? 'Подключаем…' : action.buttonLabel}
                    </button>
                  )}
                </div>
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <TariffAccessList access={access} />
                  {Array.isArray(tariff.features) && tariff.features.length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {tariff.features.map((feature) => <li key={feature}>{feature}</li>)}
                    </ul>
                  )}
                </div>
              </article>
            )
          })}
          {!availableTariffs.length && (
            <p className="text-sm text-slate-600">Тарифов для подключения пока нет.</p>
          )}
        </div>
      </Modal>

      <Modal
        open={dialog === 'balance'}
        title="Пополнение баланса"
        tone="party"
        size="sm"
        onClose={closeDialog}
        disableBackdropClick={actionPending}
        hasUnsavedChanges={topUpDirty && !actionPending}
        unsavedChangesMessage="Закрыть окно и сбросить введённую сумму?"
      >
        <div className="grid gap-4">
          {dialog === 'balance' && actionError && (
            <p role="alert" className={errorClass}>{actionError}</p>
          )}
          {providerOptions.length > 0 ? (
            <form className="grid gap-4" onSubmit={handleTopUpBalance}>
              <fieldset className="grid min-w-0 gap-2" disabled={topUpLoading}>
                <legend className="mb-2 text-sm font-medium text-slate-900">Способ оплаты</legend>
                {providerOptions.map((provider) => (
                  <label
                    key={provider.value}
                    className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-slate-200 p-3 text-sm has-checked:border-sky-400 has-checked:bg-sky-50"
                  >
                    <input
                      type="radio"
                      name="payment-provider"
                      value={provider.value}
                      checked={selectedProvider === provider.value}
                      onChange={() => setSelectedProvider(provider.value)}
                      className="size-4 shrink-0 cursor-pointer accent-sky-700"
                    />
                    <span>
                      <span className="block font-semibold text-slate-900">{provider.label}</span>
                      <span className="block text-xs text-slate-600">{provider.description}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
              <label className="grid gap-1 text-sm font-medium text-slate-900">
                Сумма пополнения
                <input
                  type="number"
                  min="100"
                  step="1"
                  required
                  inputMode="numeric"
                  value={topUpAmount}
                  disabled={topUpLoading}
                  onChange={(event) => setTopUpAmount(event.target.value)}
                  className="min-h-11 min-w-0 rounded-lg border border-slate-300 px-3 text-base focus-visible:outline-2 focus-visible:outline-sky-700 disabled:opacity-50"
                />
              </label>
              <button
                type="submit"
                disabled={topUpLoading || !selectedProvider}
                className={primaryButton}
              >
                {topUpLoading ? 'Создаём платёж…' : 'Пополнить баланс'}
              </button>
            </form>
          ) : (
            <p className="text-sm text-slate-600">Способы оплаты пока не подключены.</p>
          )}
          {billingDiagnostics && (
            <details className="border-t border-slate-200 pt-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-700">
                Диагностика платежей
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {Object.entries(billingDiagnostics.providers ?? {}).map(
                  ([providerKey, provider]) => (
                    <div
                      key={providerKey}
                      className="rounded-xl border border-slate-100 bg-white p-3 text-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-slate-900">
                          {PROVIDER_LABELS[providerKey] || providerKey}
                        </span>
                        <span
                          className={`rounded-full px-2 py-1 text-xs font-semibold ${
                            provider.readyForTestPayment
                              ? 'bg-emerald-50 text-emerald-700'
                              : 'bg-amber-50 text-amber-700'
                          }`}
                        >
                          {provider.readyForTestPayment
                            ? 'Готов к тесту'
                            : 'Нужна настройка'}
                        </span>
                      </div>
                      {(provider.missing ?? []).length > 0 && (
                        <p className="mt-2 text-xs leading-5 text-amber-700">
                          Не хватает: {provider.missing.join(', ')}
                        </p>
                      )}
                      {(provider.blockers ?? []).length > 0 && (
                        <p className="mt-2 text-xs leading-5 text-red-700">
                          Блокеры: {provider.blockers.join(', ')}
                        </p>
                      )}
                      {provider.webhookUrl && (
                        <p className="mt-2 break-all text-xs leading-5 text-slate-500">
                          Webhook: {provider.webhookUrl}
                        </p>
                      )}
                    </div>
                  )
                )}
              </div>
            </details>
          )}
        </div>
      </Modal>
    </div>
  )
}
