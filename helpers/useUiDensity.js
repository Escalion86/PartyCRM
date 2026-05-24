'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  UI_DENSITY_CHANGED_EVENT,
  applyUiDensityMode,
  readUiDensityMode,
  setUiDensityMode,
} from './uiDensity'

const useUiDensity = () => {
  const [mode, setMode] = useState(() => readUiDensityMode())

  useEffect(() => {
    applyUiDensityMode(mode)
  }, [mode])

  useEffect(() => {
    const handleDensityChange = (event) => {
      const nextMode = event?.detail?.mode || readUiDensityMode()
      setMode(nextMode)
      applyUiDensityMode(nextMode)
    }

    window.addEventListener(UI_DENSITY_CHANGED_EVENT, handleDensityChange)
    return () => {
      window.removeEventListener(UI_DENSITY_CHANGED_EVENT, handleDensityChange)
    }
  }, [])

  const updateMode = useCallback((nextMode) => {
    const normalizedMode = setUiDensityMode(nextMode)
    setMode(normalizedMode)
  }, [])

  const toggleMode = useCallback(() => {
    updateMode(mode === 'compact' ? 'comfortable' : 'compact')
  }, [mode, updateMode])

  return {
    mode,
    isCompact: mode === 'compact',
    setMode: updateMode,
    toggleMode,
  }
}

export default useUiDensity
