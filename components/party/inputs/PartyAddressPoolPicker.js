'use client'

import { useMemo, useState } from 'react'
import AddressPoolPicker from '@components/AddressPoolPicker'
import { apiJson } from '@helpers/apiClient'
import {
  getAddressPoolSignature,
  normalizeAddressPoolString,
  normalizePartyPoolAddress,
  normalizeTownList,
} from '@helpers/addressPool'

export const EMPTY_PARTY_ADDRESS = {
  town: '',
  street: '',
  house: '',
  room: '',
  comment: '',
}

export default function PartyAddressPoolPicker({
  value,
  onChange,
  companySettings,
  activeCompanyId,
  onCompanySettingsChange,
}) {
  const [saving, setSaving] = useState(false)

  const poolAddresses = useMemo(
    () =>
      Array.isArray(companySettings?.addresses)
        ? companySettings.addresses.map(normalizePartyPoolAddress)
        : [],
    [companySettings?.addresses]
  )

  const townOptions = useMemo(
    () => (Array.isArray(companySettings?.towns) ? companySettings.towns : []),
    [companySettings?.towns]
  )

  const saveAddressToPool = async (nextAddress) => {
    if (!activeCompanyId) return

    const normalizedAddress = normalizePartyPoolAddress(nextAddress)
    if (
      !normalizedAddress.town &&
      !normalizedAddress.street &&
      !normalizedAddress.house
    ) {
      return
    }

    const nextAddressesMap = new Map()
    for (const item of [...poolAddresses, normalizedAddress]) {
      const signature = getAddressPoolSignature(
        normalizePartyPoolAddress(item),
        ['town', 'street', 'house', 'room', 'comment']
      )
      nextAddressesMap.set(signature, normalizePartyPoolAddress(item))
    }

    const nextTowns = normalizeTownList([...townOptions, normalizedAddress.town])

    setSaving(true)
    try {
      const response = await apiJson('/api/party/company-settings', {
        method: 'PATCH',
        headers: activeCompanyId
          ? { 'x-partycrm-company-id': activeCompanyId }
          : undefined,
        body: JSON.stringify({
          addresses: Array.from(nextAddressesMap.values()),
          towns: nextTowns,
        }),
      })
      onCompanySettingsChange?.(response.data?.settings ?? response.data ?? {})
    } finally {
      setSaving(false)
    }
  }

  const createTown = async (town) => {
    if (!activeCompanyId) return

    const normalizedTown = normalizeAddressPoolString(town)
    if (!normalizedTown) return

    const nextTowns = normalizeTownList([...townOptions, normalizedTown])

    setSaving(true)
    try {
      const response = await apiJson('/api/party/company-settings', {
        method: 'PATCH',
        headers: activeCompanyId
          ? { 'x-partycrm-company-id': activeCompanyId }
          : undefined,
        body: JSON.stringify({
          towns: nextTowns,
        }),
      })
      onCompanySettingsChange?.(response.data?.settings ?? response.data ?? {})
    } finally {
      setSaving(false)
    }
  }

  return (
    <AddressPoolPicker
      address={value || EMPTY_PARTY_ADDRESS}
      onChange={(nextAddress) => onChange(nextAddress || EMPTY_PARTY_ADDRESS)}
      poolAddresses={poolAddresses}
      townOptions={townOptions}
      onSaveAddress={saveAddressToPool}
      onCreateTown={createTown}
      allowTownCreate={!saving}
      tone="party"
      fieldsVariant="party"
      label="Адрес клиента"
      comboBoxLabel="Сохраненные адреса"
      emptyComboBoxPlaceholder="Не выбран"
      saveButtonLabel={saving ? 'Сохранение...' : 'Сохранить адрес'}
      savedLabel="✓ Уже в пуле"
    />
  )
}
