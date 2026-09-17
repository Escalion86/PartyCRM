export const defaultPartyInboxSchedule = () => ({
  week: Array.from({ length: 7 }, (_, day) => ({ closed: false, opens: day === 0 || day === 6 ? '10:00' : '09:00', closes: day === 0 || day === 6 ? '19:00' : '20:00' })),
  exceptions: [],
})

const parseWindow = (value) => {
  if (!value || Array.isArray(value) || typeof value !== 'object' || typeof value.closed !== 'boolean') throw new Error('Укажите, является ли день рабочим')
  const opens = value.opens ?? (value.closed ? '09:00' : undefined)
  const closes = value.closes ?? (value.closed ? '20:00' : undefined)
  const validTime = (time) => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time)
  if (!validTime(opens) || !validTime(closes) || opens >= closes) throw new Error('Время работы должно иметь формат ЧЧ:ММ; начало должно быть раньше окончания')
  return { closed: value.closed, opens, closes }
}

export const parsePartyInboxSchedule = (value) => {
  if (!value || Array.isArray(value) || typeof value !== 'object' || !Array.isArray(value.week) || value.week.length !== 7) throw new Error('Укажите график для всех семи дней недели')
  const week = value.week.map(parseWindow)
  if (week.every((day) => day.closed)) throw new Error('В неделе должен быть хотя бы один рабочий день')
  if (!Array.isArray(value.exceptions) || value.exceptions.length > 366) throw new Error('Допускается не более 366 исключений в графике')
  const dates = new Set()
  const exceptions = value.exceptions.map((entry) => {
    const date = entry?.date
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Укажите существующую дату исключения в формате ГГГГ-ММ-ДД')
    if (dates.has(date)) throw new Error('Для одной даты можно задать только одно исключение')
    dates.add(date)
    return { date, ...parseWindow(entry) }
  }).sort((a, b) => a.date.localeCompare(b.date))
  return { week, exceptions }
}
