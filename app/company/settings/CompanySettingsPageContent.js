'use client'

import { useState, useSyncExternalStore } from 'react'
import CompanySettingsShell from './CompanySettingsShell'
import { COMPANY_SETTINGS_CONTENT } from './content/companySettingsContentMap'

const ACTIVE_COMPANY_STORAGE_KEY = 'partycrm.activeCompanyId'
const readStoredCompany = () => window.localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY) || ''
const readServerCompany = () => ''
const subscribeCompany = (listener) => {
  window.addEventListener('storage', listener)
  window.addEventListener('partycrm-company-change', listener)
  return () => {
    window.removeEventListener('storage', listener)
    window.removeEventListener('partycrm-company-change', listener)
  }
}

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
  reports: {
    title: 'Формы отчётов',
    description: 'Отчёты исполнителей до и после мероприятия и ответственные за проверку.',
  },
})

export default function CompanySettingsPageContent({ activeTab, companies = [] }) {
  const meta = TAB_META[activeTab] ?? TAB_META.general
  const storedCompanyId = useSyncExternalStore(subscribeCompany, readStoredCompany, readServerCompany)
  const [selectedCompanyId, setSelectedCompanyId] = useState('')
  const [hasEdits, setHasEdits] = useState(false)
  const activeCompanyId = companies.find((company) => company.id === (selectedCompanyId || storedCompanyId))?.id || companies[0]?.id || ''
  const markEdited = () => {
    // Pin the editing company even if a different browser tab changes localStorage.
    setSelectedCompanyId(activeCompanyId)
    setHasEdits(true)
  }

  const Component = COMPANY_SETTINGS_CONTENT[activeTab]

  if (!activeCompanyId) {
    return (
      <CompanySettingsShell title={meta.title} description={meta.description}>
        <div className="p-6 text-sm border rounded-2xl border-sky-100 bg-sky-50 text-slate-500">
          Нет доступной компании для настройки. Откройте кабинет и выберите компанию с правами владельца или администратора.
        </div>
      </CompanySettingsShell>
    )
  }

  return (
    <CompanySettingsShell title={meta.title} description={meta.description}>
      <label className="mb-4 block text-sm text-slate-600">Компания
        <select className="mt-1 min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900" value={activeCompanyId} onChange={(event) => {
          const next = event.target.value
          if (hasEdits && !window.confirm('При смене компании несохранённые изменения формы будут потеряны. Продолжить?')) return
          setSelectedCompanyId(next)
          setHasEdits(false)
          window.localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, next)
          window.dispatchEvent(new Event('partycrm-company-change'))
        }}>
          {companies.map((company) => <option key={company.id} value={company.id}>{company.title}</option>)}
        </select>
      </label>
      {Component ? (
        <div key={`${activeCompanyId}:${activeTab}`} onChange={markEdited}>
          <Component activeCompanyId={activeCompanyId} />
        </div>
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
