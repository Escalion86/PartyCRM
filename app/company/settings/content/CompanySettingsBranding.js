'use client'

import { useState } from 'react'
import usePartyUnsavedChanges from '@components/party/navigation/usePartyUnsavedChanges'
import { apiJson } from '@helpers/apiClient'
import {
  getPartyCompanyLogoFileError,
  PARTY_COMPANY_LOGO_MIME_TYPES,
} from '@helpers/partyCompanyLogoUpload'
import {
  DEFAULT_PARTY_COMPANY_BRANDING,
  PARTY_COMPANY_PALETTES,
  getPartyCompanyPalette,
  normalizePartyCompanyBranding,
  normalizePartyCompanyLogoUrl,
  validatePartyCompanyBranding,
} from '@helpers/partyCompanyBranding'

export default function CompanySettingsBranding({
  companyId,
  companyTitle,
  branding,
  saving,
  savePatch,
}) {
  const [draft, setDraft] = useState(() => normalizePartyCompanyBranding(branding))
  const [previewUrl, setPreviewUrl] = useState(() => normalizePartyCompanyLogoUrl(branding?.logoUrl))
  const [failedPreview, setFailedPreview] = useState('')
  const [message, setMessage] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const current = normalizePartyCompanyBranding(branding)
  const paletteChanged = draft.palette !== current.palette
  const logoChanged = draft.logoUrl.trim() !== current.logoUrl
  const dirty = paletteChanged || logoChanged
  const busy = saving || uploading
  const validationError = validatePartyCompanyBranding(draft)
  const palette = getPartyCompanyPalette(draft)
  usePartyUnsavedChanges(dirty, {
    label: 'оформление компании',
    scope: companyId,
    pending: busy,
  })

  const change = (patch) => {
    setDraft((value) => ({ ...value, ...patch }))
    setMessage('')
  }
  const updateLogo = (logoUrl, preview = '') => {
    change({ logoUrl })
    setPreviewUrl(preview)
    setFailedPreview('')
    setUploadError('')
  }
  const upload = async (event) => {
    const input = event.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file || busy) return
    setMessage('')
    const error = getPartyCompanyLogoFileError(file)
    setUploadError(error)
    if (error) return

    setUploading(true)
    try {
      const body = new FormData()
      body.set('file', file)
      const result = await apiJson('/api/party/company-settings/logo', {
        method: 'POST',
        headers: { 'x-partycrm-company-id': companyId },
        body,
      })
      const logoUrl = normalizePartyCompanyLogoUrl(result?.data?.logoUrl)
      if (!logoUrl) throw new Error('Хранилище не вернуло ссылку на логотип.')
      updateLogo(logoUrl, logoUrl)
      setMessage('Логотип загружен. Сохраните оформление.')
    } catch (error) {
      setUploadError(error.status ? error.message : 'Не удалось загрузить логотип. Повторите попытку.')
    } finally {
      setUploading(false)
    }
  }
  const save = async (event) => {
    event.preventDefault()
    if (validationError || busy || !dirty) return
    try {
      const next = normalizePartyCompanyBranding(draft)
      const result = await savePatch({
        branding: {
          ...(paletteChanged ? { palette: next.palette } : {}),
          ...(logoChanged ? { logoUrl: next.logoUrl } : {}),
        },
      })
      const saved = normalizePartyCompanyBranding(result?.settings?.branding ?? next)
      setDraft(saved)
      setPreviewUrl(saved.logoUrl)
      setFailedPreview('')
      setUploadError('')
      setMessage('Оформление сохранено')
      window.dispatchEvent(new Event('partycrm:profile-updated'))
    } catch {
      // The settings hook displays the API error and keeps the draft intact.
    }
  }

  return (
    <form onSubmit={save} className="min-w-0 rounded-2xl border border-sky-100 bg-white p-5">
      <h2 className="text-base font-semibold text-slate-950">Оформление компании</h2>
      <p className="mt-1 text-sm leading-6 text-slate-500">
        Цвета кабинета и логотип для всех сотрудников выбранной компании.
      </p>
      <fieldset disabled={busy} className="mt-4 min-w-0 border-0 p-0">
        <legend className="text-sm font-semibold text-slate-700">Цветовая тема</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 xs:grid-cols-2 sm:grid-cols-3">
          {PARTY_COMPANY_PALETTES.map((item) => (
            <label
              key={item.id}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm text-slate-800 focus-within:outline-2 focus-within:outline-offset-2"
              style={{
                backgroundColor: draft.palette === item.id ? item.soft : '#fff',
                borderColor: draft.palette === item.id ? item.accent : '#cbd5e1',
                outlineColor: item.accent,
              }}
            >
              <input
                type="radio"
                name={`company-palette-${companyId}`}
                value={item.id}
                checked={draft.palette === item.id}
                onChange={() => change({ palette: item.id })}
                className="h-4 w-4 shrink-0 cursor-pointer"
                style={{ accentColor: item.accent }}
              />
              <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: item.accent }} aria-hidden="true" />
              {item.title}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset disabled={busy} className="mt-5 min-w-0 border-0 p-0">
        <legend className="text-sm font-semibold text-slate-700">Логотип</legend>
        <p id={`company-logo-help-${companyId}`} className="mt-1 text-xs leading-5 text-slate-600">
          PNG, JPEG или WebP до 5 МБ.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className={`inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 focus-within:outline-2 focus-within:outline-offset-2 ${busy ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-slate-50'}`}>
            <input
              type="file"
              accept={PARTY_COMPANY_LOGO_MIME_TYPES.join(',')}
              aria-describedby={`company-logo-help-${companyId}`}
              className="sr-only"
              onChange={upload}
            />
            {draft.logoUrl ? 'Заменить логотип' : 'Загрузить логотип'}
          </label>
          {draft.logoUrl ? (
            <button
              type="button"
              className="min-h-11 cursor-pointer rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed"
              onClick={() => updateLogo('')}
            >
              Убрать логотип
            </button>
          ) : null}
        </div>
        <details className="mt-1">
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-sky-800">Использовать ссылку</summary>
          <label className="block text-sm font-medium text-slate-700" htmlFor={`company-logo-${companyId}`}>
            Ссылка на логотип
          </label>
          <input
            id={`company-logo-${companyId}`}
            value={draft.logoUrl}
            type="text"
            inputMode="url"
            autoComplete="off"
            maxLength={2000}
            aria-describedby={validationError ? `company-branding-error-${companyId}` : undefined}
            aria-invalid={Boolean(validationError)}
            placeholder="https://example.ru/logo.png"
            className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 focus:border-sky-500 focus:outline-2 focus:outline-offset-2"
            onChange={(event) => updateLogo(event.target.value)}
          />
          {draft.logoUrl && !validationError ? (
            <button
              type="button"
              className="mt-2 min-h-11 cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed"
              onClick={() => updateLogo(draft.logoUrl, normalizePartyCompanyLogoUrl(draft.logoUrl))}
            >
              Показать логотип
            </button>
          ) : null}
        </details>
      </fieldset>
      {uploading ? <p role="status" className="mt-2 text-sm text-slate-600">Загружаем логотип…</p> : null}
      {uploadError ? <p role="alert" className="mt-2 text-sm text-red-800">{uploadError}</p> : null}
      {validationError ? (
        <p id={`company-branding-error-${companyId}`} role="alert" className="mt-2 text-sm text-red-800">
          {validationError}
        </p>
      ) : null}
      {failedPreview ? <p role="status" className="mt-2 text-sm text-red-800">Не удалось показать логотип. Выберите другой файл или проверьте ссылку.</p> : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200" aria-label="Предпросмотр оформления">
        <div className="flex min-h-14 items-center gap-3 bg-slate-950 px-4 py-2">
          {previewUrl && failedPreview !== previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt={`Логотип ${companyTitle || 'компании'}`}
              className="h-10 max-w-32 rounded-md bg-white p-1 object-contain"
              referrerPolicy="no-referrer"
              onError={() => setFailedPreview(previewUrl)}
            />
          ) : <span className="font-semibold" style={{ color: palette.light }}>PartyCRM</span>}
          <span className="min-w-0 truncate text-sm text-white">{companyTitle || 'Компания'}</span>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 p-4" style={{ backgroundColor: palette.canvas }}>
          <span className="rounded-lg px-3 py-2 text-sm font-semibold" style={{ color: palette.ink, backgroundColor: palette.soft }}>Заказы</span>
          <span className="rounded-lg px-3 py-2 text-sm font-semibold text-white" style={{ backgroundColor: palette.accent }}>Новая заявка</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!dirty || busy || Boolean(validationError)}
          className="min-h-11 cursor-pointer rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {saving ? 'Сохраняем…' : 'Сохранить оформление'}
        </button>
        <button
          type="button"
          disabled={busy || (draft.palette === DEFAULT_PARTY_COMPANY_BRANDING.palette && !draft.logoUrl)}
          className="min-h-11 cursor-pointer rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => {
            setDraft({ ...DEFAULT_PARTY_COMPANY_BRANDING })
            setPreviewUrl('')
            setFailedPreview('')
            setUploadError('')
            setMessage('Стандартное оформление выбрано. Сохраните изменения.')
          }}
        >
          Сбросить оформление
        </button>
        {message ? <p role="status" className="text-sm text-slate-600">{message}</p> : null}
      </div>
    </form>
  )
}
