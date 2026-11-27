const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export const getPartyDocumentTemplateSource = (customTemplateBase64) => {
  const templateBase64 = String(customTemplateBase64 ?? '').trim()
  if (templateBase64) return { type: 'docx', templateBase64 }
  return { type: 'built_in', templateBase64: '' }
}

export const formatPartyDocumentFileDate = (value) => {
  const isoValue =
    value instanceof Date && !Number.isNaN(value.getTime())
      ? value.toISOString().slice(0, 10)
      : String(value ?? '').trim()
  const match = isoValue.match(ISO_DATE_PATTERN)
  if (!match) return ''
  return `${match[3]}.${match[2]}.${match[1]}`
}

export const getPartyDocumentDate = (date, timeZone) => {
  const options = { year: 'numeric', month: '2-digit', day: '2-digit' }
  let formatter
  try {
    formatter = new Intl.DateTimeFormat('en', { ...options, timeZone })
  } catch {
    formatter = new Intl.DateTimeFormat('en', options)
  }
  const parts = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

export const getPartyContractServiceTitles = (order, services = []) => {
  const lines = (order?.orderItems || []).filter((item) => item?.title).map((item) =>
    Number(item.quantity) > 0 && Number(item.quantity) !== 1
      ? `${item.title} × ${item.quantity}` : item.title
  )
  if (lines.length) return lines
  if (order?.serviceTitle) return [order.serviceTitle]
  const names = new Map((Array.isArray(services) ? services : []).map((service) => [String(service._id), service.title]))
  return (order?.servicesIds || []).map((id) => names.get(String(id))).filter(Boolean)
}
