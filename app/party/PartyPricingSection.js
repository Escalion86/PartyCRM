'use client'

import { apiJson } from '@helpers/apiClient'
import Link from 'next/link'
import { useEffect, useState } from 'react'

const formatPrice = (price) => {
  if (!price || Number(price) === 0) return 'Бесплатно'
  return `${Number(price).toLocaleString('ru-RU')} ₽/мес`
}

export default function PartyPricingSection() {
  const [tariffs, setTariffs] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchTariffs = async () => {
      try {
        const res = await apiJson('/api/party/tariffs')
        if (res?.success && Array.isArray(res.data)) {
          setTariffs(res.data.filter((t) => !t.hidden))
        }
      } catch (err) {
        console.error('Ошибка загрузки тарифов', err)
      }
      setLoading(false)
    }
    fetchTariffs()
  }, [])

  return (
    <>
      <div className="flex flex-col items-start gap-6 landing-reveal sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sky-600 text-sm font-semibold tracking-[0.3em] uppercase">
            Тарифы
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-black font-futuraPT">
            Выберите формат работы
          </h2>
          <p className="mt-3 text-sm text-gray-600">
            Подберите вариант под масштаб вашего агентства. При оплате за
            год - скидка 25%.
          </p>
        </div>
        <Link
          href="/party/login?callbackUrl=/party/entry"
          className="cursor-pointer ui-btn party-cta-primary"
        >
          Попробовать бесплатно
        </Link>
      </div>

      <div className="grid gap-6 mt-8 lg:grid-cols-3">
        {loading ? (
          <>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-3xl border border-gray-200/70 bg-white p-8 shadow-lg animate-pulse"
              >
                <div className="h-6 bg-gray-200 rounded w-1/2" />
                <div className="h-4 mt-2 bg-gray-100 rounded w-3/4" />
                <div className="h-8 mt-4 bg-gray-200 rounded w-1/3" />
                <div className="mt-6 space-y-3">
                  {[1, 2, 3].map((j) => (
                    <div key={j} className="flex items-center gap-3">
                      <div className="w-2 h-2 rounded-full bg-gray-200" />
                      <div className="h-4 bg-gray-100 rounded w-2/3" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        ) : tariffs && tariffs.length > 0 ? (
          tariffs.map((tariff, index) => {
            const isPopular =
              index === Math.floor(tariffs.length / 2) && tariffs.length === 3
            return (
              <div
                key={tariff._id}
                className={`landing-reveal rounded-3xl border p-8 shadow-lg ${
                  isPopular
                    ? 'home-panel border-sky-300/50 from-sky-50 bg-gradient-to-br via-white to-white'
                    : 'home-panel border-gray-200/70 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-2xl font-semibold text-black font-futuraPT">
                    {tariff.title}
                  </h3>
                  {isPopular && (
                    <span className="px-3 py-1 text-xs font-semibold text-white rounded-full bg-sky-600">
                      Популярный
                    </span>
                  )}
                </div>
                {tariff.subtitle && (
                  <p className="mt-1 text-sm text-gray-500">{tariff.subtitle}</p>
                )}
                {tariff.description && (
                  <p className="mt-1 text-xs text-gray-400">{tariff.description}</p>
                )}
                <div className="mt-4">
                  <span className="text-3xl font-bold text-black">
                    {formatPrice(tariff.price)}
                  </span>
                  {tariff.price > 0 && (
                    <span className="ml-2 text-sm text-gray-500">
                      {Math.round(
                        Number(tariff.price) * 12 * 0.75
                      ).toLocaleString('ru-RU')}{' '}
                      ₽/год
                    </span>
                  )}
                </div>
                {tariff.features && tariff.features.length > 0 && (
                  <ul className="mt-6 space-y-3 text-sm text-gray-700">
                    {tariff.features.map((name) => (
                      <li key={name} className="flex items-start gap-3">
                        <span className="w-2 h-2 mt-1 rounded-full bg-sky-500" />
                        <span className="font-medium text-gray-900">
                          {name}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })
        ) : (
          <div className="col-span-full p-8 text-center text-gray-400 bg-white border border-gray-200/70 rounded-3xl">
            Тарифы скоро появятся
          </div>
        )}
      </div>
    </>
  )
}
