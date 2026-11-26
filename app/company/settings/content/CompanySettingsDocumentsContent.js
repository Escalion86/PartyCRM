'use client'

import { useEffect, useRef, useState } from 'react'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import useCompanySettings from '../useCompanySettings'

const PROVIDER_REQUISITE_FIELDS = [
  {
    key: 'providerFullName',
    label: 'ФИО или полное название поставщика',
    placeholder: 'Иванов Иван Иванович',
  },
  {
    key: 'providerDisplayName',
    label: 'Краткое название для документов',
    placeholder: 'ИП Иванов И.И.',
  },
  {
    key: 'providerInn',
    label: 'ИНН',
    placeholder: '123456789012',
  },
  {
    key: 'providerOgrnip',
    label: 'ОГРНИП',
    placeholder: '123456789012345',
  },
  {
    key: 'providerBankName',
    label: 'Банк',
    placeholder: 'ПАО Сбербанк',
  },
  {
    key: 'providerBik',
    label: 'БИК',
    placeholder: '123456789',
  },
  {
    key: 'providerCheckingAccount',
    label: 'Расчетный счет',
    placeholder: '12345678901234567890',
  },
  {
    key: 'providerCorrespondentAccount',
    label: 'Корр. счет',
    placeholder: '12345678901234567890',
  },
  {
    key: 'providerLegalAddress',
    label: 'Юридический адрес',
    placeholder: 'г. Красноярск, ул. ...',
  },
  {
    key: 'defaultTown',
    label: 'Город по умолчанию',
    placeholder: 'Красноярск',
  },
]

const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const [, payload = ''] = result.split(',')
      resolve(payload || '')
    }
    reader.onerror = () => reject(new Error('Ошибка чтения файла'))
    reader.onabort = () => reject(new Error('Чтение файла отменено'))
    reader.readAsDataURL(file)
  })

const getRequisiteValue = (requisites, key) =>
  requisites[key] || (key === 'providerStatus' ? 'individual_entrepreneur' : '')

const getProposalValue = (documents, key) =>
  key === 'proposalValidityDays' ? String(documents[key] || 14) : documents[key] || ''

const clearSavedDraft = (setDrafts, key, value) =>
  setDrafts((previous) => {
    if (previous[key] !== value) return previous
    const next = { ...previous }
    delete next[key]
    return next
  })

function DocxTemplateFileButton({ documentName, disabled, onFileSelected }) {
  const inputRef = useRef(null)

  return (
    <>
      <button
        type="button"
        aria-label={`Выбрать файл ${documentName}`}
        disabled={disabled}
        className="mt-4 min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={() => inputRef.current?.click()}
      >
        Выбрать файл
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".docx"
        hidden
        disabled={disabled}
        onChange={async (event) => {
          const input = event.currentTarget
          try {
            await onFileSelected(input.files?.[0])
          } finally {
            input.value = ''
          }
        }}
      />
    </>
  )
}

