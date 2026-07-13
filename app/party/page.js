import Image from 'next/image'
import Link from 'next/link'

import PartyPricingSection from './PartyPricingSection'
import {
  HeroProductPreview,
  Icon,
  OrderDetailPreview,
} from './PartyLandingPreview'

const rawPartyDomain = process.env.DOMAIN || 'partycrm.ru'
const partyUrl = rawPartyDomain.startsWith('http')
  ? rawPartyDomain
  : `https://${rawPartyDomain}`
const normalizedPartyUrl = partyUrl.replace(/\/$/, '')
const partyHomeUrl = `${normalizedPartyUrl}/`
const partyOgImageUrl = `${normalizedPartyUrl}/opengraph-image`
const ASSET_VERSION = '2026-05-27-logo-png'

export const metadata = {
  title: 'PartyCRM — CRM для праздничных агентств, event-команд и игровых комнат',
  description:
    'PartyCRM — CRM для управления заказами, площадками, исполнителями и финансами в событийном бизнесе. Заявки, бронирования, отчётность в одном окне.',
  keywords: [
    'crm для праздничных агентств',
    'crm для ивент-агентств',
    'crm для event-команд',
    'crm для игровых комнат',
    'управление заказами мероприятий',
    'учёт бронирований площадок',
    'программа для аниматорских бюро',
    'учёт заявок ивент',
  ],
  applicationName: 'PartyCRM',
  manifest: `/manifest.json?v=${ASSET_VERSION}`,
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PartyCRM',
  },
  alternates: {
    canonical: `${normalizedPartyUrl}/`,
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: partyHomeUrl,
    siteName: 'PartyCRM',
    title: 'PartyCRM — CRM для праздничных агентств и event-команд',
    description:
      'Заявки, площадки, исполнители, финансы и отчётность — всё в одном кабинете для событийного бизнеса.',
    images: [
      {
        url: partyOgImageUrl,
        width: 1200,
        height: 630,
        alt: 'PartyCRM — CRM для праздничных агентств',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PartyCRM — CRM для event-бизнеса',
    description:
      'Управляйте заказами, бронированиями площадок и выплатами исполнителям из одного кабинета.',
    images: [partyOgImageUrl],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
  icons: {
    icon: [
      {
        url: `/favicon.png?v=${ASSET_VERSION}`,
        sizes: '32x32',
        type: 'image/png',
      },
      {
        url: `/icons/AppImages/android/android-launchericon-192-192.png?v=${ASSET_VERSION}`,
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: `/icons/AppImages/android/android-launchericon-512-512.png?v=${ASSET_VERSION}`,
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: `/icons/AppImages/ios/180.png?v=${ASSET_VERSION}`,
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
}

const tariffPlans = [
  {
    id: 'base',
    title: 'Базовый',
    price: 1490,
    subtitle: 'Для небольшой команды',
    features: [
      'До 3 сотрудников',
      'До 50 заказов в месяц',
      'Клиенты и площадки',
      'Договоры и акты',
    ],
  },
  {
    id: 'pro',
    title: 'Профи',
    price: 2990,
    subtitle: 'Для растущего агентства',
    features: [
      'До 10 сотрудников',
      'Безлимит заказов',
      'Финансы и отчёты',
      'Google Календарь',
    ],
  },
  {
    id: 'business',
    title: 'Бизнес',
    price: 5990,
    subtitle: 'Для сложных процессов',
    features: [
      'Безлимит сотрудников',
      'Кастомные интеграции',
      'Персональный онбординг',
      'Приоритетная поддержка',
    ],
  },
]

const faqItems = [
  {
    question: 'Для кого подходит PartyCRM?',
    answer:
      'Для праздничных агентств, игровых комнат, event-команд, фотостудий и площадок, которые управляют заказами, сотрудниками и оплатами.',
  },
  {
    question: 'Сколько сотрудников можно добавить?',
    answer:
      'В Базовом тарифе — до 3 сотрудников, в Профи — до 10, в Бизнесе — без ограничений.',
  },
  {
    question: 'Можно ли вести финансы по заказам?',
    answer:
      'Да. PartyCRM учитывает поступления, расходы, задатки, выплаты исполнителям и показывает прибыль по каждому заказу.',
  },
  {
    question: 'Есть ли синхронизация с календарём?',
    answer:
      'Да. В тарифе Профи и выше заказы и важные задачи можно синхронизировать с Google Календарём.',
  },
]

const proofItems = [
  {
    icon: 'calendar',
    title: 'Заказы',
    text: 'Сроки, статусы и оплаты в едином потоке.',
  },
  {
    icon: 'pin',
    title: 'Площадки',
    text: 'Расписание и защита от пересечений.',
  },
  {
    icon: 'users',
    title: 'Команда',
    text: 'Назначения, роли и ответственность.',
  },
  {
    icon: 'wallet',
    title: 'Финансы',
    text: 'Доходы, расходы и прибыль по заказам.',
  },
]

const workflowSteps = [
  'Заявка',
  'Площадка и время',
  'Исполнители',
  'Оплаты',
  'Договор и акт',
]

const comparisonItems = [
  {
    old: 'Заказы в разных чатах',
    current: 'Единая карточка заказа',
  },
  {
    old: 'Пересечения замечают слишком поздно',
    current: 'Проверка площадки и команды',
  },
  {
    old: 'Расходы собирают вручную',
    current: 'Прибыль видна сразу',
  },
]

export default function PartyCrmLandingPage() {
  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'PartyCRM',
    url: partyHomeUrl,
    logo: `${normalizedPartyUrl}/img/logo-96.webp`,
  }

  const softwareApplicationSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'PartyCRM',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: 'ru-RU',
    url: partyHomeUrl,
    description:
      'CRM-система для праздничных агентств и event-команд: управление заказами, площадками, исполнителями и финансами.',
    offers: tariffPlans.map((tariff) => ({
      '@type': 'Offer',
      name: tariff.title,
      price: tariff.price,
      priceCurrency: 'RUB',
    })),
  }

  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  }

  return (
    <main className="party-landing-v2">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            organizationSchema,
            softwareApplicationSchema,
            faqSchema,
          ]),
        }}
      />

      <header className="party-landing-header">
        <div className="party-landing-container flex h-[76px] items-center justify-between gap-4">
          <Link href="/" className="flex cursor-pointer items-center" aria-label="PartyCRM — главная">
            <Image
              src="/img/logo_horizontal.png"
              alt="PartyCRM"
              width={623}
              height={134}
              priority
              className="h-7 w-auto sm:h-8"
            />
          </Link>
          <div className="flex items-center gap-3 sm:gap-5">
            <Link
              href="/party/login?callbackUrl=/party/entry"
              className="cursor-pointer text-sm font-semibold text-[#102338] transition-colors hover:text-[#0b8fd0]"
            >
              Войти
            </Link>
            <Link
              href="/party/login?callbackUrl=/party/entry"
              className="party-button party-button--primary party-header-cta cursor-pointer"
            >
              Попробовать бесплатно
            </Link>
          </div>
        </div>
      </header>

      <section className="party-landing-container pb-14 pt-12 sm:pt-16 lg:pb-16 lg:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-[0.78fr_1.35fr] lg:gap-10 xl:gap-16">
          <div className="landing-reveal">
            <h1 className="max-w-xl text-[2.55rem] font-bold leading-[1.06] tracking-[-0.05em] text-[#102338] sm:text-5xl lg:text-[3.25rem]">
              Все заказы и команда — в одном понятном кабинете
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-[#596a82] sm:text-lg">
              PartyCRM помогает праздничным агентствам, игровым комнатам и
              event-командам управлять заказами, площадками, исполнителями и
              финансами — без хаоса в чатах и таблицах.
            </p>
            <p className="mt-6 text-sm font-semibold text-[#0b8fd0] sm:text-base">
              14 дней бесплатно · Настройка без специалиста
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/party/login?callbackUrl=/party/entry"
                className="party-button party-button--primary cursor-pointer"
              >
                Попробовать бесплатно
              </Link>
              <Link
                href="#pricing"
                className="party-button party-button--secondary cursor-pointer"
              >
                Посмотреть тарифы
              </Link>
            </div>
          </div>
          <div className="landing-reveal min-w-0" style={{ '--delay': '100ms' }}>
            <HeroProductPreview />
          </div>
        </div>

        <div className="party-proof-strip mt-14 lg:mt-16">
          {proofItems.map((item, index) => (
            <article
              key={item.title}
              className="landing-stagger flex items-start gap-4"
              style={{ '--delay': `${index * 80 + 150}ms` }}
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#0b94d4] shadow-[0_6px_18px_rgba(17,77,110,0.08)]">
                <Icon name={item.icon} className="h-5 w-5" />
              </span>
              <span>
                <strong className="block text-sm font-semibold text-[#102338]">
                  {item.title}
                </strong>
                <span className="mt-1 block text-xs leading-5 text-[#64748a]">
                  {item.text}
                </span>
              </span>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-[#e4ebf0] bg-white py-20 sm:py-24">
        <div className="party-landing-container">
          <div className="max-w-3xl">
            <p className="party-section-label">Как это работает</p>
            <h2 className="party-section-title mt-3">
              От заявки до закрытого заказа — без лишних действий
            </h2>
            <p className="party-section-copy mt-4">
              Клиент, площадка, команда, оплаты и документы связаны в одной карточке.
            </p>
          </div>

          <ol className="party-workflow mt-12">
            {workflowSteps.map((step, index) => (
              <li key={step} className="relative flex items-center gap-3 lg:block">
                <span className="party-workflow-number">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="text-sm font-semibold text-[#102338] lg:mt-3 lg:block">
                  {step}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-12 grid items-center gap-10 lg:grid-cols-[1.65fr_0.55fr] lg:gap-16">
            <OrderDetailPreview />
            <div className="max-w-md lg:max-w-none">
              <h3 className="text-3xl font-bold leading-tight tracking-[-0.04em] text-[#102338]">
                Каждый видит своё. Руководитель — всю картину.
              </h3>
              <p className="mt-5 text-base leading-7 text-[#607089]">
                Владелец и администратор управляют заказом, исполнитель получает
                только нужные детали и задачи.
              </p>
              <div className="mt-7 space-y-3">
                {[
                  'Разграничение доступа по ролям',
                  'Назначения и выплаты исполнителям',
                  'Отчётность по каждому заказу',
                ].map((item) => (
                  <p key={item} className="flex items-center gap-3 text-sm font-medium text-[#33465e]">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e9f6fc] text-[#0b94d4]">
                      <Icon name="check" className="h-3.5 w-3.5" />
                    </span>
                    {item}
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-8 bg-[#f7fafc] py-20 sm:py-24">
        <div className="party-landing-container">
          <PartyPricingSection fallbackPlans={tariffPlans} />
        </div>
      </section>

      <section className="bg-white py-20 sm:py-24">
        <div className="party-landing-container">
          <div className="grid gap-12 border-b border-[#e2e9ef] pb-20 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
            <div>
              <p className="party-section-label">Вместо таблиц и чатов</p>
              <h2 className="party-section-title mt-3">
                Важное не теряется между сообщениями
              </h2>
            </div>
            <div className="grid gap-8 sm:grid-cols-2 sm:gap-0">
              <div className="sm:border-r sm:border-[#e1e8ee] sm:pr-8">
                <h3 className="text-lg font-bold text-[#102338]">Обычно</h3>
                <div className="mt-5 divide-y divide-[#e2e9ef]">
                  {comparisonItems.map((item) => (
                    <p key={item.old} className="flex min-h-16 items-center gap-3 py-4 text-sm text-[#596a82]">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eef2f5] text-[#64748a]">×</span>
                      {item.old}
                    </p>
                  ))}
                </div>
              </div>
              <div className="sm:pl-8">
                <h3 className="text-lg font-bold text-[#102338]">
                  С Party<span className="text-[#0b94d4]">CRM</span>
                </h3>
                <div className="mt-5 divide-y divide-[#e2e9ef]">
                  {comparisonItems.map((item) => (
                    <p key={item.current} className="flex min-h-16 items-center gap-3 py-4 text-sm font-medium text-[#33465e]">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0b94d4] text-white">
                        <Icon name="check" className="h-3.5 w-3.5" />
                      </span>
                      {item.current}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div id="faq" className="scroll-mt-8 grid gap-12 py-20 lg:grid-cols-[0.7fr_1.3fr] lg:gap-16">
            <div>
              <p className="party-section-label">Частые вопросы</p>
              <h2 className="party-section-title mt-3">Перед началом работы</h2>
            </div>
            <div className="divide-y divide-[#dfe7ed] border-y border-[#dfe7ed]">
              {faqItems.map((item, index) => (
                <details key={item.question} className="party-faq-row" open={index === 0}>
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-5 text-base font-semibold text-[#102338]">
                    {item.question}
                    <span className="party-faq-icon text-2xl font-light text-[#0b8fd0]" aria-hidden="true">+</span>
                  </summary>
                  <p className="max-w-2xl pb-5 pr-10 text-sm leading-6 text-[#607089]">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>

          <div className="party-final-cta">
            <div className="relative z-10 max-w-xl py-2">
              <h2 className="text-3xl font-bold tracking-[-0.04em] text-[#102338] sm:text-4xl">
                Попробуйте на реальных заказах
              </h2>
              <p className="mt-4 text-base text-[#596a82]">
                14 дней бесплатно — без обязательств и сложной настройки.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/party/login?callbackUrl=/party/entry"
                  className="party-button party-button--primary cursor-pointer"
                >
                  Попробовать бесплатно
                </Link>
                <Link
                  href="#pricing"
                  className="party-button party-button--secondary cursor-pointer"
                >
                  Посмотреть тарифы
                </Link>
              </div>
            </div>
            <div className="pointer-events-none absolute -bottom-20 -right-28 hidden w-[58%] rotate-[-1deg] opacity-95 lg:block">
              <HeroProductPreview compact />
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#e1e8ee] bg-white">
        <div className="party-landing-container flex flex-col gap-6 py-8 text-sm text-[#64748a] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-5">
            <Image
              src="/img/logo_horizontal.png"
              alt="PartyCRM"
              width={623}
              height={134}
              className="h-6 w-auto"
            />
            <span>© {new Date().getFullYear()} PartyCRM</span>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-3" aria-label="Правовая информация">
            <Link href="/privacy" className="cursor-pointer hover:text-[#0b8fd0]" target="_blank" rel="noreferrer">
              Политика конфиденциальности
            </Link>
            <Link href="/terms" className="cursor-pointer hover:text-[#0b8fd0]" target="_blank" rel="noreferrer">
              Пользовательское соглашение
            </Link>
            <Link href="/payment" className="cursor-pointer hover:text-[#0b8fd0]" target="_blank" rel="noreferrer">
              Оплата и возвраты
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  )
}
