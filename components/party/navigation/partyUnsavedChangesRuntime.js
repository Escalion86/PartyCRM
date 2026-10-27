import {
  createPartyUnsavedChangesStore,
  partyLinkLeavesPage,
  partyNavigationTarget,
} from '../../../helpers/partyUnsavedChanges.js'
import { createPartyHistoryTracker } from '../../../helpers/partyHistoryTracker.js'
import {
  PARTY_ACTIVE_COMPANY_BEFORE_EVENT,
  PARTY_ACTIVE_COMPANY_EVENT,
  PARTY_ACTIVE_COMPANY_STORAGE_KEY,
  publishPartyActiveCompanyId,
} from '../../../helpers/partyActiveCompany.js'

const WINDOW_RUNTIME = '__partycrm_unsaved_runtime_v1'
const isIndex = (value) => Number.isSafeInteger(value) && value >= 0

export const createPartyUnsavedChangesRuntime = (
  window,
  {
    confirm = (message) => window.confirm(message),
    forceHistoryFallback = false,
  } = {}
) => {
  const store = createPartyUnsavedChangesStore({ confirm })
  const navigation =
    !forceHistoryFallback &&
    typeof window.navigation?.entries === 'function' &&
    window.navigation.currentEntry
      ? window.navigation
      : null
  const tracker = navigation ? null : createPartyHistoryTracker(window)
  const snapshot = () =>
    navigation
      ? {
          url: window.location.href,
          index: navigation.currentEntry?.index,
          entry: navigation.currentEntry?.key,
        }
      : tracker.read()
  let stable = snapshot()
  let traversal = null
  let restoring = null
  let activeCompany = ''
  try {
    activeCompany =
      window.localStorage.getItem(PARTY_ACTIVE_COMPANY_STORAGE_KEY) || ''
  } catch {}
  const target = (href) => partyNavigationTarget(href, window.location.href)
  const request = (intent = {}) =>
    store.request({
      ...intent,
      target:
        !intent.kind || intent.kind === 'route'
          ? target(intent.target || window.location.href)
          : String(intent.target || ''),
    })
  const stop = (event) => {
    event.preventDefault?.()
    event.stopPropagation?.()
    event.stopImmediatePropagation?.()
  }
  tracker?.observeMutation((current) => {
    stable = current
    store.clearPermission()
  })

  const onClick = (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return
    const anchor = event.target?.closest?.('a[href]')
    if (
      partyLinkLeavesPage(anchor, window.location) &&
      !request({ kind: 'route', target: anchor.href })
    )
      stop(event)
  }
  const onUnload = (event) => {
    if (!store.hasChanges() || store.hasRoutePermission()) return
    event.preventDefault()
    event.returnValue = ''
  }
  const onNavigate = (event) => {
    if (event.navigationType !== 'traverse') return
    if (restoring) return
    if (
      event.destination?.sameDocument === false ||
      target(event.destination?.url) === target(stable.url)
    )
      return
    if (!store.hasChanges()) return
    const permitted = request({ kind: 'route', target: event.destination?.url })
    if (!permitted && event.cancelable) {
      event.preventDefault()
      traversal = null
      return
    }
    traversal = {
      permitted,
      destination: target(event.destination?.url),
      from: stable,
    }
  }
  const onPop = (event) => {
    const current = tracker ? tracker.adoptPop() : snapshot()
    if (restoring) {
      stop(event)
      if (
        current.index === restoring.index &&
        target(current.url) === target(restoring.url)
      ) {
        stable = current
        restoring = null
      } else if (
        isIndex(current.index) &&
        isIndex(restoring.index) &&
        current.index !== restoring.index
      )
        window.history.go(restoring.index - current.index)
      return
    }
    if (target(current.url) === target(stable.url)) {
      // A native fragment entry originally has null state. The tracking
      // metadata must not make Next treat it as an unrelated router entry.
      if (current.nativeFragment) event.stopImmediatePropagation()
      stable = current
      traversal = null
      return
    }
    // The passive root bootstrap indexes every Next same-document entry. A
    // cross-document move is handled by the browser's native beforeunload.
    const canRestore =
      isIndex(stable.index) &&
      isIndex(current.index) &&
      stable.index !== current.index
    const planned =
      traversal?.destination === target(current.url) ? traversal : null
    traversal = null
    if (store.hasChanges() && canRestore) {
      const permitted = planned
        ? planned.permitted
        : request({ kind: 'route', target: current.url })
      if (!permitted) {
        stop(event)
        restoring = planned?.from || stable
        window.history.go(restoring.index - current.index)
        return
      }
    }
    stable = current
    if (current.nativeFragment) {
      stop(event)
      // It has no Next tree to restore. Reload the existing history entry;
      // never manufacture a router tree from an unrelated route.
      store.allow({ kind: 'route', target: target(current.url) })
      window.location.reload()
      return
    }
    store.clearPermission()
  }
  const onSuccess = () => {
    if (!restoring) {
      stable = snapshot()
      store.clearPermission()
    }
  }
  const onNavigateError = () => {
    traversal = null
    store.clearPermission()
  }
  const onCompanyBefore = (event) => {
    const nextId = String(event.detail?.companyId || '')
    // A rejected cross-tab change intentionally leaves storage on the other
    // tab's company. Compare with this tab's accepted company first.
    const previousId = String(
      activeCompany || event.detail?.previousCompanyId || ''
    )
    if (
      nextId &&
      nextId !== previousId &&
      !request({ kind: 'company', target: nextId })
    )
      event.preventDefault()
  }
  const onCompany = (event) => {
    activeCompany = String(event.detail?.companyId || activeCompany)
  }
  const onStorage = (event) => {
    if (
      event.key !== PARTY_ACTIVE_COMPANY_STORAGE_KEY ||
      !event.newValue ||
      event.newValue === activeCompany
    )
      return
    if (!request({ kind: 'company', target: event.newValue })) {
      event.stopImmediatePropagation()
      // Pin only this tab; overwriting the other tab's storage causes a loop
      // when two tabs both contain unsaved forms.
      publishPartyActiveCompanyId(activeCompany, {
        skipGuard: true,
        persist: false,
      })
    } else {
      activeCompany = String(event.newValue)
      publishPartyActiveCompanyId(activeCompany, {
        skipGuard: true,
        persist: false,
      })
    }
  }
  window.document.addEventListener('click', onClick, true)
  window.addEventListener('beforeunload', onUnload)
  window.addEventListener('popstate', onPop, true)
  window.addEventListener(PARTY_ACTIVE_COMPANY_BEFORE_EVENT, onCompanyBefore)
  window.addEventListener(PARTY_ACTIVE_COMPANY_EVENT, onCompany)
  window.addEventListener('storage', onStorage, true)
  navigation?.addEventListener('navigate', onNavigate)
  navigation?.addEventListener('navigatesuccess', onSuccess)
  navigation?.addEventListener('navigateerror', onNavigateError)
  return {
    store,
    request,
    allow(intent = {}) {
      return store.allow({
        ...intent,
        target:
          !intent.kind || intent.kind === 'route'
            ? target(intent.target || window.location.href)
            : String(intent.target || ''),
      })
    },
    dispose() {
      window.document.removeEventListener('click', onClick, true)
      window.removeEventListener('beforeunload', onUnload)
      window.removeEventListener('popstate', onPop, true)
      window.removeEventListener(
        PARTY_ACTIVE_COMPANY_BEFORE_EVENT,
        onCompanyBefore
      )
      window.removeEventListener(PARTY_ACTIVE_COMPANY_EVENT, onCompany)
      window.removeEventListener('storage', onStorage, true)
      navigation?.removeEventListener('navigate', onNavigate)
      navigation?.removeEventListener('navigatesuccess', onSuccess)
      navigation?.removeEventListener('navigateerror', onNavigateError)
      tracker?.dispose()
    },
  }
}

export const getPartyUnsavedChangesRuntime = () => {
  if (typeof window === 'undefined') return null
  if (!window[WINDOW_RUNTIME])
    window[WINDOW_RUNTIME] = createPartyUnsavedChangesRuntime(window)
  return window[WINDOW_RUNTIME]
}

export const requestPartyLeave = (intent) =>
  getPartyUnsavedChangesRuntime()?.request(intent) ?? true
export const allowPartyNavigation = (target) =>
  getPartyUnsavedChangesRuntime()?.allow({ kind: 'route', target }) ?? true
