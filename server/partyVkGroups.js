const LEGACY_VK_KEYS = [
  'vkGroupEnabled',
  'vkGroupName',
  'vkGroupId',
  'vkGroupAccessToken',
  'vkGroupConfirmationCode',
  'vkGroupWebhookToken',
  'vkGroupWebhookSecret',
  'vkGroupWebhookUrl',
  'vkGroupStatus',
  'vkGroupLastError',
  'vkGroupConnectedAt',
  'vkGroupLastCheckedAt',
  'vkGroupLastWebhookAt',
  'vkGroupLastPeerId',
]

const readCustomValue = (custom, key) => {
  if (!custom) return undefined
  if (typeof custom.get === 'function') return custom.get(key)
  return custom[key]
}

const normalizeText = (value, maxLength = 500) => {
  if (value === null || value === undefined) return ''
  const text = String(value).trim()
  if (!text) return ''
  return text.slice(0, maxLength)
}

const toArray = (value) => (Array.isArray(value) ? value : [])

const cleanVkGroup = (group = {}) => {
  const groupId = normalizeText(group.groupId, 120)
  const webhookToken = normalizeText(group.webhookToken, 160)
  const name =
    normalizeText(group.name, 120) || (groupId ? `VK ${groupId}` : 'VK')

  return {
    id: normalizeText(group.id, 160) || webhookToken,
    name,
    enabled: group.enabled === true,
    groupId,
    accessToken: normalizeText(group.accessToken, 512),
    confirmationCode: normalizeText(group.confirmationCode, 256),
    webhookToken,
    webhookSecret: normalizeText(group.webhookSecret, 160),
    webhookUrl: normalizeText(group.webhookUrl, 1000),
    status: normalizeText(group.status, 80),
    lastError: normalizeText(group.lastError, 1000),
    connectedAt: normalizeText(group.connectedAt, 80),
    lastCheckedAt: normalizeText(group.lastCheckedAt, 80),
    lastWebhookAt: normalizeText(group.lastWebhookAt, 80),
    lastPeerId: normalizeText(group.lastPeerId, 160),
  }
}

const legacyVkGroupFromIntegrations = (integrations = {}) => {
  const groupId = normalizeText(readCustomValue(integrations, 'vkGroupId'), 120)
  const accessToken = normalizeText(
    readCustomValue(integrations, 'vkGroupAccessToken'),
    512
  )
  const webhookToken = normalizeText(
    readCustomValue(integrations, 'vkGroupWebhookToken'),
    160
  )

  if (!groupId && !accessToken && !webhookToken) return null

  return cleanVkGroup({
    id: webhookToken,
    name: normalizeText(readCustomValue(integrations, 'vkGroupName'), 120),
    enabled: readCustomValue(integrations, 'vkGroupEnabled') === true,
    groupId,
    accessToken,
    confirmationCode: readCustomValue(integrations, 'vkGroupConfirmationCode'),
    webhookToken,
    webhookSecret: readCustomValue(integrations, 'vkGroupWebhookSecret'),
    webhookUrl: readCustomValue(integrations, 'vkGroupWebhookUrl'),
    status: readCustomValue(integrations, 'vkGroupStatus'),
    lastError: readCustomValue(integrations, 'vkGroupLastError'),
    connectedAt: readCustomValue(integrations, 'vkGroupConnectedAt'),
    lastCheckedAt: readCustomValue(integrations, 'vkGroupLastCheckedAt'),
    lastWebhookAt: readCustomValue(integrations, 'vkGroupLastWebhookAt'),
    lastPeerId: readCustomValue(integrations, 'vkGroupLastPeerId'),
  })
}

const normalizePartyVkGroups = (integrations = {}) => {
  const groups = toArray(readCustomValue(integrations, 'vkGroups'))
    .map(cleanVkGroup)
    .filter((group) => group.groupId || group.accessToken || group.webhookToken)

  if (groups.length > 0) return groups

  const legacyGroup = legacyVkGroupFromIntegrations(integrations)
  return legacyGroup ? [legacyGroup] : []
}

