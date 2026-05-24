import Link from 'next/link'
import Image from 'next/image'
import dbConnect from '@server/dbConnect'
import Tariffs from '@models/Tariffs'
import { getServerSession } from 'next-auth'
import authOptions from './api/auth/[...nextauth]/_options'
import { redirect } from 'next/navigation'
import ThemeToggleButton from '@components/ThemeToggleButton'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCloudArrowUp } from '@fortawesome/free-solid-svg-icons/faCloudArrowUp'

const rawDomain = process.env.DOMAIN || 'https://artistcrm.ru'
const siteUrl = rawDomain.startsWith('http') ? rawDomain : `https://${rawDomain}`
const normalizedSiteUrl = siteUrl.replace(/\/$/, '')
const homeUrl = `${normalizedSiteUrl}/`
const ogImageUrl = `${normalizedSiteUrl}/icons/AppImages/android/android-launchericon-512-512.png`

export const metadata = {
  title: 'ArtistCRM - CRM для артистов, ведущих и музыкантов',
  description:
    'ArtistCRM: CRM-система для артистов. Заявки, клиенты, финансы, Google Календарь, договоры и акты в одном кабинете.',
  keywords: [
    'crm для артистов',
    'crm для ведущих',
    'crm для музыкантов',
    'учет заявок',
    'google календарь для мероприятий',
    'учет клиентов и оплат',
  ],
  alternates: {
    canonical: homeUrl,
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: homeUrl,
    siteName: 'ArtistCRM',
    title: 'ArtistCRM - CRM для артистов, ведущих и музыкантов',
    description:
      'Соберите заявки, клиентов, финансы и документы в одном месте. Контроль сроков и синхронизация с Google Календарем.',
    images: [
      {
        url: ogImageUrl,
        width: 512,
        height: 512,
        alt: 'ArtistCRM — CRM для артистов',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ArtistCRM - CRM для артистов',
    description:
      'Управляйте заявками, мероприятиями, оплатами и документами из одного кабинета.',
    images: [ogImageUrl],
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
}

export const dynamic = 'force-dynamic'

const formatPrice = (price) => {
  if (!price || Number(price) === 0) return 'Бесплатно'
  return `${Number(price).toLocaleString('ru-RU')} ₽/мес`
}

const formatEventsLimit = (limit) => {
  if (!Number.isFinite(limit) || Number(limit) === 0) {
    return 'Без ограничений по мероприятиям'
  }
  return `До ${limit} мероприятий в месяц`
}

const faqItems = [
  {
    question: 'Для кого подходит ArtistCRM?',
    answer:
      'ArtistCRM подходит соло-артистам, ведущим, музыкантам и небольшим командам, которым важно не терять заявки и контролировать сроки мероприятий.',
  },
  {
    question: 'Есть ли синхронизация с Google Календарем?',
    answer:
      'Да, ArtistCRM поддерживает синхронизацию мероприятий и дополнительных событий с Google Календарем.',
  },
  {
    question: 'Можно ли вести финансы по мероприятиям?',
    answer:
      'Да, в системе доступен учет оплат и расходов, контроль задатков, а также базовая аналитика по финансовым результатам мероприятий.',
  },
  {
    question: 'Можно ли формировать документы по мероприятию?',
    answer:
      'Да, в ArtistCRM доступны шаблоны договоров и актов с автоподстановкой данных из карточки мероприятия.',
  },
  {
    question: 'Работает ли CRM с телефона?',
    answer:
      'Да, веб-интерфейс адаптирован под мобильные устройства, чтобы ключевые действия были удобны на смартфоне.',
  },
]

export default async function HomePage() {
  const session = await getServerSession(authOptions)
  if (session?.user?._id) {
    redirect('/cabinet')
  }
  let tariffs = []
  try {
    await dbConnect()
    tariffs = await Tariffs.find({ hidden: { $ne: true } })
      .sort({ price: 1, title: 1 })
      .lean()
  } catch (error) {
    tariffs = []
  }

  const publicTariffs = tariffs ?? []

  const softwareApplicationSchema = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'ArtistCRM',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: 'ru-RU',
    url: homeUrl,
    description:
      'CRM-система для артистов: управление заявками, клиентами, финансами, календарем и документами.',
    offers:
      publicTariffs.length > 0
        ? publicTariffs.map((tariff) => ({
            '@type': 'Offer',
            name: tariff?.title || 'Тариф',
            price: Number(tariff?.price ?? 0),
            priceCurrency: 'RUB',
          }))
        : [
            {
              '@type': 'Offer',
              price: 0,
              priceCurrency: 'RUB',
              name: 'Бесплатный тариф',
            },
          ],
  }

  const organizationSchema = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'ArtistCRM',
    url: homeUrl,
    logo: `${normalizedSiteUrl}/img/logo.png`,
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
      <div className="relative z-20 flex items-center justify-between w-full max-w-6xl px-6 pt-6 mx-auto">
        <Link href="/" className="flex items-center gap-3 cursor-pointer">
          <Image
            src="/img/logo.png"
            alt="ArtistCRM"
            width={36}
            height={36}
            className="object-cover rounded-full h-9 w-9"
            priority
          />
          <span className="text-sm font-semibold tracking-wide text-black">
            ArtistCRM
          </span>
        </Link>
        <Link href="/login" className="cursor-pointer ui-btn ui-btn-primary">
          Войти в систему
        </Link>
      </div>

      <div className="absolute inset-0 pointer-events-none home-hero-bg">
        <div className="absolute right-0 rounded-full from-general/40 -top-24 h-72 w-72 bg-gradient-to-br via-white/10 to-transparent blur-3xl" />
        <div className="via-general/20 absolute bottom-0 left-0 h-80 w-80 rounded-full bg-gradient-to-tr from-[#c9a86a]/30 to-transparent blur-3xl" />
        <div className="absolute inset-x-0 top-40 mx-auto h-64 w-[80%] bg-[radial-gradient(circle_at_center,rgba(201,168,106,0.22),transparent_60%)]" />
      </div>

      <section className="relative flex flex-col max-w-6xl gap-10 px-6 pt-20 pb-16 mx-auto lg:flex-row lg:items-center">
        <div className="flex-1">
          <p className="landing-reveal text-general text-sm font-semibold tracking-[0.3em] uppercase">
            CRM для артистов
          </p>
          <h1 className="mt-5 text-4xl font-semibold text-black landing-reveal font-futuraPT sm:text-5xl lg:text-6xl">
            Соберите все заявки, финансы и клиентов в одном понятном месте
          </h1>
          <p className="max-w-xl mt-6 text-base text-gray-700 landing-reveal sm:text-lg">
            ArtistCRM помогает артистам контролировать заявки, вести учет
            доходов, держать связь с клиентами и закрывать документы по каждому
            мероприятию без хаоса и табличек.
          </p>
          <p className="max-w-xl mt-3 text-sm text-gray-600 landing-reveal sm:text-base">
            CRM — это система хранения заявок, клиентов, оплат и историй
            действий в одном месте.
          </p>
          <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-gray-600 landing-reveal">
            <span className="flex items-center gap-2 px-4 py-2 rounded-full shadow-sm home-chip bg-white/80">
              <FontAwesomeIcon
                icon={faCloudArrowUp}
                className="w-4 h-4 text-general"
              />
              <span>
                Все данные сохраняются в облаке и доступны с любого устройства
              </span>
            </span>
            <div className="flex items-center">
              <div className="flex items-center gap-3 px-4 py-2 rounded-full shadow-sm home-chip bg-white/80">
                <span>Светлая / тёмная тема</span>
                <ThemeToggleButton />
              </div>
              <div className="flex text-base font-semibold text-general whitespace-nowrap">
                <div className="-translate-x-1.5 -translate-y-4 scale-x-250 scale-y-200 rotate-15">
                  ↶
                </div>
                нажми
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-8 landing-reveal">
            <Link
              href="/login"
              className="cursor-pointer ui-btn ui-btn-primary"
            >
              Войти в систему
            </Link>
            <Link
              href="#pricing"
              className="cursor-pointer ui-btn ui-btn-secondary"
            >
              Посмотреть тарифы
            </Link>
          </div>
        </div>

        <div className="relative flex-1 hidden lg:block">
          <div className="w-full p-6 border shadow-lg home-panel landing-reveal rounded-3xl border-white/70 bg-white/80 backdrop-blur lg:mt-6">
            <p className="text-general text-xs font-semibold tracking-[0.2em] uppercase">
              Ключевые моменты
            </p>
            <h2 className="mt-3 text-2xl font-semibold text-black font-futuraPT">
              Полный контроль в одном месте
            </h2>
            <p className="mt-3 text-sm text-gray-600">
              Заявки, клиенты, финансы и документы собираются в ArtistCRM без
              потерь.
            </p>
            <div className="grid gap-3 mt-4">
              {[
                'Учет всех поступающих заявок',
                'Контроль финансов и доходов',
                'Ведение статистики по мероприятиям',
                'Работа с клиентами и история общения',
                'Синхронизация с Google Calendar',
                'Автоформирование договоров и актов + хранение счетов и чеков',
                'Интеграция с Tilda и любыми сайтами: заявки сразу в ArtistCRM',
              ].map((item) => (
                <div
                  key={item}
                  className="px-4 py-3 text-sm text-gray-700 bg-white border shadow-sm home-mini-card rounded-2xl border-gray-200/60"
                >
                  <div className="flex items-start gap-3">
                    <span className="w-3 h-3 mt-1 rounded-full bg-general" />
                    <span className="font-medium text-gray-900">{item}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative max-w-6xl px-6 pb-16 mx-auto lg:hidden">
        <div className="p-8 shadow-lg home-panel landing-reveal rounded-3xl bg-white/70 backdrop-blur sm:p-10">
          <div className="grid gap-8 lg:grid-cols-3">
            <div>
              <p className="text-general text-sm font-semibold tracking-[0.3em] uppercase">
                Ключевые моменты
              </p>
              <h2 className="mt-4 text-3xl font-semibold text-black font-futuraPT">
                Полный контроль над артистическим бизнесом
              </h2>
              <p className="mt-4 text-sm text-gray-600">
                Данные по заявкам, доходам, клиентам и документам собираются в
                единую понятную картину.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
              {[
                'Учет всех поступающих заявок',
                'Контроль финансов и доходов',
                'Ведение статистики по мероприятиям',
                'Работа с клиентами и история общения',
                'Синхронизация с Google календарем',
                'Автоформирование договоров и актов + хранение счетов и чеков',
                'Интеграция с Tilda и любыми сайтами: заявки приходят сразу в ArtistCRM',
              ].map((item, index) => (
                <div
                  key={item}
                  className="px-4 py-4 text-sm text-gray-700 bg-white border shadow-sm home-mini-card landing-stagger rounded-2xl border-gray-200/60"
                  style={{ '--delay': `${index * 120 + 120}ms` }}
                >
                  <div className="flex items-start gap-3">
                    <span className="w-3 h-3 mt-1 rounded-full bg-general" />
                    <span className="font-medium text-gray-900">{item}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative max-w-6xl px-6 pb-16 mx-auto">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="p-8 border shadow-lg home-panel home-panel--light landing-reveal border-general/20 to-general/10 rounded-3xl bg-gradient-to-br from-white via-white">
            <p className="text-general text-sm font-semibold tracking-[0.3em] uppercase">
              Как это работает
            </p>
            <h3 className="mt-4 text-2xl font-semibold text-black font-futuraPT">
              Простая логика без перегруженного интерфейса
            </h3>
            <ol className="mt-6 space-y-4 text-sm text-gray-700">
              {[
                'Фиксируете входящие заявки в одном списке.',
                'Система автоматически показывает финансовую картину.',
                'Клиентская история собирается по каждому событию.',
                'Договоры и акты формируются автоматически, счета и чеки сохраняются в карточке мероприятия.',
              ].map((item) => (
                <li key={item}>
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center w-6 h-6 text-xs font-semibold rounded-full bg-general/15 text-general min-w-6">
                      ✓
                    </span>
                    <span className="font-medium text-gray-900">{item}</span>
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="p-8 border shadow-lg home-panel landing-reveal rounded-3xl border-white/70 bg-white/70 backdrop-blur">
            <p className="text-general text-sm font-semibold tracking-[0.3em] uppercase">
              Работа с клиентами
            </p>
            <h3 className="mt-4 text-2xl font-semibold text-black font-futuraPT">
              Звонки, мессенджеры и важные контакты — рядом с заявкой
            </h3>
            <p className="mt-4 text-sm text-gray-600">
              Вы видите, кто и когда обращался, какое мероприятие обсуждалось, и
              на каком этапе сейчас находится сделка.
            </p>
            <div className="px-4 py-4 mt-6 text-sm text-gray-700 bg-white border home-mini-card rounded-2xl border-gray-200/60">
              <p className="text-xs font-semibold tracking-[0.2em] text-gray-500 uppercase">
                В планах
              </p>
              <p className="mt-2 text-base font-semibold text-black">
                Контроль звонков и карточка клиента при входящем вызове
              </p>
              <p className="mt-2 text-sm text-gray-600">
                Система подскажет ключевую информацию о клиенте прямо во время
                разговора.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section id="pricing" className="relative max-w-6xl px-6 pb-20 mx-auto">
        <div className="flex flex-col items-start gap-6 landing-reveal sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-general text-sm font-semibold tracking-[0.3em] uppercase">
              Тарифы
            </p>
            <h2 className="mt-4 text-3xl font-semibold text-black font-futuraPT">
              Выберите формат работы
            </h2>
            <p className="mt-3 text-sm text-gray-600">
              Подберите вариант, который подходит по объему мероприятий и
              доступным функциям.
            </p>
          </div>
          <Link href="/login" className="cursor-pointer ui-btn ui-btn-primary">
            Попробовать бесплатно
          </Link>
        </div>

        <div className="grid gap-6 mt-8 lg:grid-cols-2">
          {publicTariffs.length > 0 ? (
            publicTariffs.map((tariff, index) => {
              const isFree = Number(tariff?.price ?? 0) === 0
              const features = isFree
                ? [
                    'Создание заявок без ограничений',
                    'Ведение клиентов без ограничений',
                    'Учет полученных оплат от клиентов',
                  ]
                : [
                    'Все что в бесплатном тарифе',
                    'Синхронизация с Google календарем',
                    'Просмотр статистики',
                    'Автоформирование договоров/актов и хранение счетов/чеков',
                  ]
              return (
                <div
                  key={tariff._id}
                  className={`landing-reveal rounded-3xl border ${
                    index % 2 === 0
                      ? 'home-panel border-gray-200/70 bg-white'
                      : 'home-panel border-general/30 from-general/10 bg-gradient-to-br via-white to-white'
                  } p-8 shadow-lg`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-2xl font-semibold text-black font-futuraPT">
                      {tariff.title || 'Тариф'}
                    </h3>
                    <span className="px-3 py-1 text-xs font-semibold rounded-full bg-general/15 text-general">
                      {formatPrice(tariff.price)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    {formatEventsLimit(tariff.eventsPerMonth)}
                  </p>
                  <ul className="mt-6 space-y-3 text-sm text-gray-700">
                    {features.map((name) => (
                      <li key={name} className="flex items-start gap-3">
                        <span className="w-2 h-2 mt-1 rounded-full bg-general" />
                        <span className="font-medium text-gray-900">
                          {name}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })
          ) : (
            <div className="p-8 text-sm text-gray-500 bg-white border shadow-lg home-panel rounded-3xl border-gray-200/70">
              Тарифы пока не настроены. Скоро здесь появятся варианты подписки.
            </div>
          )}
        </div>
      </section>

      <section className="relative max-w-6xl px-6 pb-16 mx-auto">
        <div className="p-8 border shadow-lg home-panel rounded-3xl border-white/70 bg-white/80 backdrop-blur">
          <p className="text-general text-sm font-semibold tracking-[0.3em] uppercase">
            FAQ
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-black font-futuraPT">
            Частые вопросы об ArtistCRM
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

      <section className="relative max-w-6xl px-6 pb-16 mx-auto">
        <div className="p-8 border shadow-lg home-panel rounded-3xl border-white/70 bg-white">
          <p className="text-general text-sm font-semibold tracking-[0.3em] uppercase">
            Сравнение
          </p>
          <h2 className="mt-4 text-3xl font-semibold text-black font-futuraPT">
            Почему ArtistCRM удобнее таблиц и чатов
          </h2>
          <p className="mt-3 text-sm text-gray-600">
            Когда заявки ведутся в заметках, мессенджерах и Excel, легко
            пропустить клиента или платеж. В ArtistCRM все ключевые данные
            хранятся в одной системе.
          </p>
          <div className="grid gap-4 mt-6 sm:grid-cols-2">
            {[
              {
                title: 'Контроль заявок и сроков',
                oldWay:
                  'Статусы и перезвоны теряются в переписках и отдельных файлах.',
                crmWay:
                  'По каждой заявке видно этап, ближайший контакт и историю действий.',
              },
              {
                title: 'Финансы по мероприятиям',
                oldWay:
                  'Сложно понять фактическую прибыль и состояние оплат в реальном времени.',
                crmWay:
                  'Доходы, расходы, задатки и комментарии по финансам собираются в карточке события.',
              },
              {
                title: 'Документы и договоренности',
                oldWay:
                  'Шаблоны и финальные версии документов хранятся в разных местах.',
                crmWay:
                  'Договоры и акты формируются из данных мероприятия и остаются в едином контуре.',
              },
              {
                title: 'Календарь и напоминания',
                oldWay:
                  'Напоминания создаются вручную и легко дублируются или пропадают.',
                crmWay:
                  'Синхронизация с Google Календарем и дополнительные события помогают не пропускать важное.',
              },
            ].map((item) => (
              <article
                key={item.title}
                className="p-5 border rounded-2xl border-gray-200/70 bg-gray-50/50"
              >
                <h3 className="text-lg font-semibold text-black">{item.title}</h3>
                <p className="mt-3 text-sm text-gray-600">
                  <span className="font-semibold text-gray-800">
                    Таблицы/чаты:
                  </span>{' '}
                  {item.oldWay}
                </p>
                <p className="mt-2 text-sm text-gray-700">
                  <span className="font-semibold text-general">ArtistCRM:</span>{' '}
                  {item.crmWay}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t home-footer border-gray-200/70 bg-white/70">
        <div className="flex flex-col w-full max-w-6xl gap-4 px-6 py-8 mx-auto text-sm text-gray-600 sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} ArtistCRM</span>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/privacy"
              className="text-general"
              target="_blank"
              rel="noreferrer"
            >
              Политика конфиденциальности
            </Link>
            <Link
              href="/terms"
              className="text-general"
              target="_blank"
              rel="noreferrer"
            >
              Пользовательское соглашение
            </Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
