'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
  getPartyTariffSelectOptions,
  getPartyTariffActionState,
} from '@helpers/partyBillingViewModel'
import { getPartyActivationWelcomeScenario } from '@helpers/partyWelcomeScenario'

const TARIFF_WELCOME_STEPS = [
  {
    id: 'location',
    title: 'Добавить точку',
    description: 'Подготовьте площадку или офис для будущих заказов.',
    href: '/company/locations',
  },
  {
    id: 'service',
    title: 'Добавить услугу',
    description: 'Заполните услуги, которые менеджеры смогут выбрать в заказе.',
    href: '/company/services',
  },
  {
    id: 'order',
    title: 'Создать первый заказ',
    description: 'Проверьте рабочий сценарий с клиентом, датой и командой.',
    href: '/company/orders',
  },
]

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

export default function CompanySettingsTariffsContent({ activeCompanyId }) {
  const [tariffs, setTariffs] = useState([])
  const [userData, setUserData] = useState(null)
  const [payments, setPayments] = useState([])
  const [billingConfig, setBillingConfig] = useState(null)
  const [billingDiagnostics, setBillingDiagnostics] = useState(null)
  const [selectedProvider, setSelectedProvider] = useState('')
  const [topUpAmount, setTopUpAmount] = useState('3000')
  const [loading, setLoading] = useState(true)
  const [payingTariffId, setPayingTariffId] = useState('')
  const [topUpLoading, setTopUpLoading] = useState(false)
  const [error, setError] = useState('')

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
        const providers = configRes.data?.providers ?? {}
        if (prev && providers[prev]) return prev
        return configRes.data?.defaultProvider || ''
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

  const providerOptions = useMemo(
    () => getPartyBillingProviderOptions(billingConfig),
    [billingConfig]
  )

  const activeTariff = useMemo(() => {
    if (!userData?.tariffId) return null
    return tariffs.find((item) => String(item?._id) === String(userData.tariffId))
  }, [tariffs, userData?.tariffId])

  const tariffSelectOptions = useMemo(
    () => getPartyTariffSelectOptions(tariffs),
    [tariffs]
  )
  const tariffAccessRows = useMemo(
    () => getPartyTariffAccessRows(userData?.access),
    [userData?.access]
  )
  const activationWelcome = useMemo(
    () =>
      getPartyActivationWelcomeScenario({
        billing: {
          ...userData,
          tariffTitle: activeTariff?.title,
        },
        onboardingSteps: TARIFF_WELCOME_STEPS,
      }),
    [activeTariff?.title, userData]
  )

  const handleTariffAction = useCallback(
    async (tariff) => {
      const request = getPartyTariffCheckoutRequest({
        tariff,
      })
      if (!request) {
        setError('Не удалось выбрать тариф')
        return
      }
      setPayingTariffId(String(tariff._id))
      setError('')
      try {
        const res = await apiJson(request.endpoint, {
          ...buildRequestOptions({
            method: 'POST',
            body: JSON.stringify(request.body),
          }),
        })
        if (!request.requiresPayment) {
          await loadData()
          return
        }
        if (res.data?.confirmationUrl) {
          window.open(res.data.confirmationUrl, '_blank')
          await loadData()
          return
        }
        setError('Не удалось создать платёж')
      } catch (err) {
        setError(err?.message || 'Не удалось изменить тариф')
      } finally {
        setPayingTariffId('')
      }
    },
    [buildRequestOptions, loadData]
  )

  const handleTopUpBalance = useCallback(async () => {
    const request = getPartyBalanceTopUpRequest({
      provider: selectedProvider,
      amount: topUpAmount,
    })
    if (!request) {
      setError('Выберите способ оплаты и укажите сумму пополнения')
      return
    }

    setTopUpLoading(true)
    setError('')
    try {
      const res = await apiJson(request.endpoint, {
        ...buildRequestOptions({
          method: 'POST',
          body: JSON.stringify(request.body),
        }),
      })
      if (res.data?.confirmationUrl) {
        window.open(res.data.confirmationUrl, '_blank')
        await loadData()
        return
      }
      setError('Не удалось создать платёж на пополнение баланса')
    } catch (err) {
      setError(err?.message || 'Не удалось пополнить баланс')
    } finally {
      setTopUpLoading(false)
    }
  }, [buildRequestOptions, loadData, selectedProvider, topUpAmount])

  if (loading) {
    return (
      <div className="rounded-2xl border border-sky-100 bg-white p-5 text-sm text-slate-500">
        Загружаем тарифы и платежи...
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {error && (
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-base font-semibold">Текущий тариф</div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Баланс пополняется через платежные провайдеры PartyCRM. Тариф
              компании оплачивается списанием с этого баланса.
            </p>
            <div className="mt-4 grid gap-2 text-sm text-slate-600">
              <div>
                Тариф:{' '}
                <span className="font-semibold text-slate-900">
                  {activeTariff?.title || 'Не выбран'}
                </span>
              </div>
              <label className="grid max-w-xl gap-2 pt-2">
                <span className="text-sm font-semibold text-slate-700">
                  Тариф компании
                </span>
                <select
                  value={userData?.tariffId || ''}
                  disabled={Boolean(payingTariffId)}
                  onChange={(event) => {
                    const tariff = tariffs.find(
                      (item) => String(item._id) === event.target.value
                    )
                    if (tariff) handleTariffAction(tariff)
                  }}
                  className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">Не выбран</option>
                  {tariffSelectOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <span className="text-xs text-slate-400">
                  Бесплатный тариф подключается сразу, платный списывает
                  стоимость с баланса компании.
                </span>
              </label>
              {userData?.tariffActiveUntil && (
                <div>Активен до {formatDate(userData.tariffActiveUntil)}</div>
              )}
              {userData?.access?.trialActive && userData?.trialEndsAt && (
                <div className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-700">
                  Пробный период до {formatDate(userData.trialEndsAt)}
                </div>
              )}
              <div>
                Баланс:{' '}
                <span className="font-semibold text-slate-900">
                  {formatMoney(userData?.balance ?? 0)}
                </span>
              </div>
              <div className="mt-2 grid gap-2 rounded-xl bg-slate-50 p-3">
                <div className="text-sm font-semibold text-slate-900">
                  Доступ по тарифу
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {tariffAccessRows.map((row) => (
                    <div
                      key={row.label}
                      className="flex items-center justify-between gap-3 rounded-lg bg-white px-3 py-2 text-xs"
                    >
                      <span className="text-slate-500">{row.label}</span>
                      <span className="font-semibold text-slate-800">
                        {row.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-700 transition-colors hover:bg-sky-50"
            onClick={loadData}
          >
            Обновить
          </button>
        </div>
        {activationWelcome && (
          <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
            <div className="text-sm font-semibold text-emerald-900">
              {activationWelcome.title}
            </div>
            <p className="mt-1 text-sm leading-6 text-emerald-700">
              {activationWelcome.description}
            </p>
            {activationWelcome.nextSteps.length > 0 && (
              <div className="mt-4 grid gap-2 md:grid-cols-3">
                {activationWelcome.nextSteps.map((step) => (
                  <a
                    key={step.id}
                    href={step.href}
                    className="rounded-xl border border-emerald-100 bg-white px-3 py-3 text-sm transition-colors hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    <span className="block font-semibold text-slate-900">
                      {step.title}
                    </span>
                    <span className="mt-1 block text-xs leading-5 text-slate-500">
                      {step.description}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="text-base font-semibold">Пополнение баланса</div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          YooKassa и Точка здесь используются только для оплаты сервиса
          PartyCRM. Это не настройки приема оплат от клиентов вашей компании.
        </p>
        {billingDiagnostics && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <div className="text-sm font-semibold text-slate-900">
              Диагностика платежей
            </div>
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
          </div>
        )}
        {providerOptions.length > 0 ? (
          <div className="mt-3 grid gap-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {providerOptions.map((provider) => (
                <button
                  key={provider.value}
                  type="button"
                  className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                    selectedProvider === provider.value
                      ? 'border-sky-500 bg-sky-50 text-sky-900'
                      : 'border-slate-200 hover:border-sky-300'
                  }`}
                  onClick={() => setSelectedProvider(provider.value)}
                >
                  <span className="block font-semibold">{provider.label}</span>
                  <span className="mt-1 block text-xs text-slate-500">
                    {provider.description}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <label className="grid gap-1.5 sm:w-56">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Сумма пополнения
                </span>
                <input
                  type="number"
                  min="100"
                  step="100"
                  value={topUpAmount}
                  onChange={(event) => setTopUpAmount(event.target.value)}
                  className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={handleTopUpBalance}
                disabled={topUpLoading || !selectedProvider}
                className="h-11 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {topUpLoading ? 'Создаём платёж...' : 'Пополнить баланс'}
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
            На сервере не настроены YooKassa или Точка. Бесплатный тариф можно
            выбрать без пополнения баланса.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="text-base font-semibold">Доступные тарифы</div>
        <div className="mt-4 grid gap-3">
          {tariffs.map((tariff) => {
            const action = getPartyTariffActionState({
              tariff,
              activeTariffId: userData?.tariffId,
              selectedProvider,
              loading: Boolean(payingTariffId),
            })
            return (
              <article
                key={tariff._id}
                className={`rounded-xl border p-4 ${
                  action.isActive
                    ? 'border-sky-500 bg-sky-50'
                    : 'border-slate-200 bg-white'
                }`}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div className="font-semibold text-slate-900">
                      {tariff.title}
                    </div>
                    {tariff.subtitle && (
                      <div className="mt-1 text-sm text-slate-500">
                        {tariff.subtitle}
                      </div>
                    )}
                    <div className="mt-2 text-2xl font-bold text-slate-900">
                      {action.isFree
                        ? 'Бесплатно'
                        : `${formatMoney(tariff.price)}/мес`}
                    </div>
                  </div>
                  {action.isActive ? (
                    <div className="rounded-lg bg-sky-100 px-3 py-2 text-sm font-semibold text-sky-700">
                      Текущий тариф
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={action.disabled}
                      onClick={() => handleTariffAction(tariff)}
                    >
                      {payingTariffId === String(tariff._id)
                        ? 'Обработка...'
                        : action.buttonLabel}
                    </button>
                  )}
                </div>
                {Array.isArray(tariff.features) && tariff.features.length > 0 && (
                  <ul className="mt-4 grid gap-1 text-sm text-slate-600 md:grid-cols-2">
                    {tariff.features.map((feature) => (
                      <li key={feature}>- {feature}</li>
                    ))}
                  </ul>
                )}
              </article>
            )
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="text-base font-semibold">История платежей</div>
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
    </div>
  )
}
