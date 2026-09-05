'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { apiJson } from '@helpers/apiClient'
import partyGenerateContractTemplate, {
  getPartyContractTemplateVariablesMap,
} from '@helpers/partyGenerateContractTemplate'
import partyGenerateActTemplate, {
  getPartyActTemplateVariablesMap,
} from '@helpers/partyGenerateActTemplate'
import exportDocxFromTemplate from '@helpers/exportDocxFromTemplate'
import exportContractTemplateDocx from '@helpers/exportContractTemplateDocx'
import PartyOrderProposalsSection from './PartyOrderProposalsSection'
import {
  formatPartyDocumentFileDate,
  getPartyDocumentTemplateSource,
} from './partyOrderDocuments'

const getServiceTitles = (order, services) => {
  if (order?.serviceTitle) return [order.serviceTitle]
  if (!Array.isArray(services)) return []
  if (Array.isArray(order?.servicesIds) && order.servicesIds.length > 0) {
    const titles = order.servicesIds
      .map((id) => {
        const found = services.find((s) => String(s._id) === String(id))
        return found?.title || ''
      })
      .filter(Boolean)
    if (titles.length > 0) return titles
  }
  return []
}

export default function PartyOrderDocumentsSection({
  order,
  client,
  services = [],
  companySettings,
  activeCompanyId,
}) {
  const [contractNumber, setContractNumber] = useState('1')
  const [contractDate, setContractDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [actNumber, setActNumber] = useState('1')
  const [actDate, setActDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [contractLoading, setContractLoading] = useState(false)
  const [actLoading, setActLoading] = useState(false)
  const [contractError, setContractError] = useState('')
  const [actError, setActError] = useState('')
  const [requisites, setRequisites] = useState(null)

  // Load company settings if not provided
  useEffect(() => {
    if (companySettings?.documents?.requisites) {
      setRequisites(companySettings.documents.requisites)
      return
    }
    if (!activeCompanyId) return

    const loadSettings = async () => {
      try {
        const response = await apiJson('/api/party/company-settings', {
          headers: activeCompanyId
            ? { 'x-partycrm-company-id': activeCompanyId }
            : {},
          cache: 'no-store',
        })
        const settings = response.data?.settings ?? response.data ?? {}
        setRequisites(settings?.documents?.requisites ?? null)
      } catch {
        // silently fail — will show warning below
      }
    }
    loadSettings()
  }, [companySettings, activeCompanyId])

  const hasRequisites = Boolean(
    requisites?.providerFullName || requisites?.providerDisplayName
  )
  const hasClientRequisites = Boolean(
    client?.legalName || client?.inn || client?.bankName
  )
  const serviceTitles = getServiceTitles(order, services)
  const contractAmount = Number(order?.contractAmount || 0)

  const handleGenerateContract = useCallback(async () => {
    setContractLoading(true)
    setContractError('')
    try {
      const fileName = `Договор №${String(contractNumber || '').trim() || '1'} от ${formatPartyDocumentFileDate(contractDate) || formatPartyDocumentFileDate(new Date())}.docx`

      const customTemplateBase64 =
        companySettings?.documents?.contractDocxTemplateBase64 ?? ''
      const templateSource = getPartyDocumentTemplateSource(
        customTemplateBase64
      )
      if (templateSource.type === 'docx') {
        const variables = getPartyContractTemplateVariablesMap({
          order,
          client,
          serviceTitles,
          companyRequisites: requisites || {},
          docMeta: {
            documentNumber: contractNumber,
            contractDate: contractDate,
            requisitesSidesMode: 'docx',
          },
        })
        await exportDocxFromTemplate({
          templateBase64: templateSource.templateBase64,
          fileName,
          variables,
        })
      } else {
        const contractText = partyGenerateContractTemplate({
          order,
          client,
          serviceTitles,
          companyRequisites: requisites || {},
          docMeta: {
            documentNumber: contractNumber,
            contractDate: contractDate,
          },
        })
        await exportContractTemplateDocx(contractText, fileName)
      }
    } catch (err) {
      setContractError(err.message || 'Ошибка генерации договора')
    } finally {
      setContractLoading(false)
    }
  }, [
    order,
    client,
    serviceTitles,
    requisites,
    companySettings,
    contractNumber,
    contractDate,
  ])

  const handleGenerateAct = useCallback(async () => {
    setActLoading(true)
    setActError('')
    try {
      const fileName = `Акт №${String(actNumber || '').trim() || '1'} от ${formatPartyDocumentFileDate(actDate) || formatPartyDocumentFileDate(new Date())}.docx`

      const customTemplateBase64 =
        companySettings?.documents?.actDocxTemplateBase64 ?? ''
      const templateSource = getPartyDocumentTemplateSource(
        customTemplateBase64
      )
      if (templateSource.type === 'docx') {
        const variables = getPartyActTemplateVariablesMap({
          order,
          client,
          serviceTitles,
          companyRequisites: requisites || {},
          docMeta: {
            documentNumber: actNumber,
            actDate: actDate,
            contractDate: contractDate,
            requisitesSidesMode: 'docx',
          },
        })
        await exportDocxFromTemplate({
          templateBase64: templateSource.templateBase64,
          fileName,
          variables,
        })
      } else {
        const actText = partyGenerateActTemplate({
          order,
          client,
          serviceTitles,
          companyRequisites: requisites || {},
          docMeta: {
            documentNumber: actNumber,
            actDate: actDate,
            contractDate: contractDate,
          },
        })
        await exportContractTemplateDocx(actText, fileName)
      }
    } catch (err) {
      setActError(err.message || 'Ошибка генерации акта')
    } finally {
      setActLoading(false)
    }
  }, [
    order,
    client,
    serviceTitles,
    requisites,
    companySettings,
    actNumber,
    actDate,
    contractDate,
  ])

  if (!order?._id) {
    return (
      <div className="p-5 text-sm border rounded-2xl border-sky-100 bg-sky-50/50 text-slate-500">
        Сохраните заказ, чтобы получить доступ к документам.
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {!hasRequisites && (
        <div className="px-4 py-3 text-sm border rounded-md border-amber-200 bg-amber-50 text-amber-800">
          Не заполнены реквизиты компании.{' '}
          <Link
            href="/company/settings/documents"
            className="font-semibold underline text-amber-900"
          >
            Перейти в настройки
          </Link>
        </div>
      )}

      {!hasClientRequisites && client?._id && (
        <div className="px-4 py-3 text-sm border rounded-md border-amber-200 bg-amber-50 text-amber-800">
          У клиента не заполнены реквизиты (ИНН, банк, юр. адрес). Рекомендуем
          заполнить их для корректного формирования документов.
        </div>
      )}

      {contractAmount <= 0 && (
        <div className="px-4 py-3 text-sm border rounded-md border-amber-200 bg-amber-50 text-amber-800">
          Сумма договора не указана. Укажите сумму клиента в поле выше.
        </div>
      )}

      {/* Proposal section */}
      <PartyOrderProposalsSection
        order={order}
        client={client}
        services={services}
        companySettings={companySettings}
        activeCompanyId={activeCompanyId}
      />

      {/* Contract section */}
      <div className="p-4 bg-white border rounded-2xl border-sky-100">
        <div className="mb-3 text-sm font-semibold text-slate-700">
          Договор оказания услуг
        </div>
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <label className="grid gap-1">
            <span className="text-xs font-semibold tracking-wide uppercase text-slate-500">
              № договора
            </span>
            <input
              type="number"
              min={1}
              value={contractNumber}
              onChange={(e) => setContractNumber(e.target.value)}
              className="w-20 px-3 text-sm border rounded-lg h-9 border-sky-100"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold tracking-wide uppercase text-slate-500">
              Дата договора
            </span>
            <input
              type="date"
              value={contractDate}
              onChange={(e) => setContractDate(e.target.value)}
              className="px-3 text-sm border rounded-lg h-9 border-sky-100"
            />
          </label>
          <button
            type="button"
            disabled={contractLoading || !hasRequisites}
            onClick={handleGenerateContract}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {contractLoading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Генерация...
              </>
            ) : (
              'Скачать DOCX'
            )}
          </button>
        </div>
        {contractError ? (
          <div className="text-xs text-red-600">{contractError}</div>
        ) : null}
      </div>

      {/* Act section */}
      <div className="p-4 bg-white border rounded-2xl border-sky-100">
        <div className="mb-3 text-sm font-semibold text-slate-700">
          Акт оказания услуг
        </div>
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <label className="grid gap-1">
            <span className="text-xs font-semibold tracking-wide uppercase text-slate-500">
              № акта
            </span>
            <input
              type="number"
              min={1}
              value={actNumber}
              onChange={(e) => setActNumber(e.target.value)}
              className="w-20 px-3 text-sm border rounded-lg h-9 border-sky-100"
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold tracking-wide uppercase text-slate-500">
              Дата акта
            </span>
            <input
              type="date"
              value={actDate}
              onChange={(e) => setActDate(e.target.value)}
              className="px-3 text-sm border rounded-lg h-9 border-sky-100"
            />
          </label>
          <button
            type="button"
            disabled={actLoading || !hasRequisites}
            onClick={handleGenerateAct}
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-sky-600 px-4 text-sm font-semibold text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {actLoading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Генерация...
              </>
            ) : (
              'Скачать DOCX'
            )}
          </button>
        </div>
        {actError ? (
          <div className="text-xs text-red-600">{actError}</div>
        ) : null}
      </div>
    </div>
  )
}
