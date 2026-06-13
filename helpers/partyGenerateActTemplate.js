import formatAddress from './formatAddress.js'
import formatDate from './formatDate.js'
import formatDateTime from './formatDateTime.js'
import getPersonFullName from './getPersonFullName.js'

const EMPTY_VALUE = '____________'
const PARTIES_TABLES_MARKER_PREFIX = '[[PARTIES_TABLES:'
const PARTIES_TABLES_MARKER_SUFFIX = ']]'
const SIGNATURES_TABLE_MARKER_PREFIX = '[[SIGNATURES_TABLE:'
const SIGNATURES_TABLE_MARKER_SUFFIX = ']]'

const clean = (value, fallback = EMPTY_VALUE) => {
  if (value === null || value === undefined) return fallback
  const text = String(value).trim()
  return text || fallback
}

const formatMoneyNoCurrency = (value) => {
  const amount = Number(value) || 0
  return `${amount.toLocaleString('ru-RU')}`
}

const getClientName = (client) => {
  if (!client) return EMPTY_VALUE
  return clean(
    getPersonFullName(client, {
      fallback: '',
      order: ['second', 'first', 'third'],
    })
  )
}

const getClientLegalName = (client) => {
  if (!client) return EMPTY_VALUE
  return clean(client.legalName || getClientName(client))
}

const normalizeToken = (value) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')

const PARTY_ACT_TEMPLATE_VARIABLES = [
  'НОМЕР ДОКУМЕНТА',
  'ДАТА АКТА',
  'ДАТА ДОГОВОРА',
  'ОСНОВНОЙ ГОРОД',
  'НАИМЕНОВАНИЕ КЛИЕНТА',
  'ФИО КЛИЕНТА',
  'НАИМЕНОВАНИЕ КОМПАНИИ',
  'ИСПОЛНИТЕЛЬ ПОДПИСАНТ',
  'СПИСОК УСЛУГ',
  'ДОГОВОРНАЯ СУММА',
  'ДАТА СОБЫТИЯ',
  'ГОРОД СОБЫТИЯ',
  'АДРЕС СОБЫТИЯ',
  'РЕКВИЗИТЫ СТОРОН',
  'ПОДПИСИ СТОРОН',
]

const DEFAULT_PARTY_ACT_TEMPLATE = `АКТ № {НОМЕР ДОКУМЕНТА}
к договору оказания услуг от {ДАТА ДОГОВОРА}

г. {ОСНОВНОЙ ГОРОД} {ДАТА АКТА}

{НАИМЕНОВАНИЕ КЛИЕНТА}, именуемое(-ый, -ая) в дальнейшем «Заказчик», и {ИСПОЛНИТЕЛЬ ПОДПИСАНТ}, именуемый в дальнейшем «Исполнитель», составили настоящий акт о нижеследующем:

1. Исполнителем оказаны услуги по организации и проведению мероприятия {ДАТА СОБЫТИЯ} по адресу: {АДРЕС СОБЫТИЯ}.
2. Перечень оказанных услуг: {СПИСОК УСЛУГ}.
3. Стоимость оказанных услуг составляет {ДОГОВОРНАЯ СУММА} рублей.
4. Стороны претензий по объему, качеству и срокам оказания услуг не имеют.

5. АДРЕСА И РЕКВИЗИТЫ СТОРОН
{РЕКВИЗИТЫ СТОРОН}`

const buildPartiesRequisitesText = ({
  performerSignatory,
  performerRows,
  clientLegalName,
  clientRows,
}) =>
  [
    `Исполнитель: ${performerSignatory}`,
    ...performerRows.map(({ key, value }) => `${key}: ${value}`),
    '',
    `Заказчик: ${clientLegalName}`,
    ...clientRows.map(({ key, value }) => `${key}: ${value}`),
  ].join('\n')

const encodePartiesTablesMarker = (value) => {
  try {
    const payload = encodeURIComponent(JSON.stringify(value))
    return `${PARTIES_TABLES_MARKER_PREFIX}${payload}${PARTIES_TABLES_MARKER_SUFFIX}`
  } catch (error) {
    return ''
  }
}

const encodeSignaturesTableMarker = (value) => {
  try {
    const payload = encodeURIComponent(JSON.stringify(value))
    return `${SIGNATURES_TABLE_MARKER_PREFIX}${payload}${SIGNATURES_TABLE_MARKER_SUFFIX}`
  } catch (error) {
    return ''
  }
}

