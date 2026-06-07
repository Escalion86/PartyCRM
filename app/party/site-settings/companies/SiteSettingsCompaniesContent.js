'use client'

import { apiJson } from '@helpers/apiClient'
import { getPartyCompanyBillingLabel } from '@helpers/partySiteSettingsViewModel'
import { useEffect, useMemo, useState } from 'react'

const formatDate = (value) => {
  if (!value) return '-'
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export default function SiteSettingsCompaniesContent() {
  const [companies, setCompanies] = useState([])
  const [tariffs, setTariffs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [savingCompanyId, setSavingCompanyId] = useState('')

  useEffect(() => {
    Promise.all([
      apiJson('/api/party/site-settings/companies', { cache: 'no-store' }),
      apiJson('/api/party/tariffs', { cache: 'no-store' }),
    ])
      .then(([companiesPayload, tariffsPayload]) => {
        setCompanies(
          Array.isArray(companiesPayload?.data) ? companiesPayload.data : []
        )
        setTariffs(Array.isArray(tariffsPayload?.data) ? tariffsPayload.data : [])
      })
      .catch((err) => setError(err?.message || 'Не удалось загрузить компании'))
      .finally(() => setLoading(false))
  }, [])

  const activeCompaniesCount = useMemo(
    () => companies.filter((company) => company.status === 'active').length,
    [companies]
  )

  const handleTariffChange = async (company, tariffId) => {
    setSavingCompanyId(company._id)
    setError('')
    try {
      const payload = await apiJson(
        `/api/party/site-settings/companies/${company._id}/tariff`,
        {
          method: 'PATCH',
          body: JSON.stringify({ tariffId }),
        }
      )
      setCompanies((items) =>
        items.map((item) => (item._id === company._id ? payload.data : item))
      )
    } catch (err) {
      setError(err?.message || 'Не удалось изменить тариф компании')
    } finally {
      setSavingCompanyId('')
    }
  }

  return (
    <section className="rounded-2xl border border-sky-100 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sky-100 p-5">
        <div>
          <div className="text-base font-semibold">Компании</div>
          <p className="mt-1 text-sm text-slate-500">
            Глобальный список компаний с текущим тарифом и балансом.
          </p>
        </div>
        <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-700">
          {activeCompaniesCount} активных из {companies.length}
        </div>
      </div>
      {loading ? (
        <div className="p-5 text-sm text-slate-500">Загружаем компании...</div>
      ) : error ? (
        <div className="m-5 rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : companies.length === 0 ? (
        <div className="p-5 text-sm text-slate-500">Компании не найдены.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-5 py-3 font-semibold">Компания</th>
                <th className="px-5 py-3 font-semibold">Контакты</th>
                <th className="px-5 py-3 font-semibold">Тариф</th>
                <th className="px-5 py-3 font-semibold">Биллинг</th>
                <th className="px-5 py-3 font-semibold">Статус</th>
                <th className="px-5 py-3 font-semibold">Создана</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {companies.map((company) => (
                <tr key={company._id} className="align-top">
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-900">
                      {company.title || 'Без названия'}
                    </div>
                    <div className="text-xs text-slate-400">
                      {company.legalTitle || '-'}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    <div>{company.phone || '-'}</div>
                    <div className="text-xs text-slate-400">
                      {company.email || '-'}
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    <div className="grid gap-2">
                      <select
                        value={company.tariffId || ''}
                        disabled={savingCompanyId === company._id}
                        onChange={(event) =>
                          handleTariffChange(company, event.target.value)
                        }
                        className="h-9 w-full min-w-44 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none transition-colors focus:border-sky-400"
                      >
                        <option value="">Без тарифа</option>
                        {tariffs.map((tariff) => (
                          <option key={tariff._id} value={tariff._id}>
                            {tariff.title}
                            {tariff.hidden ? ' (скрыт)' : ''}
                          </option>
                        ))}
                      </select>
                      <span className="text-xs text-slate-400">
                        {savingCompanyId === company._id
                          ? 'Сохраняем...'
                          : getPartyCompanyBillingLabel({
                              company,
                              tariff: company.tariff,
                            })}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-slate-600">
                    <div>{company.billingStatus || '-'}</div>
                    <div className="text-xs text-slate-400">
                      до {formatDate(company.tariffActiveUntil)}
                    </div>
                  </td>
                  <td className="px-5 py-4">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                      {company.status || '-'}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-slate-500">
                    {formatDate(company.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
