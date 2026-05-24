import CompanyPageShell from './CompanyPageShell'

export const metadata = {
  title: 'PartyCRM - кабинет компании',
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

export default function CompanyPage() {
  return <CompanyPageShell section="overview" />
}
