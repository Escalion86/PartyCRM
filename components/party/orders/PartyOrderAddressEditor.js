'use client'

import { useEffect, useState } from 'react'
import PartyAddressBlock from '@components/party/inputs/PartyAddressBlock'
import { apiJson } from '@helpers/apiClient'
import { formatAddressPoolShort, normalizePartyPoolAddress } from '@helpers/addressPool'

export default function PartyOrderAddressEditor({ companyId, value, addressLine, onChange, canManage, canEditDetails, disabled }) {
  const [settings, setSettings] = useState(null)

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
              if (event.target.value) onChange(normalizePartyPoolAddress(addresses[Number(event.target.value) - 1]))
            }}
          >
            <option value="">Выберите сохранённый адрес</option>
            {addresses.map((address, index) => <option key={index} value={index + 1}>{formatAddressPoolShort(address)}</option>)}
          </select>
        </label>
      )}
      <PartyAddressBlock
        title="Адрес выезда"
        value={value}
        onChange={(field, next) => onChange({ ...value, [field]: next })}
        labels={{ room: 'Квартира / офис / комната', comment: 'Уточнения по адресу' }}
        visibleFields={{ town: true, street: true, house: true, room: true, comment: canEditDetails }}
      />
    </div>
  )
}
