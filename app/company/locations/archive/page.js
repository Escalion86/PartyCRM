import CompanyPageShell from '../../CompanyPageShell'

export const metadata = {
  title: 'PartyCRM - архив точек',
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

export default function CompanyLocationsArchivePage() {
  return <CompanyPageShell section="locationsArchive" />
}
