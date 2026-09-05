"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { apiJson } from "@helpers/apiClient"
import { formatMoney } from "@helpers/formatMoney"
import {
  PARTY_BILLING_PROVIDER_ENDPOINTS,
  getPartyTariffCheckoutRequest,
  isFreePartyTariff,
} from "@helpers/partyBillingCheckout"

const PAYMENT_PROVIDERS = {
  yookassa: {
    label: "ЮKassa",
    description: "Карта, СБП и другие способы ЮKassa",
    endpoint: PARTY_BILLING_PROVIDER_ENDPOINTS.yookassa,
  },
  tochka: {
    label: "Точка",
    description: "СБП через Точка Банк",
    endpoint: PARTY_BILLING_PROVIDER_ENDPOINTS.tochka,
  },
}

const ACTIVE_COMPANY_STORAGE_KEY = 'partycrm.activeCompanyId'

const PartyBillingModal = ({ open, onClose }) => {
  const [tariffs, setTariffs] = useState([])
  const [userData, setUserData] = useState(null)
  const [billingConfig, setBillingConfig] = useState(null)
  const [loading, setLoading] = useState(true)
  const [topupAmount, setTopupAmount] = useState("")
  const [selectedProvider, setSelectedProvider] = useState("")
  const [paying, setPaying] = useState(false)
  const [payingTariff, setPayingTariff] = useState(false)
  const [error, setError] = useState("")
  const [payments, setPayments] = useState([])
  const [activeCompanyId, setActiveCompanyId] = useState("")

  useEffect(() => {
    if (!open || typeof window === "undefined") return
    setActiveCompanyId(
      window.localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY) || ""
    )
  }, [open])

  const buildCompanyRequestOptions = useCallback(
    (options = {}) => ({
      ...options,
      headers: {
        ...(options.headers ?? {}),
        ...(activeCompanyId
          ? { "x-partycrm-company-id": activeCompanyId }
          : {}),
      },
    }),
    [activeCompanyId]
  )

  const loadData = useCallback(async () => {
    if (!activeCompanyId) {
      setLoading(false)
      setError("Не выбрана активная компания")
      return
    }
    setLoading(true)
    try {
      const [tariffsRes, userRes, paymentsRes, configRes] = await Promise.all([
        apiJson("/api/party/tariffs", { cache: "no-store" }),
        apiJson(
          "/api/party/billing/me",
          buildCompanyRequestOptions({ cache: "no-store" })
        ),
        apiJson(
          "/api/party/billing/payments?limit=20",
          buildCompanyRequestOptions({ cache: "no-store" })
        ),
        apiJson("/api/party/billing/config", { cache: "no-store" }),
      ])
      setTariffs(tariffsRes.data ?? [])
      setUserData(userRes.data ?? null)
      setPayments(paymentsRes.data ?? [])
      setBillingConfig(configRes.data ?? null)
      setSelectedProvider((prev) => {
        const providers = configRes.data?.providers ?? {}
        if (prev && providers[prev]) return prev
        return configRes.data?.defaultProvider || ""
      })
    } catch (e) {
      setError("Не удалось загрузить данные")
    } finally {
      setLoading(false)
    }
  }, [activeCompanyId, buildCompanyRequestOptions])

  useEffect(() => {
    if (open) loadData()
  }, [open, loadData])

  const activeTariff = useMemo(() => {
    if (!userData?.tariffId || !tariffs.length) return null
    return tariffs.find((t) => String(t._id) === String(userData.tariffId))
  }, [userData, tariffs])

  const isTrialActive = useMemo(() => {
    if (!userData?.trialEndsAt) return false
    return new Date(userData.trialEndsAt).getTime() > Date.now()
  }, [userData])

  const providerOptions = useMemo(() => {
    const providers = billingConfig?.providers ?? {}
    return Object.entries(PAYMENT_PROVIDERS).filter(
      ([provider]) => providers[provider]
    )
  }, [billingConfig])

  const selectedProviderConfig = selectedProvider
    ? PAYMENT_PROVIDERS[selectedProvider]
    : null

  const handleTopup = useCallback(async () => {
    const providerConfig = PAYMENT_PROVIDERS[selectedProvider]
    if (!providerConfig) {
      setError("Не выбран доступный способ оплаты")
      return
    }
    const amount = Number(topupAmount)
    if (!Number.isFinite(amount) || amount < 100) {
      setError("Минимальная сумма пополнения — 100 руб.")
      return
    }
    setPaying(true)
    setError("")
    try {
      const res = await apiJson(providerConfig.endpoint, {
        ...buildCompanyRequestOptions({
          method: "POST",
          body: JSON.stringify({ amount, purpose: "balance" }),
        }),
      })
      if (res.data?.confirmationUrl) {
        window.open(res.data.confirmationUrl, "_blank")
        loadData()
      } else {
        setError("Не удалось создать платёж")
      }
    } catch (e) {
      setError(e?.message || "Ошибка при создании платежа")
    } finally {
      setPaying(false)
    }
  }, [buildCompanyRequestOptions, selectedProvider, topupAmount, loadData])

  const handleBuyTariff = useCallback(
    async (tariffId) => {
      setPayingTariff(true)
      setError("")
      try {
        const tariff = tariffs.find((t) => String(t._id) === tariffId)
        const request = getPartyTariffCheckoutRequest({
          tariff,
          provider: selectedProvider,
        })
        if (!request) {
          setError("Не выбран доступный способ оплаты")
          return
        }
        const res = await apiJson(request.endpoint, {
          ...buildCompanyRequestOptions({
            method: "POST",
            body: JSON.stringify(request.body),
          }),
        })
        if (!request.requiresPayment) {
          loadData()
        } else if (res.data?.confirmationUrl) {
          window.open(res.data.confirmationUrl, "_blank")
          loadData()
        } else {
          setError("Не удалось создать платёж")
        }
      } catch (e) {
        setError(e?.message || "Ошибка при покупке тарифа")
      } finally {
        setPayingTariff(false)
      }
    },
    [buildCompanyRequestOptions, selectedProvider, tariffs, loadData]
  )

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-10 bg-black/40">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between p-5 border-b bg-white rounded-t-2xl">
          <h2 className="text-xl font-semibold">Биллинг и тарифы</h2>
          <button
            type="button"
            className="text-gray-400 hover:text-gray-600 cursor-pointer text-2xl leading-none"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <div className="p-5 space-y-6">
          {loading ? (
            <p className="text-gray-500 text-center py-8">Загрузка...</p>
          ) : (
            <>
              {/* Error */}
              {error && (
                <div className="p-3 text-sm text-red-700 bg-red-50 rounded-xl">
                  {error}
                </div>
              )}

              {/* Balance */}
              <div className="p-4 rounded-2xl bg-sky-50">
                <p className="text-sm text-gray-600 mb-1">Баланс</p>
                <p className="text-3xl font-bold">
                  {formatMoney(userData?.balance ?? 0)}
                </p>
                {activeTariff && (
                  <p className="text-sm text-gray-500 mt-1">
                    Тариф: {activeTariff.title}
                    {userData?.tariffActiveUntil &&
                      ` до ${new Date(
                        userData.tariffActiveUntil
                      ).toLocaleDateString("ru-RU")}`}
                  </p>
                )}
                {isTrialActive && (
                  <p className="text-sm text-green-600 mt-1">
                    Пробный период до{" "}
                    {new Date(userData.trialEndsAt).toLocaleDateString("ru-RU")}
                  </p>
                )}
              </div>

              {/* Top-up */}
              <div>
                <h3 className="text-base font-semibold mb-3">
                  Пополнить баланс
                </h3>
                <div className="mb-3">
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Способ оплаты
                  </p>
                  {providerOptions.length > 0 ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {providerOptions.map(([provider, config]) => (
                        <button
                          key={provider}
                          type="button"
                          className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                            selectedProvider === provider
                              ? "border-sky-500 bg-sky-50 text-sky-900"
                              : "border-gray-200 hover:border-sky-300"
                          }`}
                          onClick={() => setSelectedProvider(provider)}
                        >
                          <span className="block font-semibold">
                            {config.label}
                          </span>
                          <span className="mt-1 block text-xs text-gray-500">
                            {config.description}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                      На сервере не настроены провайдеры оплаты.
                    </p>
                  )}
                </div>
                <div className="flex gap-3">
                  <input
                    type="number"
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="Сумма (от 100 руб.)"
                    value={topupAmount}
                    onChange={(e) => setTopupAmount(e.target.value)}
                    min="100"
                  />
                  <button
                    type="button"
                    className="px-6 py-2 text-sm font-semibold text-white rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 cursor-pointer"
                    onClick={handleTopup}
                    disabled={paying || !topupAmount || !selectedProviderConfig}
                  >
                    {paying ? "Создание..." : "Пополнить"}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  {selectedProviderConfig
                    ? `${selectedProviderConfig.label}. Минимум 100 руб.`
                    : "Минимум 100 руб."}
                </p>
              </div>

              {/* Tariffs */}
              <div>
                <h3 className="text-base font-semibold mb-3">
                  Доступные тарифы
                </h3>
                <div className="grid gap-3">
                  {tariffs.map((tariff) => {
                    const isActive =
                      String(tariff._id) === String(userData?.tariffId)
                    const price = Number(tariff.price ?? 0)
                    const isFree = isFreePartyTariff(tariff)
                    return (
                      <div
                        key={tariff._id}
                        className={`p-4 rounded-xl border-2 ${
                          isActive
                            ? "border-sky-500 bg-sky-50"
                            : "border-gray-200"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold">{tariff.title}</p>
                            <p className="text-2xl font-bold mt-1">
                              {price > 0 ? `${price} ₽/мес` : "Бесплатно"}
                            </p>
                          </div>
                          <div className="text-right text-sm text-gray-600 space-y-1">
                            <p>
                              Событий:{" "}
                              {tariff.eventsPerMonth > 0
                                ? tariff.eventsPerMonth
                                : "∞"}
                            </p>
                            <p>
                              {tariff.allowCalendarSync
                                ? "✓ Синхр. календаря"
                                : "✗ Синхр. календаря"}
                            </p>
                            <p>
                              {tariff.allowStatistics
                                ? "✓ Статистика"
                                : "✗ Статистика"}
                            </p>
                            <p>
                              {tariff.allowDocuments
                                ? "✓ Документы"
                                : "✗ Документы"}
                            </p>
                            <p>
                              {tariff.allowTelegramIntegration
                                ? "✓ Telegram Business"
                                : "✗ Telegram Business"}
                            </p>
                          </div>
                        </div>
                        {!isActive && (
                          <button
                            type="button"
                            className="mt-3 w-full py-2 text-sm font-semibold text-white rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 cursor-pointer"
                            onClick={() => handleBuyTariff(tariff._id)}
                            disabled={
                              payingTariff ||
                              (!isFree && !selectedProviderConfig)
                            }
                          >
                            {payingTariff
                              ? "Оплата..."
                              : !isFree
                              ? `Купить за ${price} ₽`
                              : "Выбрать"}
                          </button>
                        )}
                        {isActive && (
                          <p className="mt-2 text-xs text-sky-600 font-medium">
                            Текущий тариф
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Payment history */}
              {payments.length > 0 && (
                <div>
                  <h3 className="text-base font-semibold mb-3">
                    История платежей
                  </h3>
                  <div className="space-y-2">
                    {payments.map((p) => (
                      <div
                        key={p._id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-xl text-sm"
                      >
                        <div>
                          <p className="font-medium">
                            {p.comment || p.purpose}
                          </p>
                          <p className="text-gray-400 text-xs">
                            {new Date(p.createdAt).toLocaleDateString("ru-RU", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })}
                          </p>
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-semibold ${
                              p.type === "charge"
                                ? "text-red-600"
                                : "text-green-600"
                            }`}
                          >
                            {p.type === "charge" ? "-" : "+"}
                            {formatMoney(p.amount)}
                          </p>
                          <p
                            className={`text-xs ${
                              p.status === "succeeded"
                                ? "text-green-600"
                                : "text-yellow-600"
                            }`}
                          >
                            {p.status === "succeeded"
                              ? "Завершён"
                              : p.status === "pending"
                              ? "В обработке"
                              : p.status}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default PartyBillingModal
