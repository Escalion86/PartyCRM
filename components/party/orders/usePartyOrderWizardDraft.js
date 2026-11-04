'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { decodePartyOrderWizardDraft, encodePartyOrderWizardDraft } from '@helpers/partyOrderWizardDraft'

export default function usePartyOrderWizardDraft(scope, value, dirty) {
  const [recovery, setRecovery] = useState(null)
  const [ready, setReady] = useState(false)
  const [storageState, setStorageState] = useState('')
  const cleared = useRef(false)
  const current = useRef({ value, dirty })
  useEffect(() => { current.current = { value, dirty } }, [value, dirty])
  const key = scope?.key
  const signature = scope?.signature

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (key) {
        try {
          const encoded = sessionStorage.getItem(key)
          const stored = decodePartyOrderWizardDraft({ key, signature }, encoded)
          if (stored) setRecovery(stored)
          else if (encoded) sessionStorage.removeItem(key)
        } catch {
          setStorageState('unavailable')
        }
      }
      setReady(true)
    })
    return () => cancelAnimationFrame(frame)
  }, [key, signature])

  const write = useCallback((snapshot, announce = true) => {
    if (!key || cleared.current) return
    try {
      const encoded = encodePartyOrderWizardDraft({ key, signature }, snapshot)
      if (!encoded) {
        if (announce) setStorageState('unavailable')
        return
      }
      sessionStorage.setItem(key, encoded)
      if (announce) setStorageState('saved')
    } catch {
      if (announce) setStorageState('unavailable')
    }
  }, [key, signature])

  const forget = useCallback((announce = true) => {
    try {
      if (key) sessionStorage.removeItem(key)
      if (announce) setStorageState('')
    } catch {
      if (announce) setStorageState('unavailable')
    }
  }, [key])

  useEffect(() => {
    if (!ready || recovery) return
    const timer = setTimeout(() => dirty ? write(value) : forget(), 300)
    return () => clearTimeout(timer)
  }, [ready, recovery, dirty, value, write, forget])

  useEffect(() => {
    if (!ready || recovery) return
    const flush = () => {
      if (current.current.dirty) write(current.current.value, false)
      else forget(false)
    }
    window.addEventListener('pagehide', flush)
    window.addEventListener('beforeunload', flush)
    return () => {
      window.removeEventListener('pagehide', flush)
      window.removeEventListener('beforeunload', flush)
      flush()
    }
  }, [ready, recovery, write, forget])

  const clear = useCallback(() => {
    cleared.current = true
    setRecovery(null)
    forget()
  }, [forget])

  const accept = useCallback(() => {
    cleared.current = false
    setRecovery(null)
  }, [])

  const discard = useCallback(() => {
    clear()
    cleared.current = false
  }, [clear])

  return { recovery, ready, storageState, write, clear, accept, discard }
}
