"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { apiJson } from "@helpers/apiClient"
import { formatMoney } from "@helpers/formatMoney"

const PartyBillingModal = ({ open, onClose }) => {
  const [tariffs, setTariffs] = useState([])
  const [userData, setUserData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [topupAmount, setTopupAmount] = useState("")
  const [selectedTariffId, setSelectedTariffId] = useState("")
  const [paying, setPaying] = useState(false)
  const [payingTariff, setPayingTariff] = useState(false)
  const [error, setError] = useState("")
  const [payments, setPayments] = useState([])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [tariffsRes, userRes, paymentsRes] = await Promise.all([
        apiJson("/api/party/tariffs", { cache: "no-store" }),
        apiJson("/api/party/billing/me", { cache: "no-store" }),
        apiJson("/api/party/billing/payments?limit=20", { cache: "no-store" }),
      ])
      setTariffs(tariffsRes.data ?? [])
      setUserData(userRes.data ?? null)
      setPayments(paymentsRes.data ?? [])
    } catch (e) {
      setError("Не удалось загрузить данные")
    } finally {
      setLoading(false)
    }
  }, [])

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

  const handleTopup = useCallback(async () => {
    const amount = Number(topupAmount)
    if (!Number.isFinite(amount) || amount < 100) {
      setError("Минимальная сумма пополнения — 100 руб.")
      return
    }
    setPaying(true)
    setError("")
    try {
      const res = await apiJson("/api/party/billing/yookassa/create", {
        method: "POST",
        body: JSON.stringify({ amount, purpose: "balance" }),
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
  }, [topupAmount, loadData])

  const handleBuyTariff = useCallback(
    async (tariffId) => {
      setPayingTariff(true)
      setError("")
      try {
        const tariff = tariffs.find((t) => String(t._id) === tariffId)
        const res = await apiJson("/api/party/billing/yookassa/create", {
          method: "POST",
          body: JSON.stringify({
            tariffId,
            purpose: "tariff",
            amount: tariff?.price || 0,
          }),
        })
        if (res.data?.confirmationUrl) {
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
    [tariffs, loadData]
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
                    disabled={paying || !topupAmount}
                  >
                    {paying ? "Создание..." : "Пополнить"}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Через ЮKassa (карта, СБП). Минимум 100 руб.
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
                          </div>
                        </div>
                        {!isActive && (
                          <button
                            type="button"
                            className="mt-3 w-full py-2 text-sm font-semibold text-white rounded-xl bg-sky-600 hover:bg-sky-700 disabled:opacity-50 cursor-pointer"
                            onClick={() => handleBuyTariff(tariff._id)}
                            disabled={payingTariff}
                          >
                            {payingTariff
                              ? "Оплата..."
                              : price > 0
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
