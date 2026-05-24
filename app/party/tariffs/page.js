import PartyTariffsAdmin from './PartyTariffsAdmin'

export const metadata = {
  title: 'PartyCRM - управление тарифами',
  applicationName: 'PartyCRM',
  robots: {
    index: false,
    follow: false,
  },
}

export default function PartyTariffsPage() {
  return <PartyTariffsAdmin />
}
