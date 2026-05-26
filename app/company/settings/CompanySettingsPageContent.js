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
  const [activeCompanyId] = useState(() =>
    typeof window === 'undefined'
      ? ''
      : window.localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY) || ''
  )

  const Component = COMPANY_SETTINGS_CONTENT[activeTab]

  return (
    <CompanySettingsShell
      title={meta.title}
      description={meta.description}
    >
      {activeCompanyId ? (
        Component ? (
          <Component activeCompanyId={activeCompanyId} />
        ) : (
          <div className="rounded-2xl border border-sky-100 bg-sky-50 p-6 text-sm leading-6 text-slate-600">
            Раздел <span className="font-semibold">{meta.title}</span>{' '}
            подключён к новой ветке маршрутов `company/settings`. Содержимое
            вкладки будет реализовано следующими инкрементами.
          </div>
        )
      ) : (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-800">
          Не удалось определить активную компанию. Откройте кабинет компании и
          повторите попытку.
        </div>
      )}
    </CompanySettingsShell>
  )
}
