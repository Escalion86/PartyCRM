'use client'

import { useEffect, useId, useRef, useState } from 'react'
import TownPicker from '@components/TownPicker'
import PartyAddressBlock from '@components/party/inputs/PartyAddressBlock'
import { apiJson } from '@helpers/apiClient'
import { formatAddressPoolShort, normalizePartyPoolAddress } from '@helpers/addressPool'

const townsUrl = '/api/party/order-options/towns'
const button = 'min-h-11 cursor-pointer rounded-lg border border-sky-200 px-3 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700 disabled:cursor-not-allowed disabled:opacity-60'

export default function PartyOrderAddressEditor({ companyId, value, addressLine, onChange, canManage, canEditDetails, disabled }) {
  const [settings, setSettings] = useState(null)
  const [townCatalog, setTownCatalog] = useState(null)
  const [townRetry, setTownRetry] = useState(0)
  const [addingTown, setAddingTown] = useState(false)
  const [townDraft, setTownDraft] = useState('')
  const [townError, setTownError] = useState('')
  const [savingTown, setSavingTown] = useState(false)
  const townFormId = useId()
  const townInput = useRef(null)
  const addTownButton = useRef(null)
  const townRequest = useRef(null)

  useEffect(() => {
    if (disabled) return
    const controller = new AbortController()
    apiJson(townsUrl, {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    }).then(({ data }) => {
      if (!controller.signal.aborted) setTownCatalog({ towns: data.towns })
    }).catch(() => {
      if (!controller.signal.aborted) setTownCatalog({ towns: [], error: true })
    })
    return () => controller.abort()
  }, [companyId, disabled, townRetry])

  useEffect(() => () => townRequest.current?.abort(), [companyId])

  useEffect(() => {
    if (!canManage || disabled) return
    const controller = new AbortController()
    apiJson('/api/party/company-settings', {
      headers: { 'x-partycrm-company-id': companyId },
      cache: 'no-store',
      signal: controller.signal,
    }).then(({ data }) => {
      if (!controller.signal.aborted) setSettings(data?.settings ?? data)
    }).catch(() => {
      // The structured fields remain available when the address pool cannot load.
    })
    return () => controller.abort()
  }, [canManage, companyId, disabled])

  if (disabled) return <p className="text-sm">{addressLine || formatAddressPoolShort(value) || 'Адрес выезда не указан'}</p>

  const addresses = Array.isArray(settings?.addresses) ? settings.addresses : []
  const selectTown = (town) => onChange((address) => ({ ...address, town: town || '' }))
  const closeTownForm = () => {
    setAddingTown(false)
    setTownDraft('')
    setTownError('')
    requestAnimationFrame(() => addTownButton.current?.focus())
  }
  const saveTown = async (event) => {
    event.preventDefault()
    const town = townDraft.trim()
    if (!town || townRequest.current) return
    const controller = new AbortController()
    townRequest.current = controller
    setSavingTown(true)
    setTownError('')
    try {
      const { data } = await apiJson(townsUrl, {
        method: 'POST',
        headers: { 'x-partycrm-company-id': companyId },
        body: JSON.stringify({ town }),
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      setTownCatalog({ towns: data.towns })
      selectTown(data.town)
      closeTownForm()
    } catch (error) {
      if (!controller.signal.aborted) setTownError(error.message || 'Не удалось добавить город')
    } finally {
      townRequest.current = null
      if (!controller.signal.aborted) setSavingTown(false)
    }
  }
  return (
    <div className="space-y-3" role="group" aria-label="Адрес выезда">
      {addressLine && !formatAddressPoolShort({ ...value, comment: '' }) && (
        <p className="text-sm text-slate-600">Сохранённый адрес: {addressLine}</p>
      )}
      {addresses.length > 0 && (
        <label className="block text-sm">
          Сохранённые адреса
          <select
            className="mt-1 min-h-11 w-full min-w-0 cursor-pointer rounded-lg border border-slate-300 bg-white px-3"
            value=""
            onChange={(event) => {
              const address = addresses[Number(event.target.value) - 1]
              if (address) onChange(() => normalizePartyPoolAddress(address))
            }}
          >
            <option value="">Выберите сохранённый адрес</option>
            {addresses.map((address, index) => <option key={index} value={index + 1}>{formatAddressPoolShort(address)}</option>)}
          </select>
        </label>
      )}
      <p className="text-sm font-semibold text-sky-700">Адрес выезда</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1 basis-40">
          <TownPicker
            value={value?.town || ''}
            onChange={selectTown}
            townOptions={townCatalog?.towns}
            allowTownCreate={false}
            disabled={savingTown}
            tone="party"
            noMargin
          />
        </div>
        <button
          type="button"
          ref={addTownButton}
          className={button}
          aria-expanded={addingTown}
          aria-controls={addingTown ? townFormId : undefined}
          disabled={!townCatalog || savingTown}
          onClick={() => {
            if (addingTown) return closeTownForm()
            setAddingTown(true)
            requestAnimationFrame(() => townInput.current?.focus())
          }}
        >
          Добавить город
        </button>
      </div>
      {!townCatalog ? <p role="status" className="text-sm text-slate-600">Загружаем города…</p> : null}
      {townCatalog?.error ? (
        <div className="flex flex-wrap items-center gap-2">
          <p role="alert" className="text-sm text-red-800">Не удалось загрузить города.</p>
          <button type="button" className={button} disabled={addingTown} onClick={() => {
            setTownCatalog(null)
            setTownRetry((previous) => previous + 1)
          }}>
            Повторить
          </button>
        </div>
      ) : null}
      {addingTown ? (
        <form id={townFormId} className="space-y-2 rounded-lg border border-slate-200 p-3" onSubmit={saveTown}>
          <label className="block text-sm">
            Новый город
            <input
              ref={townInput}
              className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-base focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
              value={townDraft}
              maxLength={120}
              disabled={savingTown}
              onChange={(event) => {
                setTownDraft(event.target.value)
                setTownError('')
              }}
            />
          </label>
          {townError ? <p role="alert" className="text-sm text-red-800">{townError}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={button} disabled={savingTown || !townDraft.trim()}>
              {savingTown ? 'Сохраняем…' : 'Сохранить город'}
            </button>
            <button type="button" className={button} disabled={savingTown} onClick={closeTownForm}>
              Отмена
            </button>
          </div>
        </form>
      ) : null}
      <PartyAddressBlock
        title=""
        value={value}
        onChange={(field, next) => onChange((address) => ({ ...address, [field]: next }))}
        labels={{ room: 'Квартира / офис / комната', comment: 'Уточнения по адресу' }}
        visibleFields={{ town: false, street: true, house: true, room: true, comment: canEditDetails }}
      />
    </div>
  )
}
