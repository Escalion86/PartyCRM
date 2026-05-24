'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useAtom, useAtomValue } from 'jotai'
import LabeledContainer from '@components/LabeledContainer'
import ReactMarkdown from 'react-markdown'
import siteSettingsAtom from '@state/atoms/siteSettingsAtom'
import tariffsAtom from '@state/atoms/tariffsAtom'
import loggedUserAtom from '@state/atoms/loggedUserAtom'
import { modalsFuncAtom } from '@state/atoms'
import { postData } from '@helpers/CRUD'
import { getUserTariffAccess } from '@helpers/tariffAccess'

const DEFAULT_CONTRACT_TEMPLATE_DOWNLOAD_URL =
  '/templates/default-contract-template.docx'
const DEFAULT_ACT_TEMPLATE_DOWNLOAD_URL = '/templates/default-act-template.docx'

const DocxDocumentsGuide = () => {
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const response = await fetch('/api/public/docs/docx-documents')
        if (!response.ok) throw new Error(String(response.status))
        const text = await response.text()
        if (!active) return
        setContent(text)
      } catch (loadError) {
        if (!active) return
        setError('Не удалось загрузить инструкцию DOCX')
      } finally {
        if (active) setLoading(false)
      }
    }

    load()
    return () => {
      active = false
    }
  }, [])

  if (loading) return <div className="text-sm text-gray-600">Загрузка...</div>
  if (error) return <div className="text-sm text-red-600">{error}</div>

  return (
    <div className="max-h-[65dvh] overflow-auto text-sm leading-6 text-gray-800">
      <ReactMarkdown
        components={{
          h1: ({ ...props }) => (
            <h1
              className="mb-3 text-xl font-semibold text-gray-900"
              {...props}
            />
          ),
          h2: ({ ...props }) => (
            <h2
              className="mt-4 mb-2 text-lg font-semibold text-gray-900"
              {...props}
            />
          ),
          h3: ({ ...props }) => (
            <h3
              className="mt-3 mb-2 text-base font-semibold text-gray-900"
              {...props}
            />
          ),
          p: ({ ...props }) => <p className="mb-2" {...props} />,
          ul: ({ ...props }) => (
            <ul className="pl-5 mb-2 list-disc" {...props} />
          ),
          ol: ({ ...props }) => (
            <ol className="pl-5 mb-2 list-decimal" {...props} />
          ),
          li: ({ ...props }) => <li className="mb-1" {...props} />,
          code: ({ className, children, ...props }) =>
            className ? (
              <code
                className={`block overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100 ${className}`}
                {...props}
              >
                {children}
              </code>
            ) : (
              <code
                className="rounded bg-gray-100 px-1 py-0.5 text-xs text-gray-900"
                {...props}
              >
                {children}
              </code>
            ),
          pre: ({ ...props }) => <pre className="mb-3" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

const DocumentsContent = () => {
  const [siteSettings, setSiteSettings] = useAtom(siteSettingsAtom)
  const tariffs = useAtomValue(tariffsAtom)
  const loggedUser = useAtomValue(loggedUserAtom)
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const contractTemplateInputRef = useRef(null)
  const actTemplateInputRef = useRef(null)

  const customSettings = siteSettings?.custom ?? {}
  const tariffAccess = useMemo(
    () => getUserTariffAccess(loggedUser, tariffs),
    [loggedUser, tariffs]
  )
  const canUseDocuments = Boolean(tariffAccess?.allowDocuments)

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

  const saveDocxTemplate = async (type, file) => {
    if (!file) return
    if (
      file.type !==
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ) {
      return
    }
    const base64 = await readFileAsBase64(file)
    const prevCustom = siteSettings?.custom ?? {}
    const nextCustom = {
      ...prevCustom,
    }
    if (type === 'contract') {
      nextCustom.contractDocxTemplateBase64 = base64
      nextCustom.contractDocxTemplateFileName = file.name
    } else {
      nextCustom.actDocxTemplateBase64 = base64
      nextCustom.actDocxTemplateFileName = file.name
    }

    await postData(
      '/api/site',
      { custom: nextCustom },
      (data) => setSiteSettings(data),
      null,
      false,
      null
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {!canUseDocuments ? (
          <div className="p-3 text-sm border rounded border-amber-200 bg-amber-50 text-amber-800">
            Работа с документами недоступна на текущем тарифе.
          </div>
        ) : (
          <LabeledContainer label="Работа с документами" noMargin>
            <div className="flex flex-col w-full gap-3">
              <div className="flex flex-wrap items-center justify-end w-full gap-2">
                <button
                  type="button"
                  className="action-icon-button action-icon-button--warning tablet:w-auto tablet:min-w-[168px] flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold"
                  onClick={() =>
                    modalsFunc.settings?.artistRequisitesEditor?.()
                  }
                >
                  Редактировать реквизиты
                </button>
                <button
                  type="button"
                  className="action-icon-button action-icon-button--warning tablet:w-auto tablet:min-w-[168px] flex h-10 w-full cursor-pointer items-center justify-center rounded px-3 text-sm font-semibold"
                  onClick={() =>
                    modalsFunc.add({
                      title: 'Инструкция DOCX',
                      showDecline: true,
                      declineButtonName: 'Закрыть',
                      Children: DocxDocumentsGuide,
                    })
                  }
                >
                  Открыть инструкцию DOCX
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 tablet:grid-cols-2">
                <div className="p-3 border border-gray-200 rounded">
                  <div className="text-sm font-semibold text-gray-800">
                    DOCX-шаблон договора
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Текущий:{' '}
                    {customSettings?.contractDocxTemplateFileName ||
                      'не загружен'}
                  </div>
                  <input
                    ref={contractTemplateInputRef}
                    type="file"
                    accept=".docx"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0]
                      await saveDocxTemplate('contract', file)
                      event.target.value = ''
                    }}
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      type="button"
                      className="action-icon-button action-icon-button--warning tablet:w-auto tablet:min-w-[168px] flex h-9 w-full cursor-pointer items-center justify-center rounded px-3 text-xs font-semibold"
                      onClick={() => contractTemplateInputRef.current?.click()}
                    >
                      Загрузить .docx
                    </button>
                    <a
                      href={DEFAULT_CONTRACT_TEMPLATE_DOWNLOAD_URL}
                      download
                      className="action-icon-button action-icon-button--warning tablet:w-auto tablet:min-w-[168px] inline-flex h-9 w-full cursor-pointer items-center justify-center rounded px-3 text-xs font-semibold"
                    >
                      Скачать стандартный шаблон
                    </a>
                  </div>
                </div>
                <div className="p-3 border border-gray-200 rounded">
                  <div className="text-sm font-semibold text-gray-800">
                    DOCX-шаблон акта
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    Текущий:{' '}
                    {customSettings?.actDocxTemplateFileName || 'не загружен'}
                  </div>
                  <input
                    ref={actTemplateInputRef}
                    type="file"
                    accept=".docx"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0]
                      await saveDocxTemplate('act', file)
                      event.target.value = ''
                    }}
                  />
                  <div className="flex flex-wrap gap-2 mt-2">
                    <button
                      type="button"
                      className="action-icon-button action-icon-button--warning tablet:w-auto tablet:min-w-[168px] flex h-9 w-full cursor-pointer items-center justify-center rounded px-3 text-xs font-semibold"
                      onClick={() => actTemplateInputRef.current?.click()}
                    >
                      Загрузить .docx
                    </button>
                    <a
                      href={DEFAULT_ACT_TEMPLATE_DOWNLOAD_URL}
                      download
                      className="action-icon-button action-icon-button--warning tablet:w-auto tablet:min-w-[168px] inline-flex h-9 w-full cursor-pointer items-center justify-center rounded px-3 text-xs font-semibold"
                    >
                      Скачать стандартный шаблон
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </LabeledContainer>
        )}
      </div>
    </div>
  )
}

export default DocumentsContent
