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
