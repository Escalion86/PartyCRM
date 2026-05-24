const GOOGLE_CALENDAR_LINK_RE =
  /https?:\/\/(?:www\.)?google\.com\/calendar\/event\?eid=\S+|https?:\/\/calendar\.google\.com\/calendar\/\S+/i

const getGoogleCalendarLinkFromText = (text) => {
  if (!text) return null
  const match = String(text).match(GOOGLE_CALENDAR_LINK_RE)
  if (!match?.[0]) return null
  return match[0].replace(/[),.]+$/, '')
}

export default getGoogleCalendarLinkFromText

