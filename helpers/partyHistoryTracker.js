export const PARTY_HISTORY_STATE_KEY = '__partycrm_history_v1'
const record = (value) =>
  value && typeof value === 'object' && !Array.isArray(value)
const markerOf = (value) => {
  const marker = record(value) && value[PARTY_HISTORY_STATE_KEY]
  return marker &&
    typeof marker.session === 'string' &&
    Number.isSafeInteger(marker.index) &&
    typeof marker.entry === 'string'
    ? marker
    : null
}
const routeOf = (href) => {
  try {
    const url = new URL(href)
    return url.origin + url.pathname + url.search
  } catch {
    return href
  }
}

// Metadata only. Next's __NA/tree fields and the history stack itself are retained.
export const createPartyHistoryTracker = (
  window,
  {
    token = () =>
      window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
  } = {}
) => {
  const history = window.history
  const originalPush = history.pushState
  const originalReplace = history.replaceState
  const session = markerOf(history.state)?.session || token()
  let last = null
  let onMutation = () => {}
  const read = () => {
    const marker = markerOf(history.state)
    return {
      url: window.location.href,
      state: history.state,
      ...(marker?.session === session ? marker : { index: null, entry: '' }),
    }
  }
  const stamp = (state, index, entry = token(), nativeFragment = false) =>
    record(state)
      ? {
          ...state,
          [PARTY_HISTORY_STATE_KEY]: {
            session,
            index,
            entry,
            ...(nativeFragment ? { nativeFragment: true } : {}),
          },
        }
      : state
  const writeCurrent = (index, nativeFragment = false) => {
    const state = stamp(history.state || {}, index, token(), nativeFragment)
    originalReplace.call(history, state, '', window.location.href)
    last = read()
    return last
  }
  if (markerOf(history.state)?.session === session) last = read()
  else writeCurrent(0)
  const wrappedPush = function (state, unused, url) {
    const before = read()
    const index = Number.isSafeInteger(before.index)
      ? before.index + 1
      : Number.isSafeInteger(last?.index)
        ? last.index + 1
        : 0
    const result = originalPush.call(history, stamp(state, index), unused, url)
    last = read()
    onMutation(last, 'push')
    return result
  }
  const wrappedReplace = function (state, unused, url) {
    const before = read()
    const index = Number.isSafeInteger(before.index)
      ? before.index
      : Number.isSafeInteger(last?.index)
        ? last.index
        : 0
    const result = originalReplace.call(
      history,
      stamp(state, index, before.entry || token()),
      unused,
      url
    )
    last = read()
    onMutation(last, 'replace')
    return result
  }
  history.pushState = wrappedPush
  history.replaceState = wrappedReplace
  return {
    read,
    observeMutation(listener) {
      onMutation = listener
    },
    adoptPop() {
      let current = read()
      // A new native fragment entry may copy the previous state. Give it its
      // own index so a later history.go(-N) can be restored exactly.
      if (
        last &&
        current.url !== last.url &&
        routeOf(current.url) === routeOf(last.url) &&
        (!current.entry || current.entry === last.entry)
      ) {
        current = writeCurrent((last.index || 0) + 1, history.state == null)
      }
      last = current
      return current
    },
    dispose() {
      if (history.pushState === wrappedPush) history.pushState = originalPush
      if (history.replaceState === wrappedReplace)
        history.replaceState = originalReplace
    },
  }
}
