'use client'

import { useEffect, useId, useRef, useState } from 'react'
import Modal from '@components/Modal'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import { apiJson } from '@helpers/apiClient'
import { partyFetch } from '@helpers/partyImpersonationClient'

const endpoint = '/api/party/contract-templates'
const maxFileSize = 3 * 1024 * 1024
const nameLimit = 120
const byName = new Intl.Collator('ru', { sensitivity: 'base', numeric: true })
const button = 'min-h-11 cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-60'
const primary = `${button} bg-sky-700 text-white hover:bg-sky-800`
const secondary = `${button} border border-sky-200 bg-white text-sky-800 hover:bg-sky-50`
const subtle = `${button} text-sky-800 hover:bg-sky-50`
const danger = `${button} text-red-700 hover:bg-red-50`
const input = 'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus-visible:outline-2 focus-visible:outline-sky-700'
const templateUrl = (id) => `${endpoint}/${encodeURIComponent(id)}`

export const readCompanyDocxFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? '').split(',')[1] || '')
    reader.onerror = () => reject(new Error('Ошибка чтения файла'))
    reader.onabort = () => reject(new Error('Чтение файла отменено'))
    reader.readAsDataURL(file)
  })

function ContractTemplateEditor({ companyId, editor, onSave, onClose }) {
  const formId = useId()
  const nameRef = useRef(null)
  const fileRef = useRef(null)
  const pending = useRef(false)
  const isEdit = editor.type === 'edit'
  const isCopy = editor.type === 'copy'
  const source = editor.template
  const initialName = source?.name?.slice(0, nameLimit) || ''
  const [name, setName] = useState(initialName)
  const [file, setFile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fileError, setFileError] = useState('')
  const dirty = name !== initialName || Boolean(file)
  usePartyUnsavedChanges(dirty, { label: 'шаблон договора', scope: companyId, pending: saving })

  const close = () => {
    if (!pending.current) onClose()
  }

  const submit = async (event) => {
    event.preventDefault()
    if (pending.current) return
    if (!name.trim()) {
      setError('Введите название шаблона.')
      nameRef.current?.focus()
      return
    }
    if (fileError || (!source && !file)) {
      if (!fileError) setFileError('Выберите файл DOCX для нового шаблона.')
      fileRef.current?.focus()
      return
    }
    pending.current = true
    setSaving(true)
    setError('')
    try {
      const payload = { name: name.trim() }
      if (isCopy) {
        Object.assign(payload, source.id === 'legacy' ? { copyFrom: source.id } : { builtInId: source.id })
      } else if (file) {
        payload.fileName = file.name
        payload.templateBase64 = await readCompanyDocxFile(file)
      }
      await onSave(isEdit ? source.id : null, payload)
    } catch (cause) {
      setError(cause.message || 'Не удалось сохранить шаблон. Повторите попытку.')
    } finally {
      pending.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={close}
      title={isEdit ? 'Редактирование шаблона' : isCopy ? 'Копия шаблона' : 'Новый шаблон договора'}
      tone="party"
      initialFocusRef={nameRef}
      disableBackdropClick={saving}
      hasUnsavedChanges={dirty && !saving}
      footer={<button type="submit" form={formId} className={primary} disabled={saving}>{saving ? 'Сохраняем…' : 'Сохранить шаблон'}</button>}
    >
      <form id={formId} onSubmit={submit} className="grid gap-4 text-sm">
        {isCopy && <p className="wrap-anywhere text-slate-600">Исходный шаблон «{source.name}»</p>}
        <label className="grid gap-1.5 font-medium text-slate-700">
          Название шаблона
          <input
            ref={nameRef}
            className={input}
            value={name}
            maxLength={nameLimit}
            placeholder="Например, договор на праздник с выездом"
            disabled={saving}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {!isCopy && (
          <div className="grid gap-2">
            <label className="grid gap-1.5 font-medium text-slate-700">
              {isEdit ? 'Заменить DOCX-файл' : 'DOCX-файл'}
              <input
                ref={fileRef}
                type="file"
                accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className={`${input} cursor-pointer file:mr-2 file:cursor-pointer file:font-semibold file:text-sky-800`}
                aria-describedby={`${formId}-file-help${fileError ? ` ${formId}-file-error` : ''}`}
                aria-invalid={Boolean(fileError)}
                disabled={saving}
                onChange={(event) => {
                  const selected = event.target.files?.[0]
                  if (selected && (!/\.docx$/i.test(selected.name) || !selected.size || selected.size > maxFileSize)) {
                    setFileError('Выберите файл DOCX размером до 3 МБ.')
                    setFile(null)
                    event.target.value = ''
                    return
                  }
                  setFileError('')
                  setFile(selected || null)
                }}
              />
            </label>
            <p id={`${formId}-file-help`} className="wrap-anywhere text-slate-600">
              {isEdit && source.fileName ? `Текущий файл «${source.fileName}». ` : ''}
              Размер файла до 3 МБ. Данные заказа подставляются в переменные, например {'{НОМЕР_ДОКУМЕНТА}'} и {'{НАИМЕНОВАНИЕ_КЛИЕНТА}'}.
            </p>
            {fileError && <div id={`${formId}-file-error`} role="alert" className="flex flex-wrap items-center gap-2 text-red-800">
              {fileError}
              {isEdit && <button type="button" className={subtle} onClick={() => { setFileError(''); fileRef.current?.focus() }}>Оставить текущий файл</button>}
            </div>}
          </div>
        )}
        {error && <p role="alert" className="wrap-anywhere text-red-800">{error}</p>}
      </form>
    </Modal>
  )
}

export default function CompanyContractTemplates({ companyId }) {
  const [library, setLibrary] = useState(null)
  const [retry, setRetry] = useState(0)
  const [view, setView] = useState('saved')
  const [search, setSearch] = useState('')
  const [editor, setEditor] = useState(null)
  const [toDelete, setToDelete] = useState(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const busyRef = useRef(false)
  const cancelDeleteRef = useRef(null)
  const savedViewRef = useRef(null)
  const headers = { 'x-partycrm-company-id': companyId }

  usePartyUnsavedChanges(false, { label: 'шаблоны договоров', scope: companyId, pending: Boolean(busy) })

  useEffect(() => {
    const controller = new AbortController()
    apiJson(endpoint, {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    }).then(({ data }) => {
      if (!controller.signal.aborted) setLibrary(data)
    }).catch((cause) => {
      if (!controller.signal.aborted) setError(cause.message || 'Не удалось загрузить шаблоны.')
    })
    return () => controller.abort()
  }, [companyId, retry])

  const run = async (action, work, message) => {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(action)
    setError('')
    setNotice('')
    try {
      await work()
      if (message) setNotice(message)
    } catch (cause) {
      setError(cause.message || 'Не удалось выполнить действие. Повторите попытку.')
    } finally {
      busyRef.current = false
      setBusy('')
    }
  }

  const saveTemplate = async (id, payload) => {
    const { data } = await apiJson(id ? templateUrl(id) : endpoint, {
      method: id ? 'PATCH' : 'POST', headers, body: JSON.stringify(payload),
    })
    setLibrary((current) => ({
      ...current,
      templates: [...current.templates.filter((entry) => entry.id !== data.id), data],
    }))
    setEditor(null)
    setView('saved')
    setSearch('')
    setError('')
    setNotice('Шаблон сохранён. Его можно выбрать в заказе.')
    if (view === 'examples') requestAnimationFrame(() => savedViewRef.current?.focus())
  }

  const selectDefault = (defaultTemplateId) => run('default', async () => {
    const { data } = await apiJson(endpoint, {
      method: 'PATCH', headers, body: JSON.stringify({ defaultTemplateId }),
    })
    setLibrary((current) => ({ ...current, defaultTemplateId: data.defaultTemplateId }))
  }, 'Шаблон по умолчанию обновлён.')

  const remove = () => run('delete', async () => {
    const { data } = await apiJson(templateUrl(toDelete.id), { method: 'DELETE', headers })
    setLibrary((current) => ({
      ...current,
      defaultTemplateId: current.defaultTemplateId === data.id ? null : current.defaultTemplateId,
      templates: current.templates.filter((entry) => entry.id !== data.id),
    }))
    setToDelete(null)
    requestAnimationFrame(() => savedViewRef.current?.focus())
  }, 'Шаблон удалён.')

  const download = (template) => run(`download-${template.id}`, async () => {
    const response = await partyFetch(`${templateUrl(template.id)}?download=1`, { headers, cache: 'no-store' })
    if (!response.ok) {
      const errorResponse = await response.json().catch(() => null)
      throw new Error(errorResponse?.error?.message || 'Не удалось скачать шаблон.')
    }
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = template.fileName || 'Шаблон договора.docx'
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  })

  const openEditor = (next) => {
    setError('')
    setNotice('')
    setEditor(next)
  }

  const saved = [...(library?.templates || [])].sort((first, second) => byName.compare(first.name, second.name))
  const builtIns = library?.builtIns || []
  const legacy = library?.legacyTemplate
  const automaticTemplate = legacy || builtIns.find(({ id }) => id === 'standard')
  const effectiveId = library?.defaultTemplateId || automaticTemplate?.id
  const ownTemplates = legacy ? [legacy, ...saved] : saved
  const keyword = search.trim().toLocaleLowerCase('ru')
  const visible = view === 'saved'
    ? ownTemplates.filter(({ name, fileName }) => `${name} ${fileName || ''}`.toLocaleLowerCase('ru').includes(keyword))
    : builtIns

  return (
    <section className="min-w-0 rounded-2xl border border-sky-100 bg-white p-4 sm:p-5" aria-labelledby="contract-templates-heading">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="contract-templates-heading" className="font-semibold text-slate-900">Шаблоны договоров</h2>
          <p className="mt-1 max-w-prose text-sm leading-6 text-slate-600">Выберите готовый образец или сохраните свои DOCX-файлы для договоров из заказов.</p>
        </div>
        <button type="button" className={primary} disabled={!library || Boolean(busy)} aria-haspopup="dialog" onClick={() => openEditor({ type: 'upload' })}>
          Загрузить DOCX
        </button>
      </div>
      {error && !toDelete && <p className="mt-3 wrap-anywhere text-sm text-red-800" role="alert">{error}</p>}
      {notice && <p className="mt-3 text-sm text-emerald-800" role="status">{notice}</p>}
      {!library ? error ? (
        <button type="button" className={`${secondary} mt-3`} onClick={() => { setError(''); setRetry((value) => value + 1) }}>Повторить загрузку</button>
      ) : (
        <p className="mt-4 text-sm text-slate-600" role="status">Загружаем шаблоны…</p>
      ) : (
        <>
          <label className="mt-5 grid max-w-xl gap-1.5 text-sm font-semibold text-slate-700">
            Шаблон по умолчанию
            <select className={`${input} cursor-pointer font-normal`} value={library.defaultTemplateId || ''} disabled={Boolean(busy)} onChange={(event) => selectDefault(event.target.value || null)}>
              <option value="">Автоматически{automaticTemplate ? ` · ${automaticTemplate.name}` : ''}</option>
              {ownTemplates.length > 0 && <optgroup label="Мои шаблоны">{ownTemplates.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</optgroup>}
              <optgroup label="Готовые образцы">{builtIns.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</optgroup>
            </select>
          </label>
          <div className="mt-5 flex flex-wrap items-end justify-between gap-3 border-b border-slate-200 pb-3">
            <div className="flex flex-wrap gap-2" aria-label="Каталог договоров">
              <button ref={savedViewRef} type="button" className={view === 'saved' ? secondary : subtle} aria-pressed={view === 'saved'} onClick={() => setView('saved')}>Мои шаблоны</button>
              <button type="button" className={view === 'examples' ? secondary : subtle} aria-pressed={view === 'examples'} onClick={() => setView('examples')}>Готовые образцы</button>
            </div>
            {view === 'saved' && ownTemplates.length > 0 && <input type="search" aria-label="Поиск шаблонов" placeholder="Поиск шаблонов" className={`${input} sm:max-w-56`} value={search} onChange={(event) => setSearch(event.target.value)} />}
          </div>
          <ul className="divide-y divide-slate-200">
            {visible.map((template) => {
              const isSaved = view === 'saved' && template.id !== 'legacy'
              return (
                <li key={template.id} className="grid min-w-0 items-center gap-1 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:gap-4">
                  <div className="grid min-w-0 gap-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="min-w-0 wrap-anywhere text-sm font-semibold text-slate-900">{template.name}</h3>
                      {template.id === effectiveId && <span className="rounded bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">По умолчанию</span>}
                    </div>
                    <p className="wrap-anywhere text-sm text-slate-600">{template.description || template.fileName}</p>
                  </div>
                  <div className="flex flex-wrap items-center sm:justify-end">
                    {!isSaved && <button type="button" className={subtle} aria-label={`Сохранить копию: ${template.name}`} aria-haspopup="dialog" disabled={Boolean(busy)} onClick={() => openEditor({ type: 'copy', template })}>Сохранить копию</button>}
                    <button type="button" className={subtle} aria-label={`Скачать DOCX: ${template.name}`} disabled={Boolean(busy)} onClick={() => download(template)}>{busy === `download-${template.id}` ? 'Скачиваем…' : 'Скачать'}</button>
                    {isSaved && <>
                      <button type="button" className={subtle} aria-label={`Изменить: ${template.name}`} aria-haspopup="dialog" disabled={Boolean(busy)} onClick={() => openEditor({ type: 'edit', template })}>Изменить</button>
                      <button type="button" className={danger} aria-label={`Удалить: ${template.name}`} aria-haspopup="dialog" disabled={Boolean(busy)} onClick={() => { setError(''); setNotice(''); setToDelete(template) }}>Удалить</button>
                    </>}
                  </div>
                </li>
              )
            })}
          </ul>
          {visible.length === 0 && <p className="py-4 text-sm text-slate-600">{view === 'examples' ? 'Готовых образцов пока нет.' : keyword ? 'По этому запросу шаблоны не найдены.' : 'Сохранённых шаблонов пока нет. Загрузите DOCX или сохраните копию готового образца.'}</p>}
        </>
      )}
      {editor && <ContractTemplateEditor companyId={companyId} editor={editor} onSave={saveTemplate} onClose={() => setEditor(null)} />}
      {toDelete && (
        <Modal
          open
          title="Удалить шаблон договора?"
          tone="party"
          initialFocusRef={cancelDeleteRef}
          disableBackdropClick={busy === 'delete'}
          onClose={() => { if (!busyRef.current) { setToDelete(null); setError('') } }}
          footer={<>
            <button ref={cancelDeleteRef} type="button" className={secondary} disabled={busy === 'delete'} onClick={() => { setToDelete(null); setError('') }}>Отмена</button>
            <button type="button" className={`${button} bg-red-700 text-white hover:bg-red-800`} disabled={busy === 'delete'} onClick={remove}>{busy === 'delete' ? 'Удаляем…' : 'Удалить шаблон'}</button>
          </>}
        >
          <p className="wrap-anywhere text-sm leading-6 text-slate-700">
            «{toDelete.name}» больше нельзя будет выбрать в новом договоре.
            {toDelete.id === effectiveId ? ' Шаблон по умолчанию будет выбран автоматически.' : ''}
          </p>
          {error && <p role="alert" className="mt-3 wrap-anywhere text-sm text-red-800">{error}</p>}
        </Modal>
      )}
    </section>
  )
}
