import Link from 'next/link'

const siteUrl = (process.env.DOMAIN || 'https://partycrm.ru').replace(/\/$/, '')
const pageUrl = `${siteUrl}/personal-data-consent`
const ogImage = `${siteUrl}/og-image.jpg`

export const metadata = {
  title: 'Согласие на обработку персональных данных — PartyCRM',
  description:
    'Согласие на обработку персональных данных пользователя сервиса PartyCRM.',
  alternates: {
    canonical: pageUrl,
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: pageUrl,
    siteName: 'PartyCRM',
    title: 'Согласие на обработку персональных данных — PartyCRM',
    description:
      'Согласие на обработку персональных данных пользователя сервиса PartyCRM.',
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: 'PartyCRM — Согласие на обработку персональных данных',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Согласие на обработку персональных данных — PartyCRM',
    description:
      'Согласие на обработку персональных данных пользователя сервиса PartyCRM.',
    images: [ogImage],
  },
  robots: {
    index: true,
    follow: true,
  },
}

const EffectiveDate = '15.06.2026'

export default function PersonalDataConsentPage() {
  return (
    <main className="bg-white">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12 text-sm text-gray-700">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-general">
            Документы
          </p>
          <h1 className="text-3xl font-semibold text-black font-futuraPT">
            Согласие на обработку персональных данных
          </h1>
          <p className="text-sm text-gray-500">Действует с: {EffectiveDate}</p>
        </div>

        <p>
          Настоящим, проставляя отметку при регистрации в сервисе PartyCRM
          (далее — «Сервис»), пользователь свободно, своей волей и в своем
          интересе выражает согласие ИП Белинский Алексей Алексеевич (ИНН
          245727560982, ОГРНИП 319246800103511), адрес: РФ, Красноярский край,
          г. Красноярск, ул. 4 Продольная 34 (далее — «Оператор») на обработку
          своих персональных данных на условиях, изложенных ниже.
        </p>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            1. Состав персональных данных
          </h2>
          <p>
            1.1. Пользователь предоставляет Оператору следующие персональные
            данные: фамилия, имя, номер телефона, а также иные сведения,
            которые пользователь добровольно укажет при использовании Сервиса.
          </p>
          <p>
            1.2. В рамках технического функционирования Сервиса также могут
            обрабатываться IP-адрес, сведения о браузере, дата и время запросов
            и иные технические данные, необходимые для работы сайта.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            2. Цели обработки
          </h2>
          <p>
            2.1. Регистрация пользователя и предоставление доступа к
            функциональности PartyCRM.
          </p>
          <p>
            2.2. Идентификация пользователя, поддержка работы учетной записи и
            обеспечение безопасности Сервиса.
          </p>
          <p>
            2.3. Оказание технической поддержки, направление уведомлений,
            связанных с использованием Сервиса, и исполнение обязательств
            Оператора перед пользователем.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            3. Действия с персональными данными
          </h2>
          <p>
            3.1. Оператор вправе осуществлять сбор, запись, систематизацию,
            накопление, хранение, уточнение (обновление, изменение),
            извлечение, использование, передачу в случаях, предусмотренных
            законодательством РФ и необходимых для работы Сервиса,
            обезличивание, блокирование, удаление и уничтожение персональных
            данных.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            4. Срок действия согласия
          </h2>
          <p>
            4.1. Согласие действует с момента его предоставления и в течение
            всего срока использования Сервиса пользователем, а также до момента
            достижения целей обработки либо отзыва согласия пользователем, если
            иное не предусмотрено законодательством РФ.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            5. Отзыв согласия
          </h2>
          <p>
            5.1. Пользователь вправе отозвать согласие путем направления
            письменного запроса на адрес электронной почты{' '}
            <a href="mailto:Escalion86@gmail.com" className="text-general">
              Escalion86@gmail.com
            </a>
            .
          </p>
          <p>
            5.2. Отзыв согласия может повлечь невозможность дальнейшего
            использования учетной записи и функциональности Сервиса.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            6. Связанные документы
          </h2>
          <p>
            6.1. Обработка персональных данных также осуществляется в
            соответствии с{' '}
            <Link href="/privacy" className="text-general">
              Политикой конфиденциальности
            </Link>{' '}
            и{' '}
            <Link href="/terms" className="text-general">
              Пользовательским соглашением
            </Link>
            .
          </p>
          <p>
            6.2. Актуальные версии документов опубликованы на сайте{' '}
            <Link href="/party" className="text-general">
              https://partycrm.ru
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  )
}
