import Link from 'next/link'
import PartyPricingSection from './PartyPricingSection'
import Image from 'next/image'

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
    description: 'Для небольших агентств и начинающих команд',
    features: [
      'До 3 сотрудников',
      'До 50 заказов в месяц',
      'Учёт клиентов',
      'Базовые документы (договор/акт)',
      'Бронирование площадок',
    ],
    highlighted: false,
  },
  {
    id: 'pro',
    title: 'Профи',
    price: 2990,
    description: 'Для растущих агентств с полноценным учётом',
    features: [
      'До 10 сотрудников',
      'Безлимит заказов',
      'Всё из Базового',
      'Финансы (доходы/расходы по заказам)',
      'Google Календарь',
      'Телефония (Novofon)',
      'Отчётность по прибыли',
    ],
    highlighted: true,
  },
  {
    id: 'business',
    title: 'Бизнес',
    price: 5990,
    description: 'Для крупных агентств с индивидуальными задачами',
    features: [
      'Безлимит сотрудников',
      'Всё из Профи',
      'Кастомные интеграции',
      'Отдельный менеджер поддержки',
      'Приоритетная разработка',
      'Индивидуальный онбординг',
    ],
    highlighted: false,
  },
]

const formatPrice = (price) => {
  if (!price || Number(price) === 0) return 'Бесплатно'
  return `${Number(price).toLocaleString('ru-RU')} ₽/мес`
}

const faqItems = [
  {
    question: 'Для кого подходит PartyCRM?',
    answer:
      'PartyCRM создан для праздничных агентств, детских игровых комнат, фотостудий, площадок и любых event-команд, где нужно управлять заказами, бронированиями, ролями сотрудников и оплатами.',
  },
  {
    question: 'Чем PartyCRM отличается от ArtistCRM?',
    answer:
      'ArtistCRM — для соло-артистов (фокусников, ведущих, музыкантов). PartyCRM — для агентств и команд: несколько сотрудников, бронирование площадок, назначение исполнителей на заказы, финансовая отчётность.',
  },
  {
    question: 'Сколько сотрудников можно добавить?',
    answer:
      'В зависимости от тарифа: до 3 сотрудников в Базовом, до 10 в Профи и безлимит в Бизнесе. Каждый сотрудник получает свой доступ с разграничением прав.',
  },
  {
    question: 'Можно ли вести финансы по заказам?',
    answer:
      'Да, PartyCRM учитывает доходы, расходы, задатки, выплаты исполнителям и налоги. По каждому заказу видна чистая прибыль.',
  },
  {
    question: 'Есть ли синхронизация с календарём?',
    answer:
      'Да, в тарифе Профи и выше доступна синхронизация с Google Календарём — мероприятия автоматически отображаются в календаре.',
  },
  {
    question: 'Можно ли формировать документы?',
    answer:
      'Да, PartyCRM формирует договоры и акты с подстановкой данных из карточки заказа. Шаблоны настраиваются под ваше агентство.',
  },
]

