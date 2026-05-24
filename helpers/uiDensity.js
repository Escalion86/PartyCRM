export const UI_DENSITY_STORAGE_KEY = 'uiDensityMode'
export const UI_DENSITY_CHANGED_EVENT = 'ui-density-changed'

export const normalizeUiDensityMode = (value) =>
  value === 'compact' ? 'compact' : 'comfortable'

export const readUiDensityMode = () => {
  if (typeof window === 'undefined') return 'comfortable'
  return normalizeUiDensityMode(
    window.localStorage.getItem(UI_DENSITY_STORAGE_KEY)
  )
}

export const applyUiDensityMode = (mode) => {
  if (typeof document === 'undefined') return
  document.body.classList.toggle(
    'ui-compact',
    normalizeUiDensityMode(mode) === 'compact'
  )
}

export const setUiDensityMode = (mode) => {
  if (typeof window === 'undefined') return 'comfortable'
  const normalizedMode = normalizeUiDensityMode(mode)
  window.localStorage.setItem(UI_DENSITY_STORAGE_KEY, normalizedMode)
  applyUiDensityMode(normalizedMode)
  window.dispatchEvent(
    new CustomEvent(UI_DENSITY_CHANGED_EVENT, {
      detail: { mode: normalizedMode },
    })
  )
  return normalizedMode
}

