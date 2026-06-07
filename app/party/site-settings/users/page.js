import SiteSettingsAccessGate from '../SiteSettingsAccessGate'
import SiteSettingsUsersContent from './SiteSettingsUsersContent'

export const metadata = {
  title: 'PartyCRM - пользователи',
  robots: {
    index: false,
    follow: false,
  },
}

export default function PartySiteSettingsUsersPage() {
  return (
    <SiteSettingsAccessGate>
      <SiteSettingsUsersContent />
    </SiteSettingsAccessGate>
  )
}
