const GROUPS = [
  { id: 'work', label: 'Работа', paths: ['today', '', 'work', 'tasks', 'resources', 'ticketing', 'calls', 'inbox', 'reports', 'team', 'my-locations'] },
  { id: 'finance', label: 'Финансы и аналитика', paths: ['finance', 'payroll', 'statistics', 'pricing'] },
  { id: 'directory', label: 'Справочники', paths: ['clients', 'services', 'inventory', 'locations', 'staff', 'library'] },
  { id: 'management', label: 'Управление', paths: ['audit', 'settings'] },
]

// Group only the already authorized links. Never add routes or infer permissions.
export const getPartyNavigationGroups = (menu = []) => {
  const grouped = GROUPS.map((group) => ({ ...group, items: [] }))
  for (const item of menu) {
    const path = item.href.split('?')[0].split('#')[0].split('/')[2] || ''
    const group = grouped.find((entry) => entry.paths.includes(path)) || grouped[0]
    group.items.push(item)
  }
  return grouped.filter((group) => group.items.length > 0).map((group) => ({
    ...group,
    items: group.items.sort((left, right) => {
      const index = (item) => {
        const position = group.paths.indexOf(item.href.split('?')[0].split('#')[0].split('/')[2] || '')
        return position < 0 ? Number.MAX_SAFE_INTEGER : position
      }
      return index(left) - index(right)
    }),
  }))
}
