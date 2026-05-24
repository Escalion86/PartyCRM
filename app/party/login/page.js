import Link from 'next/link'
import PartyLoginClient from './PartyLoginClient'

export const metadata = {
  title: 'Вход в PartyCRM',
  applicationName: 'PartyCRM',
  robots: {
    index: false,
    follow: false,
  },
}

const normalizeCallbackUrl = (value) => {
  if (typeof value !== 'string') return '/company'
  if (!value.startsWith('/') || value.startsWith('//')) return '/company'
  return value
}

export default async function PartyLoginPage({ searchParams }) {
  const params = await searchParams
  const callbackUrl = normalizeCallbackUrl(params?.callbackUrl)

  return (
    <main className="min-h-screen bg-[#eaf6ff] text-slate-950">
      <header className="bg-white border-b border-sky-100">
        <div className="flex items-center justify-between max-w-6xl px-5 py-4 mx-auto">
          <Link href="/party" className="text-lg font-semibold text-sky-700 cursor-pointer">
            PartyCRM
          </Link>
          <Link
            href="/party"
            className="px-4 py-2 text-sm font-semibold transition-colors bg-white border rounded-md cursor-pointer text-sky-700 border-sky-200 hover:bg-sky-50"
          >
            На главную
          </Link>
        </div>
      </header>

      <PartyLoginClient callbackUrl={callbackUrl} />
    </main>
  )
}
