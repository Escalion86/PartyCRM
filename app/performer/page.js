import PerformerWorkspaceClient from './PerformerWorkspaceClient'

export const metadata = {
  title: 'PartyCRM - кабинет исполнителя',
  applicationName: 'PartyCRM',
  manifest: '/manifest.json',
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

export default function PerformerPage() {
  return <PerformerWorkspaceClient />
}
