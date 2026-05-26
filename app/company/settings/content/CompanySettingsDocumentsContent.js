'use client'

import useCompanySettings from '../useCompanySettings'

const DEFAULT_CONTRACT_TEMPLATE_DOWNLOAD_URL =
  '/templates/default-contract-template.docx'
const DEFAULT_ACT_TEMPLATE_DOWNLOAD_URL = '/templates/default-act-template.docx'

const readFileAsBase64 = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = String(reader.result ?? '')
      const [, payload = ''] = result.split(',')
      resolve(payload || '')
    }
    reader.onerror = () => reject(new Error('Ошибка чтения файла'))
    reader.readAsDataURL(file)
  })

export default function CompanySettingsDocumentsContent({ activeCompanyId }) {
  const { settings, loading, saving, error, savePatch } =
    useCompanySettings(activeCompanyId)

  const documents = settings?.documents ?? {}

  const saveDocxTemplate = async (type, file) => {
    if (!file) return
    if (
      file.type !==
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return
    }

    const base64 = await readFileAsBase64(file)
    const nextDocuments = { ...documents }

    if (type === 'contract') {
      nextDocuments.contractDocxTemplateBase64 = base64
      nextDocuments.contractDocxTemplateFileName = file.name
    } else {
      nextDocuments.actDocxTemplateBase64 = base64
      nextDocuments.actDocxTemplateFileName = file.name
    }

    await savePatch({ documents: nextDocuments })
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-sky-100 bg-sky-50 p-6 text-sm text-slate-500">
        Загружаем настройки документов...
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

      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="text-base font-semibold">DOCX-шаблоны компании</div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Шаблоны сохраняются на уровне компании в `companySettings.documents`.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="rounded-2xl border border-sky-100 bg-white p-5">
          <div className="text-sm font-semibold">DOCX-шаблон договора</div>
          <div className="mt-1 text-xs text-slate-500">
            Текущий:{' '}
            {documents.contractDocxTemplateFileName || 'не загружен'}
          </div>
          <input
            type="file"
            accept=".docx"
            className="mt-4 block text-sm"
            onChange={async (event) => {
              await saveDocxTemplate('contract', event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <a
            href={DEFAULT_CONTRACT_TEMPLATE_DOWNLOAD_URL}
            download
            className="mt-4 inline-flex text-sm font-semibold text-sky-700 underline"
          >
            Скачать стандартный шаблон договора
          </a>
        </label>

        <label className="rounded-2xl border border-sky-100 bg-white p-5">
          <div className="text-sm font-semibold">DOCX-шаблон акта</div>
          <div className="mt-1 text-xs text-slate-500">
            Текущий: {documents.actDocxTemplateFileName || 'не загружен'}
          </div>
          <input
            type="file"
            accept=".docx"
            className="mt-4 block text-sm"
            onChange={async (event) => {
              await saveDocxTemplate('act', event.target.files?.[0])
              event.target.value = ''
            }}
          />
          <a
            href={DEFAULT_ACT_TEMPLATE_DOWNLOAD_URL}
            download
            className="mt-4 inline-flex text-sm font-semibold text-sky-700 underline"
          >
            Скачать стандартный шаблон акта
          </a>
        </label>
      </div>

      {saving ? (
        <p className="text-xs text-slate-500">Сохраняем изменения...</p>
      ) : null}
    </div>
  )
}