const comparisonItems = [
  {
    title: 'Заказы и бронирования',
    oldWay: 'Заказы теряются в мессенджерах, пересечения площадок не видны.',
    crmWay:
      'Единый список заказов, автоматический контроль пересечений по площадкам и времени.',
  },
  {
    title: 'Команда и исполнители',
    oldWay: 'Назначения в переписке, сложно понять кто на какой заказ назначен.',
    crmWay:
      'Карточка заказа показывает всех назначенных сотрудников, статусы и выплаты.',
  },
  {
    title: 'Финансы и отчётность',
    oldWay: 'Доходы и расходы размазаны по табличкам и чекам.',
    crmWay:
      'По каждому заказу видна прибыль: поступления от клиента минус расходы на артистов, реквизит, налоги.',
  },
  {
    title: 'Площадки и расписание',
    oldWay: 'Двойные брони и путаница какой зал на какое время занят.',
    crmWay:
      'Все площадки в одном списке, календарь бронирований, контроль пересечений.',
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
    offers: tariffPlans.map((t) => ({
      '@type': 'Offer',
      name: t.title,
      price: t.price,
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
    <main className="relative overflow-hidden home-page">
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

      {/* Header */}
      <div className="relative z-20 flex items-center justify-between w-full max-w-6xl px-6 pt-6 mx-auto">
        <Link href="/party" className="flex items-center cursor-pointer">
          <Image
            src="/img/logo_horizontal.png"
            alt="PartyCRM"
            width={623}
            height={134}
            priority
            className="h-8 w-auto sm:h-9"
          />
        </Link>
        <Link
          href="/party/login?callbackUrl=/party/entry"
          className="cursor-pointer ui-btn party-cta-primary"
        >
          Войти в систему
        </Link>
      </div>

      {/* Hero gradient background */}
      <div className="absolute inset-0 pointer-events-none home-hero-bg">
        <div className="absolute right-0 rounded-full from-sky-400/40 -top-24 h-72 w-72 bg-gradient-to-br via-white/10 to-transparent blur-3xl" />
        <div className="via-sky-200/20 absolute bottom-0 left-0 h-80 w-80 rounded-full bg-gradient-to-tr from-sky-500/30 to-transparent blur-3xl" />
        <div className="absolute inset-x-0 top-40 mx-auto h-64 w-[80%] bg-[radial-gradient(circle_at_center,rgba(56,189,248,0.22),transparent_60%)]" />
      </div>

      {/* Hero section */}
      <section className="relative flex flex-col max-w-6xl gap-10 px-6 pt-20 pb-16 mx-auto lg:flex-row lg:items-center">
        <div className="flex-1">
          <p className="text-sm font-semibold tracking-[0.3em] uppercase landing-reveal text-sky-600">
            CRM для event-команд
          </p>
          <h1 className="mt-5 text-4xl font-semibold text-black landing-reveal font-futuraPT sm:text-5xl lg:text-6xl">
            Заказы, площадки, финансы и команда — всё в одном кабинете
          </h1>
          <p className="max-w-xl mt-6 text-base text-gray-700 landing-reveal sm:text-lg">
            PartyCRM помогает праздничным агентствам, игровым комнатам и event-командам
            управлять заказами, бронировать площадки, назначать исполнителей и
            контролировать финансы — без хаоса и табличек.
          </p>
          <p className="max-w-xl mt-3 text-sm text-gray-600 landing-reveal sm:text-base">
            CRM — это единая система для заказов, клиентов, площадок, сотрудников, оплат
            и документов. Всё, что нужно для управления событийным бизнесом.
          </p>
          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-gray-600 landing-reveal">
            <span className="flex items-center gap-2 px-4 py-2 rounded-full shadow-sm home-chip bg-white/80">
              Все данные в облаке — доступ с любого устройства
            </span>
            <span className="flex items-center gap-2 px-4 py-2 rounded-full shadow-sm home-chip bg-white/80">
              Разграничение прав для сотрудников
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-8 landing-reveal">
            <Link
              href="/party/login?callbackUrl=/party/entry"
              className="cursor-pointer ui-btn party-cta-primary"
            >
              Попробовать бесплатно
            </Link>
            <Link
              href="#pricing"
              className="cursor-pointer ui-btn party-cta-secondary"
            >
              Посмотреть тарифы
            </Link>
          </div>
        </div>

        {/* Desktop panel */}
        <div className="relative flex-1 hidden lg:block">
          <div className="w-full p-6 border shadow-lg home-panel landing-reveal rounded-3xl border-white/70 bg-white/80 backdrop-blur lg:mt-6">
            <p className="text-sky-600 text-xs font-semibold tracking-[0.2em] uppercase">
              Ключевые возможности
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-black font-futuraPT">
              Полный контроль над event-бизнесом
            </h2>
            <p className="mt-3 text-sm text-gray-600">
              Заказы, площадки, команда, финансы и документы — всё собрано в PartyCRM.
            </p>
            <div className="grid gap-3 mt-4">
              {[
                'Единый поток заказов с контролем пересечений',
                'Бронирование площадок и расписание',
                'Назначение исполнителей и контроль выплат',
                'Финансовый учёт: доходы, расходы, налоги',
                'Синхронизация с Google Календарём',
                'Автоформирование договоров и актов',
                'Отчётность по прибыли по каждому заказу и в целом',
              ].map((item) => (
                <div
                  key={item}
                  className="px-4 py-3 text-sm text-gray-700 bg-white border shadow-sm home-mini-card rounded-2xl border-gray-200/60"
                >
                  <div className="flex items-start gap-3">
                    <span className="w-3 h-3 mt-1 rounded-full bg-sky-500" />
                    <span className="font-medium text-gray-900">{item}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Mobile features panel */}
      <section className="relative max-w-6xl px-6 pb-16 mx-auto lg:hidden">
        <div className="p-8 shadow-lg home-panel landing-reveal rounded-3xl bg-white/70 backdrop-blur sm:p-10">
          <div className="grid gap-8 lg:grid-cols-3">
            <div>
              <p className="text-sky-600 text-sm font-semibold tracking-[0.3em] uppercase">
                Ключевые возможности
              </p>
              <h2 className="mt-4 text-3xl font-semibold text-black font-futuraPT">
                Полный контроль над event-бизнесом
              </h2>
              <p className="mt-4 text-sm text-gray-600">
                Заказы, клиенты, площадки и сотрудники в единой системе.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
              {[
                'Единый поток заказов с контролем пересечений',
                'Бронирование площадок и расписание',
                'Назначение исполнителей и контроль выплат',
                'Финансовый учёт: доходы, расходы, налоги',
                'Синхронизация с Google Календарём',
                'Автоформирование договоров и актов',
                'Отчётность по прибыли по каждому заказу',
              ].map((item, index) => (
                <div
                  key={item}
                  className="px-4 py-4 text-sm text-gray-700 bg-white border shadow-sm home-mini-card landing-stagger rounded-2xl border-gray-200/60"
                  style={{ '--delay': `${index * 120 + 120}ms` }}
                >
                  <div className="flex items-start gap-3">
                    <span className="w-3 h-3 mt-1 rounded-full bg-sky-500" />
                    <span className="font-medium text-gray-900">{item}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* How it works & Client work */}
      <section className="relative max-w-6xl px-6 pb-16 mx-auto">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="p-8 border shadow-lg home-panel home-panel--light landing-reveal border-sky-200/30 to-sky-50/10 rounded-3xl bg-gradient-to-br from-white via-white">
            <p className="text-sky-600 text-sm font-semibold tracking-[0.3em] uppercase">
              Как это работает
            </p>
            <h3 className="mt-4 text-2xl font-semibold text-black font-futuraPT">
              Простая логика без перегруженного интерфейса
            </h3>
            <ol className="mt-6 space-y-4 text-sm text-gray-700">
              {[
                'Клиент оставляет заявку — вы видите её в едином списке.',
                'Назначаете площадку, дату и исполнителей.',
                'Система автоматически рассчитывает бюджет и контрольные точки.',
                'По каждому заказу — отчёт по прибыли: доход минус расходы на артистов, реквизит, налоги.',
                'Договоры и акты формируются автоматически.',
              ].map((item) => (
                <li key={item}>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 text-xs font-semibold rounded-full bg-sky-100 text-sky-600 min-w-6">
                      ✓
                    </span>
                    <span className="font-medium text-gray-900">{item}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="p-8 border shadow-lg home-panel landing-reveal rounded-3xl border-white/70 bg-white/70 backdrop-blur">
            <p className="text-sky-600 text-sm font-semibold tracking-[0.3em] uppercase">
              Работа с командой
            </p>
            <h3 className="mt-4 text-2xl font-semibold text-black font-futuraPT">
              Исполнители, площадки и заказы — рядом
            </h3>
            <p className="mt-4 text-sm text-gray-600">
              Вы видите, кто на какой заказ назначен, какие площадки заняты,
              какие выплаты исполнителям уже произведены.
            </p>
            <div className="px-4 py-4 mt-6 text-sm text-gray-700 bg-white border home-mini-card rounded-2xl border-gray-200/60">
              <p className="text-xs font-semibold tracking-[0.2em] text-gray-500 uppercase">
                Разграничение ролей
              </p>
              <p className="mt-2 text-base font-semibold text-black">
                Владелец, администратор, исполнитель
              </p>
              <p className="mt-2 text-sm text-gray-600">
                Каждый видит только свои заказы. Руководитель — полную картину по всем заказам агентства.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing section */}
      <section id="pricing" className="relative max-w-6xl px-6 pb-20 mx-auto">
        <PartyPricingSection />
      </section>

      {/* FAQ section */}
      <section className="relative max-w-6xl px-6 pb-16 mx-auto">
        <div className="p-8 border shadow-lg home-panel rounded-3xl border-white/70 bg-white/80 backdrop-blur">
          <p className="text-sky-600 text-sm font-semibold tracking-[0.3em] uppercase">
            FAQ
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-black font-futuraPT">
            Частые вопросы о PartyCRM
          </h2>
          <div className="mt-6 space-y-4">
            {faqItems.map((item) => (
              <article
                key={item.question}
                className="p-5 bg-white border rounded-2xl border-gray-200/70"
              >
                <h3 className="text-lg font-semibold text-black">
                  {item.question}
                </h3>
                <p className="mt-2 text-sm text-gray-700">{item.answer}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison section */}
      <section className="relative max-w-6xl px-6 pb-16 mx-auto">
        <div className="p-8 border shadow-lg home-panel rounded-3xl border-white/70 bg-white">
          <p className="text-sky-600 text-sm font-semibold tracking-[0.3em] uppercase">
            Сравнение
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-black font-futuraPT">
            Почему PartyCRM удобнее таблиц и чатов
          </h2>
          <p className="mt-3 text-sm text-gray-600">
            Когда заказы ведутся в заметках, мессенджерах и Excel, легко потерять
            клиента, забыть о пересечении площадок или не учесть расходы. В PartyCRM
            все ключевые данные в одной системе.
          </p>
          <div className="grid gap-4 mt-6 sm:grid-cols-2">
            {comparisonItems.map((item) => (
              <article
                key={item.title}
                className="p-5 border rounded-2xl border-gray-200/70 bg-gray-50/50"
              >
                <h3 className="text-lg font-semibold text-black">{item.title}</h3>
                <p className="mt-3 text-sm text-gray-600">
                  <span className="font-semibold text-gray-800">Таблицы/чаты: </span>
                  {item.oldWay}
                </p>
                <p className="mt-2 text-sm text-gray-700">
                  <span className="font-semibold text-sky-600">PartyCRM: </span>
                  {item.crmWay}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section className="relative max-w-6xl px-6 pb-20 mx-auto">
        <div className="p-12 border shadow-lg home-panel landing-reveal rounded-3xl border-sky-200/30 bg-gradient-to-br from-sky-50 via-white to-white text-center">
          <p className="text-sky-600 text-sm font-semibold tracking-[0.3em] uppercase">
            Начните сейчас
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-black font-futuraPT">
            Попробуйте PartyCRM бесплатно
          </h2>
          <p className="max-w-lg mx-auto mt-4 text-sm text-gray-600">
            Никаких обязательств. Полный доступ ко всем функциям на время теста.
            Через 14 дней можно выбрать тариф или продолжить в режиме ограниченной версии.
          </p>
          <div className="flex flex-wrap justify-center gap-4 mt-8">
            <Link
              href="/party/login?callbackUrl=/party/entry"
              className="cursor-pointer ui-btn party-cta-primary"
            >
              Попробовать бесплатно
            </Link>
            <Link
              href="#pricing"
              className="cursor-pointer ui-btn party-cta-secondary"
            >
              Сравнить тарифы
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t home-footer border-gray-200/70 bg-white/70">
        <div className="flex flex-col w-full max-w-6xl gap-4 px-6 py-8 mx-auto text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} PartyCRM</span>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/privacy"
              className="text-sky-600"
              target="_blank"
              rel="noreferrer"
            >
              Политика конфиденциальности
            </Link>
            <Link
              href="/terms"
              className="text-sky-600"
              target="_blank"
              rel="noreferrer"
            >
              Пользовательское соглашение
            </Link>
            <Link
              href="/personal-data-consent"
              className="text-sky-600"
              target="_blank"
              rel="noreferrer"
            >
              Согласие на обработку персональных данных
            </Link>
            <Link
              href="/payment"
              className="text-sky-600"
              target="_blank"
              rel="noreferrer"
            >
              Оплата и возвраты
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
