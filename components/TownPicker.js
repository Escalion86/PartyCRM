'use client'

import { useMemo } from 'react'
import InputWrapper from '@components/InputWrapper'
import NativeSelect from '@components/NativeSelect'
import AddIconButton from '@components/AddIconButton'

/**
 * Переиспользуемый компонент для выбора/добавления города.
 * Кнопка "+" отображается внутри поля, справа от выпадающего списка.
 */
const TownPicker = ({
  value,
  onChange,
  townOptions = [],
  onCreateTown,
  allowTownCreate = true,
  error,
  required,
  disabled,
  placeholder = 'Выберите город',
  tone = 'default',
  noMargin,
}) => {
  const items = useMemo(() => {
    const set = new Set()
    townOptions.forEach((town) => {
      if (typeof town === 'string' && town.trim()) set.add(town.trim())
    })
    if (value && typeof value === 'string') set.add(value.trim())
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [value, townOptions])

  const handleCreateTown = () => {
    if (!allowTownCreate) return
    const newTown = window.prompt('Новый город')
    const trimmedTown = newTown?.trim()
    if (!trimmedTown) return
    onCreateTown?.(trimmedTown)
    onChange?.(trimmedTown)
  }

  return (
    <InputWrapper
      label="Город"
      error={error}
      required={required}
      value={value}
      tone={tone}
      noMargin={noMargin}
    >
      <NativeSelect
        wrapperClassName="flex flex-1"
        className="h-7 flex-1 cursor-pointer bg-transparent px-1 text-black outline-none"
        onChange={(e) =>
          onChange?.(e.target.value === '' ? null : e.target.value)
        }
        value={value ?? ''}
        disabled={disabled}
        aria-label="Город"
        style={{
          WebkitAppearance: 'none',
          MozAppearance: 'none',
          appearance: 'none',
        }}
      >
        <option value="">{placeholder}</option>
        {items.map((town) => (
          <option key={town} value={town}>
            {town}
          </option>
        ))}
      </NativeSelect>
      {allowTownCreate && (
        <AddIconButton
          onClick={handleCreateTown}
          title="Добавить город"
          size="xs"
          tone={tone}
          className="shrink-0"
        />
      )}
    </InputWrapper>
  )
}

export default TownPicker
