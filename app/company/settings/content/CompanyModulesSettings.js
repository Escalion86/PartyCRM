'use client'

import { useState } from 'react'
import Link from 'next/link'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import {
  PARTY_COMPANY_MODULES,
  normalizePartyCompanyModules,
} from '@helpers/partyCompanyModules'

export default function CompanyModulesSettings({ settings, companyId, saving, savePatch }) {
  const actual = normalizePartyCompanyModules(settings?.modules)
  const [draft, setDraft] = useState({})
  const changed = Object.fromEntries(Object.entries(draft).filter(
    ([key, value]) => value.enabled !== actual[key].enabled
  ))
  const dirty = Object.keys(changed).length > 0
  usePartyUnsavedChanges(dirty, {
    label: 'блоки компании',
    scope: companyId,
    pending: saving,
  })
  const save = async () => {
    try {
      await savePatch({ modules: changed })
      setDraft({})
      window.dispatchEvent(new Event('partycrm:profile-updated'))
    } catch {
      // The settings hook reports the API error and keeps the selected values.
    }
  }
  return (
    <section className="rounded-2xl border border-sky-100 bg-white p-5" aria-labelledby="company-modules-title">
      <h2 id="company-modules-title" className="text-base font-semibold text-slate-950">Блоки компании</h2>
      <p className="mt-1 text-sm text-slate-600">Подключите сценарии, с которыми работает компания. Права сотрудников настраиваются в должностях.</p>
      <div className="mt-4 divide-y divide-slate-200">
        {PARTY_COMPANY_MODULES.map((module) => {
          const enabled = draft[module.key]?.enabled ?? actual[module.key].enabled
          return (
            <div key={module.key} className="py-4 first:pt-0">
              <label className="flex min-h-11 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed"
                  checked={enabled}
                  disabled={saving}
                  aria-describedby={`company-module-${module.key}-description`}
                  onChange={(event) => setDraft((current) => ({ ...current, [module.key]: { enabled: event.target.checked } }))}
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-950">{module.title}</span>
                  <span id={`company-module-${module.key}-description`} className="mt-1 block text-sm text-slate-600">{module.description}</span>
                </span>
              </label>
              {!enabled ? <p className="ml-8 mt-2 text-sm text-slate-600">{module.disabledDescription}</p> : null}
              {!actual[module.key].enabled && module.historyHref ? (
                <Link href={`${module.historyHref}?companyId=${encodeURIComponent(companyId)}`} className="ml-8 mt-2 inline-flex min-h-11 cursor-pointer items-center text-sm font-semibold text-sky-800 underline underline-offset-4 hover:text-sky-950 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700">{module.historyLabel}</Link>
              ) : null}
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={!dirty || saving} onClick={save} className="min-h-11 cursor-pointer rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300">
          {saving ? 'Сохраняем…' : 'Сохранить блоки'}
        </button>
        <span role="status" className="text-sm text-slate-600">{dirty ? 'Есть несохранённые изменения' : ''}</span>
      </div>
    </section>
  )
}
