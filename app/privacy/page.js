import Link from 'next/link'

const siteUrl = (process.env.DOMAIN || 'https://artistcrm.ru').replace(/\/$/, '')
const pageUrl = `${siteUrl}/privacy`
const ogImage = `${siteUrl}/og-image.jpg`

export const metadata = {
  title: 'Политика конфиденциальности — ArtistCRM',
  description: 'Политика конфиденциальности сервиса ArtistCRM.',
  alternates: {
    canonical: pageUrl,
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: pageUrl,
    siteName: 'ArtistCRM',
    title: 'Политика конфиденциальности — ArtistCRM',
    description: 'Политика конфиденциальности сервиса ArtistCRM.',
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: 'ArtistCRM — Политика конфиденциальности',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Политика конфиденциальности — ArtistCRM',
    description: 'Политика конфиденциальности сервиса ArtistCRM.',
    images: [ogImage],
  },
  robots: {
    index: true,
    follow: true,
  },
}

const EffectiveDate = '20.01.2026'

export default function PrivacyPage() {
  return (
    <main className="bg-white">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12 text-sm text-gray-700">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-general">
            Документы
          </p>
          <h1 className="text-3xl font-semibold text-black font-futuraPT">
            Политика конфиденциальности
          </h1>
          <p className="text-sm text-gray-500">Действует с: {EffectiveDate}</p>
        </div>

        <p>
          ИП Белинский Алексей Алексеевич (ИНН 245727560982, ОГРНИП
          319246800103511), адрес: РФ, Красноярский край, г. Красноярск, ул. 4
          Продольная 34 (далее — «Оператор») соблюдает требования
          законодательства РФ о персональных данных и обрабатывает персональные
          данные пользователей сервиса ArtistCRM (далее — «Сервис»).
        </p>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            1. Общие положения
          </h2>
          <p>
            1.1. Политика определяет порядок обработки и защиты персональных
            данных пользователей Сервиса.
          </p>
          <p>
            1.2. Используя Сервис, пользователь выражает согласие с настоящей
            Политикой.
          </p>
          <p>
            1.3. Контакты Оператора для вопросов по персональным данным:{' '}
            <a href="mailto:Escalion86@gmail.com" className="text-general">
              Escalion86@gmail.com
            </a>
            .
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            2. Какие данные мы собираем
          </h2>
          <p>
            2.1. Персональные данные пользователей Сервиса: ФИО, номер телефона.
          </p>
          <p>
            2.2. Данные, которые пользователь вносит в CRM: ФИО и телефон
            клиентов, а также иная информация, которую пользователь решит хранить
            в Сервисе.
          </p>
          <p>
            2.3. Технические данные: стандартные данные, передаваемые браузером
            при обращении к серверу (IP, user-agent, дата/время запросов).
          </p>
          <p>
            2.4. Сервис не использует аналитические системы и не ведет
            поведенческую аналитику.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            3. Цели обработки
          </h2>
          <p>3.1. Предоставление доступа к Сервису и его функциональности.</p>
          <p>3.2. Сохранение и отображение данных пользователей в CRM.</p>
          <p>3.3. Техническая поддержка и связь с пользователем.</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            4. Правовые основания обработки
          </h2>
          <p>
            4.1. Обработка осуществляется на основании согласия пользователя и
            исполнения договора (оферты) по предоставлению Сервиса.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            5. Передача третьим лицам
          </h2>
          <p>
            5.1. Данные могут передаваться внешним сервисам, необходимым для
            работы Сервиса:
          </p>
          <p>— Google Calendar (OAuth) — по инициативе пользователя.</p>
          <p>
            — Платежный сервис ЮKassa — при оплате подписки (планируется
            использование).
          </p>
          <p>
            5.2. Оператор не продает и не передает данные третьим лицам для
            рекламы.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            6. Хранение и защита
          </h2>
          <p>
            6.1. Данные хранятся столько, сколько необходимо для предоставления
            Сервиса и выполнения обязательств.
          </p>
          <p>
            6.2. Оператор принимает разумные технические и организационные меры
            защиты данных от несанкционированного доступа.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            7. Права пользователя
          </h2>
          <p>
            7.1. Пользователь вправе запросить доступ, исправление или удаление
            своих данных, направив запрос на{' '}
            <a href="mailto:Escalion86@gmail.com" className="text-general">
              Escalion86@gmail.com
            </a>
            .
          </p>
          <p>
            7.2. Пользователь вправе отозвать согласие на обработку данных, что
            может повлечь невозможность дальнейшего использования Сервиса.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            8. Возрастные ограничения
          </h2>
          <p>8.1. Сервис предназначен для лиц старше 18 лет.</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            9. Изменения Политики
          </h2>
          <p>
            9.1. Оператор вправе обновлять Политику. Актуальная версия
            публикуется на сайте{' '}
            <Link href="/" className="text-general">
              https://artistcrm.com
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  )
}
