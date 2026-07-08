'use client'

import { useMemo } from 'react'
import AddIconButton from '@components/AddIconButton'
import InputWrapper from '@components/InputWrapper'
import NativeSelect from '@components/NativeSelect'

const PartyDictionaryPicker = ({
  label,
  value,
  onChange,
  items = [],
  onCreateItem,
  allowCreate = true,
  disabled = false,
  placeholder = 'Выберите значение',
  createPrompt = 'Новое значение',
  addTitle = 'Добавить значение',
}) => {
  const normalizedItems = useMemo(() => {
    const set = new Set()
    items.forEach((item) => {
      if (typeof item === 'string' && item.trim()) set.add(item.trim())
    })
    if (value && typeof value === 'string') set.add(value.trim())
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [items, value])

  const handleCreateItem = () => {
    if (!allowCreate || disabled) return
    const newValue = window.prompt(createPrompt)
    const trimmedValue = newValue?.trim()
    if (!trimmedValue) return
    onCreateItem?.(trimmedValue)
    onChange?.(trimmedValue)
  }

  return (
    <InputWrapper
      label={label}
      value={value}
      tone="party"
      noMargin
      disabled={disabled}
    >
      <NativeSelect
        wrapperClassName="flex flex-1"
        className="h-7 flex-1 cursor-pointer bg-transparent px-1 text-black outline-none"
        onChange={(event) =>
          onChange?.(event.target.value === '' ? '' : event.target.value)
        }
        value={value ?? ''}
        disabled={disabled}
        aria-label={label}
        style={{
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          appearance: 'none',
        }}
      >
        <option value="">{placeholder}</option>
        {normalizedItems.map((item) => (
          <option key={item} value={item}>
            {item}
          </option>
        ))}
      </NativeSelect>
      {allowCreate && (
        <AddIconButton
          onClick={handleCreateItem}
          title={addTitle}
          size="xs"
          tone="party"
          className="shrink-0"
          disabled={disabled}
        />
      )}
    </InputWrapper>
  )
}

export default PartyDictionaryPicker
