import { notFound } from 'next/navigation'
import CompanyPageShell from '../CompanyPageShell'

const sectionTitles = {
  orders: 'Заказы',
  'orders-past': 'Прошедшие заказы',
  clients: 'Клиенты',
  finance: 'Финансы',
  locations: 'Точки',
  staff: 'Сотрудники',
}

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

export default async function CompanySectionPage({ params }) {
  const resolvedParams = await params
  const section = resolvedParams?.section

  if (!sectionTitles[section]) return notFound()

  return <CompanyPageShell section={section} />
}
