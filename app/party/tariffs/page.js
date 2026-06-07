import { redirect } from 'next/navigation'

export const metadata = {
  title: 'PartyCRM - управление тарифами',
  applicationName: 'PartyCRM',
  robots: {
    index: false,
    follow: false,
  },
}

export default function PartyTariffsPage() {
  redirect('/party/site-settings/tariffs')
}
