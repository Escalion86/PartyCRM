import Link from 'next/link'

const siteUrl = (process.env.DOMAIN || 'https://partycrm.ru').replace(/\/$/, '')
const pageUrl = `${siteUrl}/privacy`
const ogImage = `${siteUrl}/og-image.jpg`

export const metadata = {
  title: 'Политика конфиденциальности — PartyCRM',
  description: 'Политика конфиденциальности сервиса PartyCRM.',
  alternates: {
    canonical: pageUrl,
  },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: pageUrl,
    siteName: 'PartyCRM',
    title: 'Политика конфиденциальности — PartyCRM',
    description: 'Политика конфиденциальности сервиса PartyCRM.',
    images: [
      {
        url: ogImage,
        width: 1200,
        height: 630,
        alt: 'PartyCRM — Политика конфиденциальности',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Политика конфиденциальности — PartyCRM',
    description: 'Политика конфиденциальности сервиса PartyCRM.',
    images: [ogImage],
  },
  robots: {
    index: true,
    follow: true,
  },
}

const EffectiveDate = '15.06.2026'

export default function PrivacyPage() {
  return (
    <main className="bg-white">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-6 py-12 text-sm text-gray-700">
        <div className="flex flex-col gap-2">
          <p className="text-general text-xs font-semibold tracking-[0.2em] uppercase">
            Документы
          </p>
          <h1 className="font-futuraPT text-3xl font-semibold text-black">
            Политика конфиденциальности
          </h1>
          <p className="text-sm text-gray-500">Действует с: {EffectiveDate}</p>
        </div>

        <p>
          ИП Белинский Алексей Алексеевич (ИНН 245727560982, ОГРНИП
          319246800103511), адрес: РФ, Красноярский край, г. Красноярск, ул. 4
          Продольная 34 (далее — «Оператор») соблюдает требования
          законодательства РФ о персональных данных и обрабатывает персональные
          данные пользователей сервиса PartyCRM (далее — «Сервис»).
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
            клиентов, а также иная информация, которую пользователь решит
            хранить в Сервисе.
          </p>
          <p>
            2.3. Технические данные: стандартные данные, передаваемые браузером
            при обращении к серверу (IP, user-agent, дата/время запросов).
          </p>
          <p>
            2.4. Для анализа работы сайта используется сервис Яндекс Метрика,
            который может обрабатывать технические данные, IP-адрес, сведения
            о браузере и устройстве, cookies и иные идентификаторы, источники и
            время посещений, просмотренные страницы и действия пользователя на
            сайте. Включенная функция Вебвизор может записывать взаимодействие
            с интерфейсом, включая движения мыши, прокрутку и нажатия, без цели
            получить содержание вводимых пользователем конфиденциальных данных.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            3. Цели обработки
          </h2>
          <p>3.1. Предоставление доступа к Сервису и его функциональности.</p>
          <p>3.2. Сохранение и отображение данных пользователей в CRM.</p>
          <p>3.3. Техническая поддержка и связь с пользователем.</p>
          <p>
            3.4. Анализ посещаемости, выявление технических проблем и улучшение
            удобства, стабильности и функциональности Сервиса с помощью Яндекс
            Метрики.
          </p>
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
            — Яндекс Метрика — для веб-аналитики и улучшения Сервиса. Обработка
            данных Яндексом регулируется{' '}
            <a
              href="https://yandex.ru/legal/confidential/"
              className="text-general"
              target="_blank"
              rel="noreferrer"
            >
              Политикой конфиденциальности Яндекса
            </a>
            . Пользователь может управлять cookies, ограничивать или удалять их
            средствами своего браузера; это может повлиять на работу отдельных
            функций сайта.
          </p>
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
            6. Использование данных Google Calendar
          </h2>
          <p>
            6.1. Интеграция подключается пользователем добровольно через OAuth.
            PartyCRM получает адрес электронной почты подключенного Google
            аккаунта, OAuth-токены и список календарей, чтобы пользователь мог
            выбрать календарь для синхронизации.
          </p>
          <p>
            6.2. После включения интеграции PartyCRM может создавать, обновлять
            и удалять события в выбранном календаре. В события передаются
            выбранные пользователем данные заказов: название и статус заказа,
            дата, время, место, клиент, услуги, исполнители, суммы, комментарии
            и напоминания в объеме, заданном настройками интеграции.
          </p>
          <p>
            6.3. Данные Google не продаются, не используются для рекламы и не
            передаются для рекламного профилирования. Использование и передача
            данных, полученных через Google API, соответствуют требованиям{' '}
            <a
              href="https://developers.google.com/terms/api-services-user-data-policy"
              className="text-general"
              target="_blank"
              rel="noreferrer"
            >
              Google API Services User Data Policy
            </a>{' '}
            и принципу Limited Use.
          </p>
          <p>
            6.4. Пользователь может отключить интеграцию в настройках PartyCRM
            и отозвать доступ в настройках безопасности Google аккаунта.
            Отключение прекращает дальнейшую синхронизацию.
          </p>
          <p>
            6.5. Для удаления аккаунта PartyCRM и связанных с ним данных,
            включая сохраненные OAuth-токены, пользователь направляет запрос на{' '}
            <a href="mailto:Escalion86@gmail.com" className="text-general">
              Escalion86@gmail.com
            </a>
            .
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            7. Хранение и защита
          </h2>
          <p>
            7.1. Данные хранятся столько, сколько необходимо для предоставления
            Сервиса и выполнения обязательств.
          </p>
          <p>
            7.2. Оператор принимает разумные технические и организационные меры
            защиты данных от несанкционированного доступа.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            8. Права пользователя
          </h2>
          <p>
            8.1. Пользователь вправе запросить доступ, исправление или удаление
            своих данных, направив запрос на{' '}
            <a href="mailto:Escalion86@gmail.com" className="text-general">
              Escalion86@gmail.com
            </a>
            .
          </p>
          <p>
            8.2. Пользователь вправе отозвать согласие на обработку данных, что
            может повлечь невозможность дальнейшего использования Сервиса.
          </p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            9. Возрастные ограничения
          </h2>
          <p>9.1. Сервис предназначен для лиц старше 18 лет.</p>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-black">
            10. Изменения Политики
          </h2>
          <p>
            10.1. Оператор вправе обновлять Политику. Актуальная версия
            публикуется на сайте{' '}
            <Link href="/" className="text-general">
              https://partycrm.ru
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  )
}
