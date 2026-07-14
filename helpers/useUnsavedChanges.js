'use client'

import { useMemo } from 'react'

const normalizeSnapshotValue = (value) => {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(normalizeSnapshotValue)
  if (!value || typeof value !== 'object') return value

  return Object.keys(value)
    .sort()
    .reduce((result, key) => {
      result[key] = normalizeSnapshotValue(value[key])
      return result
    }, {})
}

export const getFormSnapshot = (value) =>
  JSON.stringify(normalizeSnapshotValue(value))

export default function useUnsavedChanges(value, open = true) {
  const snapshot = useMemo(() => getFormSnapshot(value), [value])
  // Открытие формы начинает новую сессию редактирования. Изменения value внутри
  // открытой сессии не должны обновлять исходный снимок.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initialSnapshot = useMemo(() => getFormSnapshot(value), [open])

  return Boolean(open && snapshot !== initialSnapshot)
}