const removeLegacyVkKeys = (integrations = {}) => {
  const next = { ...integrations }
  for (const key of LEGACY_VK_KEYS) {
    delete next[key]
  }
  return next
}

const findVkGroupByWebhookToken = (integrations = {}, token = '') => {
  const normalizedToken = normalizeText(token, 160)
  if (!normalizedToken) return null
  return (
    normalizePartyVkGroups(integrations).find(
      (group) => group.webhookToken === normalizedToken
    ) || null
  )
}

const updateVkGroupInIntegrations = (integrations = {}, selector, patch = {}) => {
  const normalizedSelector = normalizeText(selector, 160)
  const groups = normalizePartyVkGroups(integrations).map((group) =>
    group.id === normalizedSelector ||
    group.webhookToken === normalizedSelector ||
    group.groupId === normalizedSelector
      ? cleanVkGroup({ ...group, ...patch })
      : group
  )

  return {
    ...removeLegacyVkKeys(integrations),
    vkGroups: groups,
  }
}

const upsertVkGroupInIntegrations = (integrations = {}, group = {}) => {
  const nextGroup = cleanVkGroup(group)
  const groups = normalizePartyVkGroups(integrations)
  const index = groups.findIndex(
    (item) =>
      item.id === nextGroup.id ||
      item.webhookToken === nextGroup.webhookToken ||
      item.groupId === nextGroup.groupId
  )
  const nextGroups =
    index >= 0
      ? groups.map((item, itemIndex) => (itemIndex === index ? nextGroup : item))
      : [...groups, nextGroup]

  return {
    ...removeLegacyVkKeys(integrations),
    vkGroups: nextGroups,
  }
}

const removeVkGroupFromIntegrations = (integrations = {}, selector = '') => {
  const normalizedSelector = normalizeText(selector, 160)
  const groups = normalizePartyVkGroups(integrations).filter(
    (group) =>
      group.id !== normalizedSelector &&
      group.webhookToken !== normalizedSelector &&
      group.groupId !== normalizedSelector
  )

  return {
    ...removeLegacyVkKeys(integrations),
    vkGroups: groups,
  }
}

const normalizePartyVkSettings = (integrations = {}) => {
  const groups = normalizePartyVkGroups(integrations)
  const enabled = groups.some((group) => group.enabled)
  const connected = groups.some(
    (group) => group.enabled && group.status === 'connected'
  )
  const firstError = groups.find((group) => group.lastError)?.lastError || ''
  const lastCheckedAt =
    groups
      .map((group) => group.lastCheckedAt)
      .filter(Boolean)
      .sort()
      .at(-1) || ''
  const lastWebhookAt =
    groups
      .map((group) => group.lastWebhookAt)
      .filter(Boolean)
      .sort()
      .at(-1) || ''

  return {
    enabled,
    groups,
    status: connected ? 'connected' : enabled ? 'warning' : 'disabled',
    lastError: firstError,
    lastCheckedAt,
    lastWebhookAt,
  }
}

const getVkGroupReplyCredentials = ({ integrations = {}, conversation = {} }) => {
  const groups = normalizePartyVkGroups(integrations)
  const conversationGroupId = normalizeText(conversation?.vkGroupId, 120)
  const group =
    groups.find(
      (item) =>
        item.enabled &&
        item.accessToken &&
        conversationGroupId &&
        item.groupId === conversationGroupId
    ) ||
    groups.find((item) => item.enabled && item.accessToken && item.status === 'connected') ||
    groups.find((item) => item.enabled && item.accessToken)

  if (!group) {
    return { ok: false, error: 'vk_integration_not_connected' }
  }

  return { ok: true, accessToken: group.accessToken, group }
}

export {
  LEGACY_VK_KEYS,
  findVkGroupByWebhookToken,
  getVkGroupReplyCredentials,
  normalizePartyVkGroups,
  normalizePartyVkSettings,
  removeLegacyVkKeys,
  removeVkGroupFromIntegrations,
  updateVkGroupInIntegrations,
  upsertVkGroupInIntegrations,
}
