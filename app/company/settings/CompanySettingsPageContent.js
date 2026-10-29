'use client'

import { useEffect, useRef, useState } from 'react'
import {
  PARTY_ACTIVE_COMPANY_EVENT,
  PARTY_ACTIVE_COMPANY_STORAGE_KEY,
  readPartyActiveCompanyId,
  publishPartyActiveCompanyId,
} from '@helpers/partyActiveCompany'
import CompanySettingsShell from './CompanySettingsShell'
import { COMPANY_SETTINGS_CONTENT } from './content/companySettingsContentMap'

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
  schedule: {
    title: 'График ответов',
    description:
      'Рабочие часы и исключения для сроков ответа на входящие обращения.',
  },
  reports: {
    title: 'Формы отчётов',
    description:
      'Отчёты исполнителей до и после мероприятия и ответственные за проверку.',
  },
  roles: {
    title: 'Должности',
    description:
      'Полномочия сотрудников, видимость полей и области доступа к заказам.',
  },
  brief: {
    title: 'Бриф заказа',
    description:
      'Вопросы о мероприятии, которые нужно заполнить перед передачей заказа дальше.',
  },
  workflow: {
    title: 'Этапы заказов',
    description: 'Рабочие этапы и разрешённые переходы между ними.',
  },
  'preparation-templates': {
    title: 'Шаблоны задач',
    description: 'Наборы задач подготовки, ответственные и сроки относительно мероприятия.',
  },
})

export default function CompanySettingsPageContent({
  activeTab,
  companies = [],
}) {
  const meta = TAB_META[activeTab] ?? TAB_META.general
  const [activeCompanyId, setActiveCompanyId] = useState(companies[0]?.id || '')
  const [companyReady, setCompanyReady] = useState(false)
  const [companyNotice, setCompanyNotice] = useState('')
  const companyRef = useRef(activeCompanyId)
  const initializedCompany = useRef(false)
  useEffect(() => {
    const apply = (id) => {
      const next = String(id || '')
      if (!next || next === companyRef.current) return
      if (!companies.some((company) => String(company.id) === next)) {
        setCompanyNotice(
          'В выбранной компании нет доступа к настройкам. Текущая форма сохранена на экране.'
        )
        const previous = companyRef.current
        queueMicrotask(() => {
          if (companyRef.current === previous)
            publishPartyActiveCompanyId(previous, {
              skipGuard: true,
              persist: false,
            })
        })
        return
      }
      companyRef.current = next
      setActiveCompanyId(next)
      setCompanyNotice('')
    }
    const changed = (event) => apply(event.detail?.companyId)
    const stored = (event) => {
      if (event.key === PARTY_ACTIVE_COMPANY_STORAGE_KEY) apply(event.newValue)
    }
    const frame = requestAnimationFrame(() => {
      if (
        !initializedCompany.current ||
        !companies.some((company) => String(company.id) === companyRef.current)
      ) {
        initializedCompany.current = true
        const id = readPartyActiveCompanyId(companies, companyRef.current)
        if (id) {
          apply(id)
          publishPartyActiveCompanyId(id, { skipGuard: true })
        } else {
          companyRef.current = ''
          setActiveCompanyId('')
        }
      }
      setCompanyReady(true)
    })
    window.addEventListener(PARTY_ACTIVE_COMPANY_EVENT, changed)
    window.addEventListener('storage', stored)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener(PARTY_ACTIVE_COMPANY_EVENT, changed)
      window.removeEventListener('storage', stored)
    }
  }, [companies])

  const Component = COMPANY_SETTINGS_CONTENT[activeTab]
  const restricted =
    companies.find((company) => company.id === activeCompanyId)?.restricted ===
    true
  const readOnly =
    restricted && !['roles', 'brief', 'workflow', 'reports'].includes(activeTab)

  if (!activeCompanyId) {
    return (
      <CompanySettingsShell title={meta.title} description={meta.description}>
        <div className="rounded-2xl border border-sky-100 bg-sky-50 p-6 text-sm text-slate-500">
          Нет доступной компании для настройки. Откройте кабинет и выберите
          компанию с правами владельца или администратора.
        </div>
      </CompanySettingsShell>
    )
  }

  return (
    <CompanySettingsShell title={meta.title} description={meta.description}>
      <label className="mb-4 block text-sm text-slate-600">
        Компания
        <select
          className="mt-1 min-h-11 w-full cursor-pointer rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
          value={activeCompanyId}
          disabled={!companyReady}
          onChange={(event) => {
            const next = event.target.value
            if (!publishPartyActiveCompanyId(next)) return
            companyRef.current = next
            setActiveCompanyId(next)
          }}
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.title}
            </option>
          ))}
        </select>
      </label>
      {companyNotice && (
        <p
          role="status"
          className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
        >
          {companyNotice}
        </p>
      )}
      {restricted && (
        <p
          role="status"
          className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
        >
          Должность разрешает ограниченный доступ. Общие параметры и интеграции
          изменяет владелец или администратор с полным доступом. Для должностей,
          брифа, этапов и форм отчётов действуют отдельные полномочия.
        </p>
      )}
      {!companyReady ? (
        <p role="status" className="p-3 text-sm text-slate-500">
          Загрузка компании…
        </p>
      ) : Component ? (
        <div key={`${activeCompanyId}:${activeTab}`}>
          <fieldset disabled={readOnly} className="min-w-0 border-0 p-0">
            <Component activeCompanyId={activeCompanyId} />
          </fieldset>
        </div>
      ) : (
        <div className="rounded-2xl border border-sky-100 bg-sky-50 p-6 text-sm leading-6 text-slate-600">
          Раздел <span className="font-semibold">{meta.title}</span> подключён к
          новой ветке маршрутов `company/settings`. Содержимое вкладки будет
          реализовано следующими инкрементами.
        </div>
      )}
    </CompanySettingsShell>
  )
}
