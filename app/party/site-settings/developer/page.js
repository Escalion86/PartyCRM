import SiteSettingsAccessGate from '../SiteSettingsAccessGate'

export const metadata = {
  title: 'PartyCRM - разработчик',
  robots: {
    index: false,
    follow: false,
  },
}

export default function PartySiteSettingsDeveloperPage() {
  return (
    <SiteSettingsAccessGate>
      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="text-base font-semibold">Разработчик</div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Раздел зарезервирован для технических инструментов и диагностики
          PartyCRM.
        </p>
      </div>
    </SiteSettingsAccessGate>
  )
}
