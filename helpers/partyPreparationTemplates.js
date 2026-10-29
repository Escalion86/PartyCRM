const objectId = /^[a-f\d]{24}$/i
export const preparationTemplateFailure = (
  message,
  status = 400,
  code = 'partycrm_invalid_preparation_template'
) => {
  throw Object.assign(new Error(message), { status, code })
}
export const preparationTemplateId = (value) => {
  if (!objectId.test(String(value || '')))
    preparationTemplateFailure('Некорректный идентификатор шаблона')
  return String(value).toLowerCase()
}
export const normalizePartyPreparationTemplate = (input = {}) => {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    preparationTemplateFailure('Некорректный шаблон')
  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title || title.length > 180)
    preparationTemplateFailure(
      'Название шаблона должно содержать от 1 до 180 символов'
    )
  if (
    !Array.isArray(input.items) ||
    !input.items.length ||
    input.items.length > 30
  )
    preparationTemplateFailure('Добавьте от 1 до 30 задач')
  const seen = new Set()
  const items = input.items.map((item) => {
    const id = String(item?.id || '')
    if (!/^[a-z\d][a-z\d_-]{0,63}$/i.test(id) || seen.has(id))
      preparationTemplateFailure('Идентификаторы задач должны быть уникальными')
    seen.add(id)
    const itemTitle = typeof item.title === 'string' ? item.title.trim() : ''
    if (!itemTitle || itemTitle.length > 240)
      preparationTemplateFailure(
        'Укажите название каждой задачи, не более 240 символов'
      )
    const descriptionHtml = item.descriptionHtml ?? ''
    if (typeof descriptionHtml !== 'string' || descriptionHtml.length > 20000)
      preparationTemplateFailure('Описание задачи слишком длинное')
    if (
      !Array.isArray(item.assigneeStaffIds || []) ||
      (item.assigneeStaffIds || []).length > 100
    )
      preparationTemplateFailure('Укажите не более 100 сотрудников')
    const assigneeStaffIds = [
      ...new Set((item.assigneeStaffIds || []).map(preparationTemplateId)),
    ]
    const assigneeRoleId = item.assigneeRoleId
      ? preparationTemplateId(item.assigneeRoleId)
      : null
    if (Boolean(assigneeStaffIds.length) === Boolean(assigneeRoleId))
      preparationTemplateFailure(
        'Для каждой задачи выберите сотрудников или одну должность'
      )
    const offsetMinutes = item.offsetMinutes
    if (
      offsetMinutes !== null &&
      (!Number.isInteger(offsetMinutes) || Math.abs(offsetMinutes) > 527040)
    )
      preparationTemplateFailure(
        'Срок задачи должен быть в пределах года до или после начала мероприятия'
      )
    return {
      id,
      title: itemTitle,
      descriptionHtml,
      assigneeStaffIds,
      assigneeRoleId,
      offsetMinutes,
    }
  })
  return { title, active: input.active !== false, items }
}
export const partyPreparationTemplateSourceKey = (
  orderId,
  templateId,
  itemId
) =>
  `order:${preparationTemplateId(orderId)}:template:${preparationTemplateId(templateId)}:${itemId}`
export const buildPartyPreparationTemplatePreview = ({
  template,
  order,
  existingSourceKeys = [],
  now = new Date(),
}) => {
  const sources = new Set(existingSourceKeys)
  const startsAt =
    order.eventDate && Number.isFinite(+new Date(order.eventDate))
      ? +new Date(order.eventDate)
      : null
  return template.items.map((item) => {
    const sourceKey = partyPreparationTemplateSourceKey(
      order._id,
      template._id,
      item.id
    )
    if (item.offsetMinutes !== null && startsAt === null)
      preparationTemplateFailure(
        'Укажите дату мероприятия перед применением шаблона'
      )
    const dueAt =
      item.offsetMinutes === null
        ? null
        : new Date(startsAt + item.offsetMinutes * 60000).toISOString()
    return {
      ...item,
      sourceKey,
      dueAt,
      alreadyCreated: sources.has(sourceKey),
      overdue: Boolean(dueAt && +new Date(dueAt) < +new Date(now)),
      afterEvent: Boolean(
        dueAt && +new Date(dueAt) > +new Date(order.dateEnd || order.eventDate)
      ),
    }
  })
}
