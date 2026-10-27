export const DEFAULT_PARTY_WORKFLOW = Object.freeze({
  revision: 0, initialStageId: 'new',
  stages: [
    { id: 'new', title: 'Новая заявка' }, { id: 'discussion', title: 'Уточнение заказа' },
    { id: 'preparation', title: 'Подготовка' }, { id: 'performed', title: 'Проведено' },
    { id: 'review', title: 'Проверка отчётов' },
  ],
  transitions: [
    { id: 'new_discussion', fromStageId: 'new', toStageId: 'discussion', roleIds: [], requireBrief: true },
    { id: 'discussion_preparation', fromStageId: 'discussion', toStageId: 'preparation', roleIds: [], requireBrief: true },
    { id: 'preparation_performed', fromStageId: 'preparation', toStageId: 'performed', roleIds: [], requireBrief: true },
    { id: 'performed_review', fromStageId: 'performed', toStageId: 'review', roleIds: [], requireBrief: true },
  ],
})

export const getPartyWorkflow = (company) => company?.settings?.workflow?.stages?.length ? company.settings.workflow : DEFAULT_PARTY_WORKFLOW
export const getPartyOrderStage = (order, workflow) => order?.workflowStageId || workflow.initialStageId
export const normalizePartyWorkflow = (body) => {
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400, code: 'partycrm_invalid_workflow' }) }
  if (!Array.isArray(body?.stages) || !body.stages.length || body.stages.length > 50) fail('Добавьте от 1 до 50 этапов')
  const ids = new Set()
  const stages = body.stages.map((stage) => {
    const id = String(stage.id || '')
    const title = String(stage.title || '').trim()
    if (!/^[a-z][a-z\d_-]{0,63}$/.test(id) || ids.has(id)) fail('Этапы должны иметь уникальные постоянные идентификаторы')
    if (!title || title.length > 100) fail('Укажите название каждого этапа до 100 символов')
    ids.add(id)
    return { id, title }
  })
  if (!ids.has(body.initialStageId)) fail('Выберите начальный этап')
  if (!Array.isArray(body.transitions) || body.transitions.length > 200) fail('Допустимо до 200 переходов')
  const transitions = body.transitions.map((transition, index) => {
    if (!ids.has(transition.fromStageId) || !ids.has(transition.toStageId) || transition.fromStageId === transition.toStageId) fail('Проверьте начальный и конечный этапы перехода')
    if (!Array.isArray(transition.roleIds) || transition.roleIds.some((id) => !/^[a-f\d]{24}$/i.test(String(id)))) fail('Выберите должности для перехода')
    return { id: `transition_${index}`, fromStageId: transition.fromStageId, toStageId: transition.toStageId, roleIds: [...new Set(transition.roleIds.map(String))], requireBrief: transition.requireBrief !== false }
  })
  const pairs = transitions.map((transition) => `${transition.fromStageId}:${transition.toStageId}`)
  if (new Set(pairs).size !== pairs.length) fail('Один и тот же переход указан несколько раз')
  return { stages, initialStageId: body.initialStageId, transitions }
}

export const findPartyWorkflowTransition = ({ workflow, order, toStageId, context }) => {
  const from = getPartyOrderStage(order, workflow)
  const transition = workflow.transitions.find((item) => item.fromStageId === from && item.toStageId === toStageId)
  if (!transition) return null
  if (context.role === 'owner' || (!context.position && context.role === 'admin')) return transition
  if (!transition.roleIds.length) return transition
  return transition.roleIds.map(String).includes(String(context.position?._id || context.staff?.positionId || '')) ? transition : null
}
