'use client'

import { useState } from 'react'
import CompanySettingsShell from './CompanySettingsShell'
import { COMPANY_SETTINGS_CONTENT } from './content/companySettingsContentMap'

const ACTIVE_COMPANY_STORAGE_KEY = 'partycrm.activeCompanyId'

const TAB_META = Object.freeze({
  general: {
    title: 'Общие',
    description: 'Базовые параметры компании и поведения кабинета.',
  },
  integrations: {
    title: 'Интеграции',
    description: 'Подключение внешних сервисов на уровне компании.',
  },
  lists: {
    title: 'Списки',
    description: 'Редактируемые справочники компании.',
  },
  notifications: {
    title: 'Уведомления',
    description: 'Push и служебные уведомления компании.',
  },
  documents: {
    title: 'Документы',
    description: 'Реквизиты и DOCX-шаблоны компании.',
  },
  tariffs: {
    title: 'Тарифы',
    description: 'Тариф компании и доступные опции.',
  },
})

export default function CompanySettingsPageContent({ activeTab }) {
  const meta = TAB_META[activeTab] ?? TAB_META.general
  const [activeCompanyId] = useState(() => {
    if (typeof window === 'undefined') return ''
    return window.localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY) || ''
  })

  const Component = COMPANY_SETTINGS_CONTENT[activeTab]

  if (!activeCompanyId) {
    return (
      <CompanySettingsShell title={meta.title} description={meta.description}>
        <div className="p-6 text-sm border rounded-2xl border-sky-100 bg-sky-50 text-slate-500">
          Загружаем настройки компании...
        </div>
      </CompanySettingsShell>
    )
  }

  return (
    <CompanySettingsShell title={meta.title} description={meta.description}>
      {Component ? (
        <Component activeCompanyId={activeCompanyId} />
      ) : (
        <div className="p-6 text-sm leading-6 border rounded-2xl border-sky-100 bg-sky-50 text-slate-600">
          Раздел <span className="font-semibold">{meta.title}</span> подключён к
          новой ветке маршрутов `company/settings`. Содержимое вкладки будет
          реализовано следующими инкрементами.
        </div>
      )}
    </CompanySettingsShell>
  )
}
