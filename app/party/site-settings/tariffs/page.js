import PartyTariffsAdmin from '../../tariffs/PartyTariffsAdmin'
import SiteSettingsAccessGate from '../SiteSettingsAccessGate'

export const metadata = {
  title: 'PartyCRM - настройка тарифов',
  robots: {
    index: false,
    follow: false,
  },
}

export default function PartySiteSettingsTariffsPage() {
  return (
    <SiteSettingsAccessGate>
      <PartyTariffsAdmin embedded />
    </SiteSettingsAccessGate>
  )
}
