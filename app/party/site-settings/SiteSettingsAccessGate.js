'use client'

import { apiJson } from '@helpers/apiClient'
import PartyAppShell from '@components/party/PartyAppShell'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import {
  PARTY_SITE_SETTINGS_TABS,
  canAccessPartySiteSettings,
} from './siteSettingsNav'

export default function SiteSettingsAccessGate({ children }) {
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiJson('/api/party/auth/me', { cache: 'no-store' })
      .then((payload) => {
        const nextUser = payload?.data?.user || null
        setUser(nextUser)
        if (!nextUser?._id) {
          router.replace(
            `/party/login?callbackUrl=${encodeURIComponent(pathname || '/party/site-settings/tariffs')}`
          )
        }
      })
      .catch((err) => {
        setError(err?.message || 'Не удалось проверить доступ')
      })
      .finally(() => setLoading(false))
  }, [pathname, router])

  const activeTab = useMemo(
    () =>
      PARTY_SITE_SETTINGS_TABS.find((item) => pathname === item.href) ||
      PARTY_SITE_SETTINGS_TABS[0],
    [pathname]
  )

  if (loading) {
    return (
      <PartyAppShell variant="settings">
        <div className="p-6 text-sm text-slate-500">Проверяем доступ...</div>
      </PartyAppShell>
    )
  }

  if (error || !canAccessPartySiteSettings(user?.role)) {
    return (
      <PartyAppShell variant="settings">
        <div className="p-6">
          <div className="rounded-2xl border border-red-100 bg-red-50 p-5 text-sm text-red-700">
            {error || 'Раздел доступен только пользователю со статусом dev.'}
          </div>
        </div>
      </PartyAppShell>
    )
  }

  return (
    <PartyAppShell variant="settings">
      <div className="mx-auto grid w-full max-w-6xl gap-5 p-5">
        <div>
          <h1 className="text-2xl font-semibold">Настройка сайта</h1>
          <p className="mt-1 text-sm text-slate-500">
            Глобальные настройки PartyCRM, доступные только dev-пользователю.
          </p>
        </div>
        <nav className="flex flex-wrap gap-2">
          {PARTY_SITE_SETTINGS_TABS.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                activeTab.href === tab.href
                  ? 'bg-sky-600 text-white'
                  : 'bg-white text-slate-600 hover:bg-sky-50'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </PartyAppShell>
  )
}
