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
  const { settings, access, loading, saving, error, savePatch } =
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

      <div className="rounded-2xl border border-sky-100 bg-white p-5">
        <div className="text-base font-semibold">Реквизиты компании</div>
        <p className="mt-2 text-sm leading-6 text-slate-500">
          Сохраняются на уровне компании в `companySettings.documents.requisites`
          и используются при генерации договоров и актов.
        </p>
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Статус артиста
            </span>
            <select
              value={documents.requisites?.artistStatus || 'individual_entrepreneur'}
              onChange={(event) =>
                savePatch({
                  documents: {
                    ...documents,
                    requisites: {
                      ...(documents.requisites || {}),
                      artistStatus: event.target.value,
                    },
                  },
                })
              }
              className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
            >
              <option value="individual_entrepreneur">Индивидуальный предприниматель</option>
              <option value="self_employed">Самозанятый</option>
            </select>
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              ФИО артиста (для документов)
            </span>
            <input
              type="text"
              value={documents.requisites?.artistFullName || ''}
              placeholder="Иванов Иван Иванович"
              onChange={(event) =>
                savePatch({
                  documents: {
                    ...documents,
                    requisites: {
                      ...(documents.requisites || {}),
                      artistFullName: event.target.value,
                    },
                  },
                })
              }
              className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Название артиста (для документов)
            </span>
            <input
              type="text"
              value={documents.requisites?.artistName || ''}
              placeholder="Иванов И.И."
              onChange={(event) =>
                savePatch({
                  documents: {
                    ...documents,
                    requisites: {
                      ...(documents.requisites || {}),
                      artistName: event.target.value,
                    },
                  },
                })
              }
              className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              ИНН
            </span>
            <input
              type="text"
              value={documents.requisites?.artistInn || ''}
              placeholder="123456789012"
              onChange={(event) =>
                savePatch({
                  documents: {
                    ...documents,
                    requisites: {
                      ...(documents.requisites || {}),
                      artistInn: event.target.value,
                    },
                  },
                })
              }
              className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              ОГРНИП
            </span>
            <input
              type="text"
              value={documents.requisites?.artistOgrnip || ''}
              placeholder="123456789012345"
              onChange={(event) =>
                savePatch({
                  documents: {
                    ...documents,
                    requisites: {
                      ...(documents.requisites || {}),
                      artistOgrnip: event.target.value,
                    },
                  },
                })
              }
              className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Банк
            </span>
            <input
              type="text"
              value={documents.requisites?.artistBankName || ''}
              placeholder="ПАО Сбербанк"
              onChange={(event) =>
                savePatch({
                  documents: {
                    ...documents,
                    requisites: {
                      ...(documents.requisites || {}),
                      artistBankName: event.target.value,
                    },
                  },
                })
              }
              className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              БИК
            </span>
            <input
              type="text"
              value={documents.requisites?.artistBik || ''}
              placeholder="123456789"
              onChange={(event) =>
                savePatch({
                  documents: {
                    ...documents,
                    requisites: {
                      ...(documents.requisites || {}),
                      artistBik: event.target.value,
                    },
                  },
                })
              }
              className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Расчётный счёт
            </span>
            <input
              type="text"
              value={documents.requisites?.artistCheckingAccount || ''}
              placeholder="12345678901234567890"
              onChange={(event) =>
                savePatch({
                  documents: {
                    ...documents,
                    requisites: {
                      ...(documents.requisites || {}),
                      artistCheckingAccount: event.target.value,
                    },
                  },
                })
              }
              className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Корр. счёт
            </span>
            <input
              type="text"
              value={documents.requisites?.artistCorrespondentAccount || ''}
              placeholder="12345678901234567890"
              onChange={(event) =>
                savePatch({
                  documents: {
                    ...documents,
                    requisites: {
                      ...(documents.requisites || {}),
                      artistCorrespondentAccount: event.target.value,
                    },
                  },
                })
              }
              className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Юридический адрес
            </span>
            <input
              type="text"
              value={documents.requisites?.artistLegalAddress || ''}
              placeholder="г. Красноярск, ул. ..."
              onChange={(event) =>
                savePatch({
                  documents: {
                    ...documents,
                    requisites: {
                      ...(documents.requisites || {}),
                      artistLegalAddress: event.target.value,
                    },
                  },
                })
              }
              className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
            />
          </label>
          <label className="grid gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Город по умолчанию
            </span>
            <input
              type="text"
              value={documents.requisites?.defaultTown || ''}
              placeholder="Красноярск"
              onChange={(event) =>
                savePatch({
                  documents: {
                    ...documents,
                    requisites: {
                      ...(documents.requisites || {}),
                      defaultTown: event.target.value,
                    },
                  },
                })
              }
              className="h-11 rounded-lg border border-sky-100 px-3 text-sm"
            />
          </label>
        </div>
      </div>

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
