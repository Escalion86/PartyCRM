import Image from 'next/image'
import Link from 'next/link'
import { seoLandingPages, seoLandingSlugs, normalizedSiteUrl } from '@helpers/seoLandingPages'

const productSignals = [
  'заявки',
  'клиенты',
  'оплаты',
  'договоры',
  'напоминания',
]

const SeoLandingPage = ({ page }) => {
  const pageUrl = `${normalizedSiteUrl}/${page.slug}`
  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'SoftwareApplication',
      name: 'ArtistCRM',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      inLanguage: 'ru-RU',
      url: pageUrl,
      description: page.description,
      audience: {
        '@type': 'Audience',
        audienceType: page.audience,
      },
      offers: {
        '@type': 'Offer',
        priceCurrency: 'RUB',
        availability: 'https://schema.org/InStock',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: page.faq.map((item) => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: item.answer,
        },
      })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'ArtistCRM',
          item: `${normalizedSiteUrl}/`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: page.title,
          item: pageUrl,
        },
      ],
    },
  ]

  const relatedPages = seoLandingSlugs
    .filter((slug) => slug !== page.slug)
    .map((slug) => seoLandingPages[slug])

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-gray-900 home-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
        <Link href="/" className="flex items-center gap-3 cursor-pointer">
          <Image
            src="/img/logo-48.png"
            alt="ArtistCRM"
            width={40}
            height={40}
            className="h-10 w-10 rounded-full object-cover"
            priority
          />
          <span className="text-sm font-semibold text-black">ArtistCRM</span>
        </Link>
        <Link href="/login" className="ui-btn ui-btn-primary cursor-pointer">
          Войти
        </Link>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-8 px-6 pb-14 pt-10 lg:grid-cols-[1.08fr_0.92fr] lg:items-center">
        <div>
          <p className="text-general text-sm font-semibold uppercase tracking-[0.22em]">
            {page.title}
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold text-black font-futuraPT sm:text-5xl">
            {page.h1}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-gray-700 sm:text-lg">
            {page.lead}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {productSignals.map((item) => (
              <span
                key={item}
                className="rounded-full border border-general/30 bg-white px-4 py-2 text-sm font-semibold text-gray-800 shadow-sm"
              >
                {item}
              </span>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link href="/login" className="ui-btn ui-btn-primary cursor-pointer">
              Начать работу
            </Link>
            <Link
              href="/#pricing"
              className="ui-btn ui-btn-secondary cursor-pointer"
            >
              Смотреть тарифы
            </Link>
          </div>
        </div>

        <aside className="rounded-2xl border border-white/80 bg-white p-6 shadow-lg">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            Рабочий контур
          </p>
          <div className="mt-5 grid gap-3">
            {page.scenarios.map((item, index) => (
              <div
                key={item}
                className="flex items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-general/15 text-xs font-semibold text-general">
                  {index + 1}
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {item}
                </span>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <h2 className="text-3xl font-semibold text-black font-futuraPT">
              Почему это лучше таблиц и чатов
            </h2>
            <p className="mt-4 leading-7 text-gray-700">{page.searchIntent}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {page.features.map((item) => (
              <article
                key={item}
                className="rounded-lg border border-gray-200 bg-white px-4 py-4 shadow-sm"
              >
                <div className="mb-3 h-1.5 w-10 rounded-full bg-general" />
                <h3 className="text-base font-semibold text-gray-900">
                  {item}
                </h3>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <h2 className="text-3xl font-semibold text-black font-futuraPT">
          Частые вопросы
        </h2>
        <div className="mt-6 grid gap-4 lg:grid-cols-3">
          {page.faq.map((item) => (
            <article
              key={item.question}
              className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
            >
              <h3 className="text-lg font-semibold text-black">
                {item.question}
              </h3>
              <p className="mt-3 text-sm leading-6 text-gray-700">
                {item.answer}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-6 py-12">
        <div className="rounded-2xl border border-general/25 bg-white p-6 shadow-lg">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-black font-futuraPT">
                Попробуйте ArtistCRM на реальных заявках
              </h2>
              <p className="mt-2 text-sm text-gray-700">
                Начните с клиентов, ближайших мероприятий и контроля оплат.
              </p>
            </div>
            <Link href="/login" className="ui-btn ui-btn-primary cursor-pointer">
              Перейти в кабинет
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-gray-200 bg-white/70">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-8 text-sm text-gray-600 lg:flex-row lg:items-center lg:justify-between">
          <Link href="/" className="font-semibold text-general">
            ArtistCRM
          </Link>
          <nav className="flex flex-wrap gap-4">
            {relatedPages.map((item) => (
              <Link
                key={item.slug}
                href={`/${item.slug}`}
                className="text-gray-700 hover:text-general"
              >
                {item.title}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </main>
  )
}

export default SeoLandingPage
