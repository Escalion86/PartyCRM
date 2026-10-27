'use client'

import { useLayoutEffect } from 'react'
import { getPartyUnsavedChangesRuntime } from './partyUnsavedChangesRuntime'

// Starts passively before any client-side navigation. With no registered dirty
// form it never asks questions or blocks the user's navigation.
export default function PartyUnsavedChangesBootstrap() {
  useLayoutEffect(() => {
    getPartyUnsavedChangesRuntime()
  }, [])
  return null
}