const toSurnameWithInitials = (fullName) => {
  const value = String(fullName ?? '').trim()
  if (!value || value === EMPTY_VALUE) return EMPTY_VALUE
  const parts = value.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return value
  const surname = parts[0]
  const firstInitial = parts[1]?.[0] ? `${parts[1][0]}.` : ''
  const secondInitial = parts[2]?.[0] ? `${parts[2][0]}.` : ''
  return `${surname} ${firstInitial}${secondInitial}`.trim()
}

const buildPartiesSignaturesText = ({
  performerFullName,
  clientFullName,
  mode = 'preview',
}) => {
  const performerSignature = `${toSurnameWithInitials(performerFullName)} _______________`
  const clientSignature = `${toSurnameWithInitials(clientFullName)} _______________`

  if (mode === 'docx') {
    return encodeSignaturesTableMarker({
      leftTitle: 'Исполнитель',
      rightTitle: 'Заказчик',
      leftValue: performerSignature,
      rightValue: clientSignature,
    })
  }

  return [
    `Исполнитель: ${performerSignature}`,
    `Заказчик: ${clientSignature}`,
  ].join('\n')
}

const buildAutoDocumentNumber = (order, docMeta) => {
  const manualNumber = clean(docMeta?.documentNumber, '')
  if (manualNumber) return manualNumber
  const nextNumber = Number(docMeta?.nextDocumentNumber)
  if (Number.isFinite(nextNumber) && nextNumber > 0) return String(nextNumber)
  if (order?._id) return String(order._id).slice(-6).toUpperCase()
  return EMPTY_VALUE
}

const getOrderAddress = (order) => {
  if (!order) return EMPTY_VALUE
  if (order.placeType === 'company_location') {
    if (order.customAddress) return order.customAddress
    return 'По адресу Исполнителя'
  }
  if (order.clientAddress) {
    return formatAddress(order.clientAddress, EMPTY_VALUE)
  }
  return EMPTY_VALUE
}

