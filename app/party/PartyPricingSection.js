'use client'

import { apiJson } from '@helpers/apiClient'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { Icon } from './PartyLandingPreview'

const formatPrice = (price) => {
  if (!price || Number(price) === 0) return 'Бесплатно'
  return Number(price).toLocaleString('ru-RU')
}

const normalizePlan = (plan) => ({
  ...plan,
  id: plan.id || plan._id,
  subtitle: plan.subtitle || plan.description || '',
  features: Array.isArray(plan.features) ? plan.features : [],
})

export default function PartyPricingSection({ fallbackPlans = [] }) {
  const [tariffs, setTariffs] = useState(null)

  useEffect(() => {
    let active = true

    const fetchTariffs = async () => {
      try {
        const response = await apiJson('/api/party/tariffs')
        if (active && response?.success && Array.isArray(response.data)) {
          setTariffs(response.data.filter((tariff) => !tariff.hidden))
        }
      } catch (error) {
        console.error('Ошибка загрузки тарифов', error)
      }
    }

    fetchTariffs()

    return () => {
      active = false
    }
  }, [])

  const plans = useMemo(() => {
    const source = tariffs?.length ? tariffs : fallbackPlans
    return source.map(normalizePlan)
  }, [fallbackPlans, tariffs])

  return (
    <>
      <div className="mx-auto max-w-3xl text-center">
        <p className="party-section-label">Тарифы</p>
        <h2 className="party-section-title mt-3">Начните с нужного масштаба</h2>
        <p className="party-section-copy mt-4">
          14 дней бесплатно. При оплате за год — скидка 25%.
        </p>
      </div>

      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        {plans.map((plan, index) => {
          const isPopular =
            plans.length === 3
              ? index === 1
              : String(plan.title).toLowerCase().includes('проф')

          return (
            <article
              key={plan.id || plan.title}
              className={`party-pricing-card ${
                isPopular ? 'party-pricing-card--popular' : ''
              }`}
            >
              <div className="flex min-h-7 items-center justify-between gap-3">
                <h3 className="text-2xl font-bold tracking-[-0.03em] text-[#102338]">
                  {plan.title}
                </h3>
                {isPopular && (
                  <span className="rounded-md bg-[#e5f4fc] px-2.5 py-1 text-[11px] font-semibold text-[#087fbd]">
                    Чаще выбирают
                  </span>
                )}
              </div>

              <div className="mt-5 flex items-end gap-2 text-[#102338]">
                <span className="text-4xl font-bold tracking-[-0.04em] sm:text-5xl">
                  {formatPrice(plan.price)}
                </span>
                {Number(plan.price) > 0 && (
                  <span className="pb-1 text-base font-semibold text-[#64748a]">
                    ₽/мес
                  </span>
                )}
              </div>
              <p className="mt-3 min-h-6 text-sm text-[#607089]">
                {plan.subtitle || 'Для вашей команды'}
              </p>

              <div className="my-6 h-px bg-[#dfe7ed]" />

              <ul className="min-h-44 space-y-4 text-sm text-[#33465e]">
                {plan.features.slice(0, 6).map((feature) => (
                  <li key={feature} className="flex items-start gap-3">
                    <Icon
                      name="check"
                      className="mt-0.5 h-4 w-4 shrink-0 text-[#0b94d4]"
                    />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/party/login?callbackUrl=/party/entry"
                className="party-button party-button--primary mt-7 w-full cursor-pointer"
              >
                Попробовать бесплатно
              </Link>
            </article>
          )
        })}
      </div>

      <p className="mt-8 flex items-center justify-center gap-2 text-center text-sm text-[#52627a]">
        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-[#b9ddf0] text-[#0b94d4]">
          <Icon name="check" className="h-4 w-4" />
        </span>
        Можно начать без карты. Данные останутся доступны после тестового периода.
      </p>
    </>
  )
}
