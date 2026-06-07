import SiteSettingsAccessGate from '../SiteSettingsAccessGate'
import SiteSettingsCompaniesContent from './SiteSettingsCompaniesContent'

export const metadata = {
  title: 'PartyCRM - компании',
  robots: {
    index: false,
    follow: false,
  },
}

export default function PartySiteSettingsCompaniesPage() {
  return (
    <SiteSettingsAccessGate>
      <SiteSettingsCompaniesContent />
    </SiteSettingsAccessGate>
  )
}