const buildPartyActVariables = ({
  order,
  client,
  serviceTitles,
  companyRequisites = {},
  docMeta = {},
}) => {
  const actDateRaw = docMeta?.actDate
  const actDate =
    typeof actDateRaw === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(actDateRaw)
      ? (() => {
          const [year, month, day] = actDateRaw.split('-')
          return `${day}.${month}.${year}`
        })()
      : formatDate(new Date())

  const contractDateRaw = docMeta?.contractDate
  const contractDate =
    typeof contractDateRaw === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(contractDateRaw)
      ? (() => {
          const [year, month, day] = contractDateRaw.split('-')
          return `${day}.${month}.${year}`
        })()
      : formatDate(new Date())

  const eventDateDateTime = order?.eventDate
    ? formatDateTime(order.eventDate)
    : EMPTY_VALUE
  const orderAddress = getOrderAddress(order)
  const servicesText =
    Array.isArray(serviceTitles) && serviceTitles.length > 0
      ? serviceTitles.join(', ')
      : EMPTY_VALUE
  const contractSum = Number(order?.contractAmount) || 0
  const documentNumber = buildAutoDocumentNumber(order, docMeta)

  const providerStatusRaw =
    companyRequisites?.providerStatus === 'self_employed'
      ? 'self_employed'
      : 'individual_entrepreneur'
  const providerFullName = clean(
    companyRequisites?.providerFullName ||
      companyRequisites?.providerDisplayName
  )
  const providerDisplayName = clean(
    companyRequisites?.providerDisplayName ||
      companyRequisites?.providerFullName
  )
  const providerOgrnip = clean(companyRequisites?.providerOgrnip)
  const providerInn = clean(companyRequisites?.providerInn)
  const providerBank = clean(companyRequisites?.providerBankName)
  const providerBik = clean(companyRequisites?.providerBik)
  const providerCheckingAccount = clean(
    companyRequisites?.providerCheckingAccount
  )
  const providerCorrespondentAccount = clean(
    companyRequisites?.providerCorrespondentAccount
  )
  const providerLegalAddress = clean(companyRequisites?.providerLegalAddress)

  const performerSignatory =
    providerStatusRaw === 'self_employed'
      ? providerFullName
      : providerDisplayName

  const baseTown = clean(
    companyRequisites?.defaultTown ||
      order?.clientAddress?.town ||
      order?.address?.town,
    EMPTY_VALUE
  )
  const contractSumFormatted = formatMoneyNoCurrency(contractSum)

  const clientLegalName = getClientLegalName(client)
  const clientRows = [
    { key: 'ФИО', value: getClientName(client) },
    { key: 'ИНН', value: clean(client?.inn, EMPTY_VALUE) },
    { key: 'КПП', value: clean(client?.kpp, EMPTY_VALUE) },
    { key: 'ОГРН/ОГРНИП', value: clean(client?.ogrn, EMPTY_VALUE) },
    { key: 'Банк', value: clean(client?.bankName, EMPTY_VALUE) },
    { key: 'БИК', value: clean(client?.bik, EMPTY_VALUE) },
    { key: 'р/с', value: clean(client?.checkingAccount, EMPTY_VALUE) },
    { key: 'к/с', value: clean(client?.correspondentAccount, EMPTY_VALUE) },
    { key: 'Юр. адрес', value: clean(client?.legalAddress, EMPTY_VALUE) },
  ]
  const providerRows = [
    { key: 'ИНН', value: providerInn },
    ...(providerStatusRaw === 'individual_entrepreneur' && providerOgrnip
      ? [{ key: 'ОГРНИП', value: providerOgrnip }]
      : []),
    { key: 'Банк', value: providerBank },
    { key: 'БИК', value: providerBik },
    { key: 'р/с', value: providerCheckingAccount },
    { key: 'к/с', value: providerCorrespondentAccount },
    { key: 'Юр. адрес', value: providerLegalAddress },
  ]
  const requisitesSidesMode =
    docMeta?.requisitesSidesMode === 'docx' ? 'docx' : 'preview'
  const partiesTablesValue =
    requisitesSidesMode === 'docx'
      ? encodePartiesTablesMarker({
          performer: {
            title: `Исполнитель: ${performerSignatory}`,
            rows: providerRows,
          },
          customer: {
            title: `Заказчик: ${clientLegalName}`,
            rows: clientRows,
          },
        })
      : buildPartiesRequisitesText({
          performerSignatory,
          performerRows: providerRows,
          clientLegalName,
          clientRows,
        })

  return {
    'НОМЕР ДОКУМЕНТА': documentNumber,
    'ДАТА АКТА': actDate,
    'ДАТА ДОГОВОРА': contractDate,
    'ОСНОВНОЙ ГОРОД': baseTown,
    'НАИМЕНОВАНИЕ КЛИЕНТА': clientLegalName,
    'ФИО КЛИЕНТА': getClientName(client),
    'НАИМЕНОВАНИЕ КОМПАНИИ': providerDisplayName,
    'ИСПОЛНИТЕЛЬ ПОДПИСАНТ': performerSignatory,
    'СПИСОК УСЛУГ': servicesText,
    'ДОГОВОРНАЯ СУММА': contractSumFormatted,
    'ДАТА СОБЫТИЯ': eventDateDateTime,
    'ГОРОД СОБЫТИЯ': clean(
      order?.clientAddress?.town || order?.address?.town,
      EMPTY_VALUE
    ),
    'АДРЕС СОБЫТИЯ': orderAddress,
    'РЕКВИЗИТЫ СТОРОН': partiesTablesValue,
    'ПОДПИСИ СТОРОН': buildPartiesSignaturesText({
      performerFullName: providerFullName,
      clientFullName: getClientName(client),
      mode: requisitesSidesMode,
    }),
  }
}

const replaceTemplateVariables = (template, values) => {
  const source =
    typeof template === 'string' && template.trim()
      ? template
      : DEFAULT_PARTY_ACT_TEMPLATE

  const normalizedMap = Object.entries(values).reduce((acc, [key, value]) => {
    acc[normalizeToken(key)] = value
    return acc
  }, {})

  return source.replace(/\{([^{}]+)\}/g, (match, tokenRaw) => {
    const normalizedToken = normalizeToken(tokenRaw)
    return normalizedToken in normalizedMap
      ? normalizedMap[normalizedToken]
      : match
  })
}

const partyGenerateActTemplate = ({
  order,
  client,
  serviceTitles = [],
  companyRequisites = {},
  template = '',
  docMeta = {},
}) => {
  const variables = buildPartyActVariables({
    order,
    client,
    serviceTitles,
    companyRequisites,
    docMeta,
  })
  return replaceTemplateVariables(template, variables)
}

const getPartyActTemplateVariablesMap = ({
  order,
  client,
  serviceTitles = [],
  companyRequisites = {},
  docMeta = {},
}) =>
  buildPartyActVariables({
    order,
    client,
    serviceTitles,
    companyRequisites,
    docMeta,
  })

export {
  DEFAULT_PARTY_ACT_TEMPLATE,
  PARTY_ACT_TEMPLATE_VARIABLES,
  getPartyActTemplateVariablesMap,
}
export default partyGenerateActTemplate
