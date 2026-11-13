import getPersonFullName from './getPersonFullName.js'

const NAME_PART_LIMIT = 120
const nameFields = ['firstName', 'secondName', 'thirdName']
const normalizeSpaces = (value) => value.trim().replace(/\s+/gu, ' ')

export const PARTY_CLIENT_NAME_PLACEHOLDER = 'Фамилия Имя Отчество'

export const formatPartyClientFullName = (client) =>
  getPersonFullName(client, { order: ['second', 'first', 'third'] })

export const resolvePartyClientNameParts = (value, original) => {
  const name = normalizeSpaces(value)
  if (original && name === normalizeSpaces(formatPartyClientFullName(original))) {
    return Object.fromEntries(nameFields.map((field) => [field, typeof original[field] === 'string' ? original[field] : '']))
  }

  const [surnameOrName = '', firstName = '', ...patronymic] = name.split(' ')
  return {
    firstName: firstName || surnameOrName,
    secondName: firstName ? surnameOrName : '',
    thirdName: patronymic.join(' '),
  }
}

export const getPartyClientNameError = (parts) =>
  nameFields.some((field) => parts[field]?.trim().length > NAME_PART_LIMIT)
    ? 'В имени, фамилии и отчестве допустимо до 120 символов в каждой части.'
    : ''
