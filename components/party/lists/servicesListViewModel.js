const DEFAULT_GROUP_TITLES = new Set(['без группы'])

const sortServicesByTitle = (services) =>
  [...services].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru'))

const sortGroupsByOrder = (groups) =>
  [...groups].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

const isDisplayServiceGroup = (group) => {
  const title = String(group?.title || '').trim().toLowerCase()
  return title && !DEFAULT_GROUP_TITLES.has(title)
}

export const buildServicesListViewModel = ({ services = [], serviceGroups = [] }) => {
  const displayGroups = serviceGroups.filter(isDisplayServiceGroup)

  if (displayGroups.length === 0) {
    return {
      isGrouped: false,
      flatList: sortServicesByTitle(services),
    }
  }

  const displayGroupIds = new Set(displayGroups.map((group) => group._id))
  const grouped = {}
  const withoutGroup = []

  services.forEach((service) => {
    if (service?.groupId && displayGroupIds.has(service.groupId)) {
      const gId = service.groupId
      if (!grouped[gId]) grouped[gId] = []
      grouped[gId].push(service)
    } else {
      withoutGroup.push(service)
    }
  })

  Object.keys(grouped).forEach((gId) => {
    grouped[gId] = sortServicesByTitle(grouped[gId])
  })

  return {
    isGrouped: true,
    groups: sortGroupsByOrder(displayGroups),
    grouped,
    withoutGroup: sortServicesByTitle(withoutGroup),
  }
}
