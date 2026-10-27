'use client'

import { useId, useLayoutEffect } from 'react'
import { getPartyUnsavedChangesRuntime } from './partyUnsavedChangesRuntime'

export {
  requestPartyLeave,
  allowPartyNavigation,
} from './partyUnsavedChangesRuntime'

export default function usePartyUnsavedChanges(
  dirty,
  { label = 'настройки', scope = '', pending = false, onDiscard } = {}
) {
  const id = useId()
  useLayoutEffect(() => {
    const runtime = getPartyUnsavedChangesRuntime()
    return runtime?.store.register(id, {
      dirty: Boolean(dirty),
      pending: Boolean(pending),
      label,
      scope,
      onDiscard,
    })
  }, [id, dirty, pending, label, scope, onDiscard])
}
