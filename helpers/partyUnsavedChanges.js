const cleanTarget = (value) => String(value || '')

export const createPartyUnsavedChangesStore = ({
  confirm = () => false,
  now = Date.now,
} = {}) => {
  const forms = new Map()
  let permitted = null
  const entries = (scope) =>
    [...forms.values()].filter(
      (form) => (form.dirty || form.pending) && (!scope || form.scope === scope)
    )
  const keyOf = ({ kind = 'route', target = '' }) =>
    `${kind}:${cleanTarget(target)}`
  return {
    register(id, form) {
      const previous = forms.get(id)
      if (
        (form.dirty || form.pending) &&
        !(previous?.dirty || previous?.pending)
      )
        permitted = null
      forms.set(id, { dirty: false, pending: false, ...form })
      return () => forms.delete(id)
    },
    unregister(id) {
      forms.delete(id)
    },
    hasChanges(scope) {
      return entries(scope).length > 0
    },
    allow(intent = {}) {
      permitted = { key: keyOf(intent), until: now() + 5000 }
      return true
    },
    hasRoutePermission() {
      return Boolean(
        permitted?.key.startsWith('route:') && permitted.until >= now()
      )
    },
    clearPermission() {
      permitted = null
    },
    request(intent = {}) {
      const active = entries(intent.scope)
      if (!active.length) return true
      if (permitted?.key === keyOf(intent) && permitted.until >= now())
        return true
      const labels = [
        ...new Set(active.map((form) => form.label).filter(Boolean)),
      ]
      const suffix = labels.length ? ` (${labels.slice(0, 3).join(', ')})` : ''
      const message = active.some((form) => form.pending)
        ? `Сохранение ещё выполняется${suffix}. Уйти, не дожидаясь результата?`
        : `Есть несохранённые изменения${suffix}. ${intent.kind === 'company' ? 'Сменить компанию' : 'Выйти'} без сохранения?`
      if (!confirm(message)) return false
      permitted = { key: keyOf(intent), until: now() + 5000 }
      return true
    },
  }
}

export const partyNavigationTarget = (href, base) => {
  try {
    const url = new URL(href, base)
    return `${url.origin}${url.pathname}${url.search}`
  } catch {
    return ''
  }
}

export const partyLinkLeavesPage = (anchor, location) => {
  if (
    !anchor ||
    anchor.hasAttribute?.('download') ||
    (anchor.target && anchor.target !== '_self')
  )
    return false
  let target
  try {
    target = new URL(anchor.href, location.href)
  } catch {
    return false
  }
  if (!['http:', 'https:'].includes(target.protocol)) return false
  return (
    partyNavigationTarget(target.href, location.href) !==
    partyNavigationTarget(location.href, location.href)
  )
}
