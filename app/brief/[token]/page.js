import { getPublicPartyClientBrief } from '@server/partyClientBrief'
import PartyClientBriefForm from './PartyClientBriefForm'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Бриф заказа',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function PartyClientBriefPage({ params }) {
  const { token } = await params
  const brief = await getPublicPartyClientBrief(token)
  return (
    <main className="min-h-screen bg-[#eaf6ff] px-4 py-8 text-slate-950 selection:bg-sky-200 sm:py-14">
      <section className="mx-auto max-w-2xl rounded-2xl border border-sky-200 bg-white px-5 py-6 sm:px-9 sm:py-8">
        {brief ? <PartyClientBriefForm token={token} brief={brief} /> : (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Ссылка на бриф недоступна</h1>
            <p className="mt-2 text-sm leading-6 text-slate-700">Уточните у организатора, как передать ответы.</p>
          </>
        )}
      </section>
    </main>
  )
}
