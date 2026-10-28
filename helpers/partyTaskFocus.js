const objectId = /^[a-f\d]{24}$/i

// A deep link must name its company explicitly. Never resolve a task in a
// remembered or arbitrary first company when the link is incomplete/foreign.
export const readPartyTaskFocus = (search, companies = []) => {
  const params = new URLSearchParams(search)
  if (!params.has('companyId') && !params.has('taskId'))
    return { requested: false, companyId: '', taskId: '', error: '' }
  const companyId = params.get('companyId') || ''
  const taskId = params.get('taskId') || ''
  if (
    params.getAll('companyId').length !== 1 ||
    params.getAll('taskId').length > 1 ||
    !objectId.test(companyId) ||
    (params.has('taskId') && !objectId.test(taskId))
  )
    return {
      requested: true,
      companyId: '',
      taskId: '',
      error:
        'Ссылка на задачу некорректна. Выберите компанию, чтобы открыть её задачи.',
    }
  const company = companies.find(
    (entry) => String(entry.id).toLowerCase() === companyId.toLowerCase()
  )
  if (!company)
    return {
      requested: true,
      companyId: '',
      taskId: '',
      error:
        'Нет доступа к задачам компании из ссылки. Выберите доступную компанию.',
    }
  return {
    requested: true,
    companyId: String(company.id),
    taskId: taskId.toLowerCase(),
    error: '',
  }
}

export const partyTasksLink = (
  companyId,
  taskId = '',
  prefix = '/performer'
) => {
  if (
    !objectId.test(String(companyId)) ||
    (taskId && !objectId.test(String(taskId)))
  )
    return ''
  const params = new URLSearchParams({ companyId: String(companyId) })
  if (taskId) params.set('taskId', String(taskId))
  return `${prefix === '/company' ? '/company' : '/performer'}/tasks?${params}`
}