export default function CompanySettingsDocumentsContent({ activeCompanyId }) {
  const { settings, access, loading, saving, error, savePatch } =
    useCompanySettings(activeCompanyId)
  const [readingTemplate, setReadingTemplate] = useState(false)
  const [fileError, setFileError] = useState('')
  const [proposalDrafts, setProposalDrafts] = useState({})
  const [requisiteDrafts, setRequisiteDrafts] = useState({})
  const [pendingDocumentSaves, setPendingDocumentSaves] = useState(0)
  const focusedRequisite = useRef(null)
  const documentSaves = useRef(null)

  const documents = settings?.documents ?? {}
  const requisites = documents.requisites ?? {}
  const proposalValues = {
    proposalValidityDays: String(documents.proposalValidityDays || 14),
    proposalTaxText: documents.proposalTaxText || '',
    proposalPaymentTerms: documents.proposalPaymentTerms || '',
    proposalIncludedText: documents.proposalIncludedText || '',
  }
  const hasDrafts = Object.entries(requisiteDrafts).some(([key, value]) => value !== getRequisiteValue(requisites, key)) ||
    Object.entries(proposalDrafts).some(([key, value]) => value !== proposalValues[key])
  usePartyUnsavedChanges(hasDrafts, {
    label: 'настройки документов', scope: activeCompanyId, pending: readingTemplate || pendingDocumentSaves > 0,
  })
  useEffect(() => {
    documentSaves.current = { tail: Promise.resolve(), latest: null }
    focusedRequisite.current = null
    setPendingDocumentSaves(0)
    setReadingTemplate(false)
    setRequisiteDrafts({})
    setProposalDrafts({})
    setFileError('')
    return () => { documentSaves.current = null }
  }, [activeCompanyId])

  const saveDocuments = (getPatch) => {
    const queue = documentSaves.current
    if (!queue) return Promise.resolve(false)
    const next = queue.tail.then(async () => {
      if (documentSaves.current !== queue) return false
      const current = queue.latest ?? documents
      const patch = getPatch(current)
      if (patch) {
        const result = await savePatch({ documents: patch })
        queue.latest = result?.settings?.documents ?? { ...current, ...patch }
      }
      return documentSaves.current === queue
    })
    queue.tail = next.catch(() => {})
    setPendingDocumentSaves((count) => count + 1)
    return next.finally(() => {
      if (documentSaves.current === queue) setPendingDocumentSaves((count) => count - 1)
    })
  }

  const changeProposalField = (key, value) => setProposalDrafts((previous) => ({ ...previous, [key]: value }))
  const saveProposalField = async (key, input) => {
    const value = key === 'proposalValidityDays' ? String(Math.min(365, Math.max(1, Number(input) || 14))) : input
    changeProposalField(key, value)
    try {
      const saved = await saveDocuments((current) => {
        if (value === getProposalValue(current, key)) return null
        return { [key]: key === 'proposalValidityDays' ? Number(value) : value }
      })
      if (saved) clearSavedDraft(setProposalDrafts, key, value)
    } catch {} // The settings hook displays the error; keep the draft for retry.
  }

  const changeRequisite = (key, value) => setRequisiteDrafts((previous) => ({ ...previous, [key]: value }))
  const saveRequisite = async (key, value) => {
    changeRequisite(key, value)
    try {
      const saved = await saveDocuments((current) => {
        const currentRequisites = current.requisites ?? {}
        const normalized = value.trim()
        if (normalized === getRequisiteValue(currentRequisites, key)) return null
        return { requisites: { ...currentRequisites, [key]: normalized } }
      })
      if (saved && focusedRequisite.current !== key) clearSavedDraft(setRequisiteDrafts, key, value)
    } catch {} // The settings hook displays the error; keep the draft for retry.
  }

  const saveDocxTemplate = async (type, file) => {
    if (!file) return
    if (
      file.type !==
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      setFileError('Выберите файл шаблона в формате DOCX')
      return
    }

    const queue = documentSaves.current
    setReadingTemplate(true)
    setFileError('')
    try {
      const base64 = await readFileAsBase64(file)
      if (documentSaves.current !== queue) return
      await saveDocuments(() => ({
        [`${type}DocxTemplateBase64`]: base64,
        [`${type}DocxTemplateFileName`]: file.name,
      }))
    } catch (cause) {
      if (documentSaves.current === queue) setFileError(cause.message || 'Не удалось загрузить шаблон')
    } finally {
      if (documentSaves.current === queue) setReadingTemplate(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-6 text-sm text-slate-500">
        Загружаем настройки документов...
      </div>
    )
  }

  if (access && !access.allowDocuments) {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm leading-6 text-amber-900">
        Документы недоступны на текущем тарифе компании. Подключите тариф с
        опцией документов во вкладке `Тарифы`.
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      {error ? (
        <div className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
          {error}
        </div>
      ) : null}
      {fileError ? <div role="alert" className="rounded-md border border-danger/30 bg-danger/10 p-3 text-sm text-danger">{fileError}</div> : null}

      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="text-base font-semibold">Реквизиты компании</div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Сохраняются на уровне компании в `companySettings.documents.requisites`
          и используются при генерации договоров и актов.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Статус поставщика
            </span>
            <select
              value={requisiteDrafts.providerStatus ?? getRequisiteValue(requisites, 'providerStatus')}
              onChange={(event) =>
                saveRequisite('providerStatus', event.target.value)
              }
              className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
            >
              <option value="individual_entrepreneur">Индивидуальный предприниматель</option>
              <option value="self_employed">Самозанятый</option>
            </select>
          </label>
          {PROVIDER_REQUISITE_FIELDS.map((field) => (
            <label key={field.key} className="grid gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {field.label}
              </span>
              <input
                type="text"
                value={requisiteDrafts[field.key] ?? getRequisiteValue(requisites, field.key)}
                placeholder={field.placeholder}
                onFocus={() => { focusedRequisite.current = field.key }}
                onChange={(event) => changeRequisite(field.key, event.target.value)}
                onBlur={(event) => {
                  focusedRequisite.current = null
                  saveRequisite(field.key, event.target.value)
                }}
                className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="text-base font-semibold">DOCX-шаблоны компании</div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Шаблоны сохраняются на уровне компании в `companySettings.documents`.
          Если шаблон не загружен, система сформирует документ по встроенному
          PartyCRM-шаблону.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-sky-100 bg-white p-5">
          <div className="text-sm font-semibold">DOCX-шаблон договора</div>
          <div className="mt-1 text-xs text-slate-500">
            Текущий:{' '}
            {documents.contractDocxTemplateFileName || 'не загружен'}
          </div>
          <DocxTemplateFileButton
            documentName="договора"
            disabled={readingTemplate}
            onFileSelected={(file) => saveDocxTemplate('contract', file)}
          />
          <div className="mt-4 text-xs leading-5 text-slate-500">
            Без пользовательского файла используется встроенный шаблон договора.
          </div>
        </div>

        <div className="rounded-2xl border border-sky-100 bg-white p-5">
          <div className="text-sm font-semibold">DOCX-шаблон акта</div>
          <div className="mt-1 text-xs text-slate-500">
            Текущий: {documents.actDocxTemplateFileName || 'не загружен'}
          </div>
          <DocxTemplateFileButton
            documentName="акта"
            disabled={readingTemplate}
            onFileSelected={(file) => saveDocxTemplate('act', file)}
          />
          <div className="mt-4 text-xs leading-5 text-slate-500">
            Без пользовательского файла используется встроенный шаблон акта.
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="text-base font-semibold">Коммерческие предложения</div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Эти значения подставляются в новые КП. В конкретном предложении их
          можно изменить перед сохранением версии.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Срок действия, дней
            </span>
            <input
              type="number"
              min={1}
              max={365}
              value={proposalDrafts.proposalValidityDays ?? proposalValues.proposalValidityDays}
              onChange={(event) => changeProposalField('proposalValidityDays', event.target.value)}
              onBlur={(event) => saveProposalField('proposalValidityDays', event.target.value)}
              className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Налоговая формулировка
            </span>
            <input
              type="text"
              value={proposalDrafts.proposalTaxText ?? proposalValues.proposalTaxText}
              placeholder="НДС не облагается..."
              onChange={(event) => changeProposalField('proposalTaxText', event.target.value)}
              onBlur={(event) => saveProposalField('proposalTaxText', event.target.value)}
              className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Условия оплаты по умолчанию
            </span>
            <textarea
              rows={3}
              value={proposalDrafts.proposalPaymentTerms ?? proposalValues.proposalPaymentTerms}
              placeholder="Например: предоплата 50%, остаток в день мероприятия"
              onChange={(event) => changeProposalField('proposalPaymentTerms', event.target.value)}
              onBlur={(event) => saveProposalField('proposalPaymentTerms', event.target.value)}
              className="rounded-lg border border-sky-100 px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              В стоимость включено
            </span>
            <textarea
              rows={3}
              value={proposalDrafts.proposalIncludedText ?? proposalValues.proposalIncludedText}
              placeholder="Работа команды, оборудование, транспорт..."
              onChange={(event) => changeProposalField('proposalIncludedText', event.target.value)}
              onBlur={(event) => saveProposalField('proposalIncludedText', event.target.value)}
              className="rounded-lg border border-sky-100 px-3 py-2 text-sm"
            />
          </label>
        </div>
        <label className="mt-4 block rounded-2xl border border-sky-100 bg-sky-50/40 p-4">
          <div className="text-sm font-semibold">DOCX-шаблон КП</div>
          <div className="mt-1 text-xs text-slate-500">
            Текущий: {documents.proposalDocxTemplateFileName || 'не загружен'}
          </div>
          <input
            type="file"
            accept=".docx"
            disabled={readingTemplate}
            className="mt-4 block cursor-pointer text-sm"
            onChange={async (event) => {
              const input = event.target
              try { await saveDocxTemplate('proposal', input.files?.[0]) }
              finally { input.value = '' }
            }}
          />
          <div className="mt-3 text-xs leading-5 text-slate-500">
            Без файла PartyCRM использует встроенный официальный шаблон.
          </div>
        </label>
      </div>

      {saving || readingTemplate || pendingDocumentSaves > 0 ? (
        <p className="text-xs text-slate-500">Сохраняем изменения...</p>
      ) : null}
    </div>
  )
}
