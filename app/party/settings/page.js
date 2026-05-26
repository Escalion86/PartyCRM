import PartySettingsClient from './PartySettingsClient'

export const metadata = {
  title: 'PartyCRM - настройки',
  applicationName: 'PartyCRM',
  manifest: '/manifest.json?v=2026-05-27-logo-png',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'PartyCRM',
  },
  robots: {
    index: false,
    follow: false,
  },
}

export default function PartySettingsPage() {
  return <PartySettingsClient />
}
