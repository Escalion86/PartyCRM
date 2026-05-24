import Link from 'next/link'

const rawPartyDomain = process.env.PARTYCRM_DOMAIN || 'partycrm.ru'
const partyUrl = rawPartyDomain.startsWith('http')
  ? rawPartyDomain
  : `https://${rawPartyDomain}`

export const metadata = {
  title: 'PartyCRM - CRM для праздничных агентств и event-команд',
  description:
    'PartyCRM помогает компаниям управлять заявками, площадками, администраторами, исполнителями, бронированиями и оплатами.',
  applicationName: 'PartyCRM',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PartyCRM',
  },
  alternates: {
    canonical: `${partyUrl.replace(/\/$/, '')}/`,
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [
      {
        url: '/icons/AppImages/android/android-launchericon-192-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icons/AppImages/android/android-launchericon-512-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: [
      { url: '/icons/AppImages/ios/180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

const featureGroups = [
  {
    title: 'Заявки',
    text: 'Единый поток заказов, клиентов, предоплат и документов.',
  },
  {
    title: 'Площадки',
    text: 'Точки, залы, выездные адреса и контроль пересечений.',
  },
  {
    title: 'Команда',
    text: 'Администраторы, исполнители, назначения и выплаты.',
  },
]

export default function PartyCrmLandingPage() {
  return (
    <main className="min-h-screen bg-[#eaf6ff] text-slate-950">
      <header className="bg-white border-b border-sky-100">
        <div className="flex items-center justify-between max-w-6xl px-5 py-4 mx-auto">
          <Link href="/party" className="text-lg font-semibold text-sky-700 cursor-pointer">
            PartyCRM
          </Link>
          <Link
            href="/party/login?callbackUrl=/company"
            className="px-4 py-2 text-sm font-semibold text-white transition-colors rounded-md cursor-pointer bg-sky-600 hover:bg-sky-700"
          >
            Кабинет компании
          </Link>
        </div>
      </header>

      <section className="max-w-6xl px-5 py-12 mx-auto">
        <p className="text-sm font-semibold uppercase text-sky-700">
          CRM для event-компаний
        </p>
        <h1 className="max-w-3xl mt-4 text-4xl font-semibold leading-tight font-futuraPT sm:text-5xl">
          Управление заявками, площадками и исполнителями в одном кабинете
        </h1>
        <p className="max-w-2xl mt-5 text-base leading-7 text-slate-700 sm:text-lg">
          PartyCRM создается как отдельный продукт для праздничных агентств,
          детских игровых, фотостудий, площадок и команд, где важно
          контролировать бронирования, роли, оплаты и подготовку заказов.
        </p>

        <div className="flex flex-col gap-3 mt-8 sm:flex-row">
          <Link
            href="/party/login?callbackUrl=/company"
            className="px-4 py-2 text-sm font-semibold text-white transition-colors rounded-md cursor-pointer bg-sky-600 hover:bg-sky-700"
          >
            Открыть company preview
          </Link>
          <Link
            href="/party/login?callbackUrl=/performer"
            className="px-4 py-2 text-sm font-semibold transition-colors bg-white border rounded-md cursor-pointer text-sky-700 border-sky-200 hover:bg-sky-50"
          >
            Кабинет исполнителя
          </Link>
        </div>
      </section>

      <section className="bg-white border-y border-sky-100">
        <div className="grid max-w-6xl gap-4 px-5 py-10 mx-auto md:grid-cols-3">
          {featureGroups.map((item) => (
            <div key={item.title} className="p-5 border rounded-lg border-sky-100 bg-sky-50/35">
              <h2 className="text-lg font-semibold">{item.title}</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">{item.text}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
