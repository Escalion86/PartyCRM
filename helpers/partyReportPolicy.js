export const normalizePartyReportPolicy = (value = {}) => {
  const raw = value.dueOffsetMinutes
  const offset =
    raw === null || raw === undefined || raw === '' ? null : Number(raw)
  if (
    offset !== null &&
    (!['number', 'string'].includes(typeof raw) ||
      !Number.isInteger(offset) ||
      Math.abs(offset) > 525600)
  ) {
    throw new Error(
      'Срок отчёта задаётся целым числом минут в пределах года от мероприятия'
    )
  }
  if (value.dueAnchor && !['start', 'end'].includes(value.dueAnchor))
    throw new Error(
      'Выберите начало или окончание мероприятия для срока отчёта'
    )
  for (const key of ['blockCloseUntilAccepted', 'blockPayoutUntilAccepted']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean')
      throw new Error('Настройки блокировки должны быть включены или выключены')
  }
  return {
    dueAnchor: value.dueAnchor || 'start',
    dueOffsetMinutes: offset,
    blockCloseUntilAccepted: value.blockCloseUntilAccepted === true,
    blockPayoutUntilAccepted: value.blockPayoutUntilAccepted === true,
  }
}

export const partyReportDueAt = (policy, order) => {
  if (
    policy?.dueOffsetMinutes === null ||
    policy?.dueOffsetMinutes === undefined
  )
    return null
  const raw =
    policy.dueAnchor === 'end'
      ? order.dateEnd || order.eventDate
      : order.eventDate
  if (!raw) return null
  const anchor = new Date(raw)
  return Number.isFinite(anchor.getTime())
    ? new Date(anchor.getTime() + policy.dueOffsetMinutes * 60000)
    : null
}

// Once started, the report's snapshot determines its requirements, including blockers.
export const partyReportGateBlockers = ({
  order,
  templates = [],
  templatesForStaff,
  reports = [],
  action = 'close',
  staffId,
}) => {
  if (!['close', 'payout'].includes(action))
    throw new Error('Неизвестная проверка обязательности отчёта')
  const policyKey =
    action === 'payout' ? 'blockPayoutUntilAccepted' : 'blockCloseUntilAccepted'
  const assigned = (order.assignedStaff || []).filter(
    (item) => item.confirmationStatus !== 'declined'
  )
  const requirements = new Map()
  for (const template of templates) {
    const team = template.audience === 'team'
    if (action === 'payout' && team) continue
    const authors = team
      ? assigned.filter(
          (item) =>
            String(item.staffId) ===
            String(order.reportCoordinatorStaffId || '')
        )
      : assigned
    for (const person of authors) {
      if (staffId && String(person.staffId) !== String(staffId)) continue
      if (
        templatesForStaff &&
        !(templatesForStaff.get(String(person.staffId)) || []).some(
          (item) => String(item.familyId) === String(template.familyId)
        )
      )
        continue
      requirements.set(`${person.staffId}:${template.familyId}`, {
        template,
        staffId: String(person.staffId),
        report: null,
      })
    }
  }
  for (const report of reports) {
    const team =
      report.scope === 'team' || report.templateSnapshot?.audience === 'team'
    if (
      team &&
      String(report.staffId) !== String(order.reportCoordinatorStaffId || '')
    )
      continue
    if (
      action === 'payout' &&
      (report.scope === 'team' || report.templateSnapshot?.audience === 'team')
    )
      continue
    if (staffId && String(report.staffId) !== String(staffId)) continue
    if (
      !assigned.some(
        (person) => String(person.staffId) === String(report.staffId)
      )
    )
      continue
    requirements.set(`${report.staffId}:${report.templateFamilyId}`, {
      template: report.templateSnapshot || {},
      staffId: String(report.staffId),
      report,
    })
  }
  return [...requirements.values()]
    .filter(
      ({ template, report }) =>
        template[policyKey] === true &&
        !['accepted', 'not_required'].includes(report?.status)
    )
    .map(({ template, staffId: author, report }) => ({
      staffId: author,
      title: template.title || 'Отчёт',
      status: report?.status || 'not_started',
      dueAt: report?.dueAt || partyReportDueAt(template, order),
    }))
}

export const partyReportAvailability = ({
  templates = [],
  activeTemplates = [],
  applicableTemplates = [],
  visibleTemplates = applicableTemplates,
  order,
  assigned,
  coordinator,
  manager,
}) => {
  if (order.status === 'canceled')
    return {
      code: 'order_canceled',
      message: 'Заказ отменён: новый отчёт создать нельзя.',
    }
  if (!assigned)
    return {
      code: manager ? 'manager_review' : 'review_only',
      message: manager
        ? 'Здесь можно проверить отчёты. Заполняют их назначенные исполнители.'
        : 'Вам доступны назначенные вопросы для проверки. Создаёт отчёт исполнитель заказа.',
    }
  if (!templates.length)
    return {
      code: 'not_configured',
      message:
        'Компания ещё не сохранила формы отчёта. Обратитесь к администратору компании.',
    }
  if (!activeTemplates.length)
    return {
      code: 'inactive',
      message:
        'Формы отчёта компании отключены для новых отчётов. Обратитесь к администратору.',
    }
  if (!applicableTemplates.length)
    return {
      code: 'not_applicable',
      message:
        'В активных формах нет вопросов, подходящих услугам, площадке и комплекту этого заказа. Администратор может проверить условия формы.',
    }
  if (!visibleTemplates.length)
    return {
      code: 'no_section_access',
      message:
        'В подходящих формах нет вопросов, доступных вашей должности. Администратор может проверить права на разделы отчётов.',
    }
  if (
    !coordinator &&
    visibleTemplates.every((template) => template.audience === 'team')
  )
    return {
      code: 'coordinator_required',
      message:
        'Для заказа доступны только командные формы. Их заполняет назначенный координатор; личную форму настраивает администратор.',
    }
  return { code: 'ready', message: '' }
}
