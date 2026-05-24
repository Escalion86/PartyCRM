const normalizeNamePart = (value) =>
  typeof value === 'string' ? value.trim() : ''

const getPersonFullName = (
  person,
  {
    fallback = '',
    separator = ' ',
    firstNameKey = 'firstName',
    secondNameKey = 'secondName',
    thirdNameKey = 'thirdName',
    order = ['first', 'second', 'third'],
  } = {}
) => {
  if (!person || typeof person !== 'object') return fallback

  const valuesMap = {
    first: normalizeNamePart(person[firstNameKey]),
    second: normalizeNamePart(person[secondNameKey]),
    third: normalizeNamePart(person[thirdNameKey]),
  }

  const parts = (Array.isArray(order) && order.length
    ? order
    : ['first', 'second', 'third']
  )
    .map((key) => valuesMap[key] || '')
    .filter(Boolean)

  if (parts.length === 0) return fallback
  return parts.join(separator)
}

export default getPersonFullName
