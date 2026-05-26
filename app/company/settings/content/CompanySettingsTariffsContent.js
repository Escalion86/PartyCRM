'use client'

import Link from 'next/link'

export default function CompanySettingsTariffsContent() {
  return (
    <div className="grid gap-4">
      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="text-base font-semibold">Управление тарифами</div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Тарифный функционал PartyCRM уже существует отдельно. Из настроек
          компании можно перейти в текущее административное управление тарифами.
        </p>
        <Link
          href="/party/tariffs"
          className="mt-4 inline-flex rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-700"
        >
          Открыть тарифы PartyCRM
        </Link>
      </div>
    </div>
  )
}
