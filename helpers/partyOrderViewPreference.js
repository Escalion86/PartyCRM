const defaults = { view: 'list', calendarView: 'month' }
const keyFor = (companyId, staffId) =>
  companyId && staffId
    ? `partycrm.orderView.v1:${encodeURIComponent(companyId)}:${encodeURIComponent(staffId)}`
    : null
const normalize = (value) => ({
  view: ['calendar', 'board'].includes(value?.view) ? value.view : 'list',
  calendarView: ['month', 'week', 'day'].includes(value?.calendarView)
    ? value.calendarView
    : 'month',
})

export const readPartyOrderViewPreference = (companyId, staffId, storage) => {
  try {
    const key = keyFor(companyId, staffId)
    return key
      ? normalize(
          JSON.parse(
            (storage || globalThis.localStorage)?.getItem(key) || 'null'
          )
        )
      : { ...defaults }
  } catch {
    return { ...defaults }
  }
}

export const writePartyOrderViewPreference = (
  companyId,
  staffId,
  value,
  storage
) => {
  try {
    const key = keyFor(companyId, staffId)
    if (key)
      (storage || globalThis.localStorage)?.setItem(
        key,
        JSON.stringify(normalize(value))
      )
  } catch {
    /* A disabled browser store must not block the calendar. */
  }
}
