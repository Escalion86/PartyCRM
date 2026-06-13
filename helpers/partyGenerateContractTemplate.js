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

const getClientContacts = (client) => {
  if (!client) return EMPTY_VALUE
  const contacts = []
  if (client.phone) contacts.push(`Телефон: +${client.phone}`)
  if (client.whatsapp) contacts.push(`WhatsApp: +${client.whatsapp}`)
  if (client.telegram) contacts.push(`Telegram: @${client.telegram}`)
  if (client.email) contacts.push(`Email: ${client.email}`)
  return contacts.length ? contacts.join(', ') : EMPTY_VALUE
}

const getClientRequisites = (client) => {
  if (!client) return 'Не заполнены'
  const lines = []
  if (client.legalName) lines.push(`Наименование: ${client.legalName}`)
  if (client.inn) lines.push(`ИНН: ${client.inn}`)
  if (client.kpp) lines.push(`КПП: ${client.kpp}`)
  if (client.ogrn) lines.push(`ОГРН/ОГРНИП: ${client.ogrn}`)
  if (client.bankName) lines.push(`Банк: ${client.bankName}`)
  if (client.bik) lines.push(`БИК: ${client.bik}`)
  if (client.checkingAccount)
    lines.push(`Расчетный счет: ${client.checkingAccount}`)
  if (client.correspondentAccount)
    lines.push(`Корр. счет: ${client.correspondentAccount}`)
  if (client.legalAddress)
    lines.push(`Юридический адрес: ${client.legalAddress}`)
  return lines.length ? lines.join('\n') : 'Не заполнены'
}

const normalizeToken = (value) =>
  String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')

const UNITS_MALE = [
  '',
  'один',
  'два',
  'три',
  'четыре',
  'пять',
  'шесть',
  'семь',
  'восемь',
  'девять',
]
const UNITS_FEMALE = [
  '',
  'одна',
  'две',
  'три',
  'четыре',
  'пять',
  'шесть',
  'семь',
  'восемь',
  'девять',
]
const TEENS = [
  'десять',
  'одиннадцать',
  'двенадцать',
  'тринадцать',
  'четырнадцать',
  'пятнадцать',
  'шестнадцать',
  'семнадцать',
  'восемнадцать',
  'девятнадцать',
]
const TENS = [
  '',
  '',
  'двадцать',
  'тридцать',
  'сорок',
  'пятьдесят',
  'шестьдесят',
  'семьдесят',
  'восемьдесят',
  'девяносто',
]
const HUNDREDS = [
  '',
  'сто',
  'двести',
  'триста',
  'четыреста',
  'пятьсот',
  'шестьсот',
  'семьсот',
  'восемьсот',
  'девятьсот',
]

const plural = (n, one, few, many) => {
  const mod100 = n % 100
  const mod10 = n % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

const tripletToWords = (num, female = false) => {
  if (num === 0) return ''
  const units = female ? UNITS_FEMALE : UNITS_MALE
  const h = Math.floor(num / 100)
  const t = Math.floor((num % 100) / 10)
  const u = num % 10
  const words = []
  if (h) words.push(HUNDREDS[h])
  if (t === 1) words.push(TEENS[u])
  else {
    if (t > 1) words.push(TENS[t])
    if (u) words.push(units[u])
  }
  return words.join(' ')
}

const amountToWordsRu = (value, withCurrency = false) => {
  const amount = Math.floor(Number(value) || 0)
  if (amount === 0) return withCurrency ? 'ноль рублей' : 'ноль'

  const millions = Math.floor(amount / 1000000)
  const thousands = Math.floor((amount % 1000000) / 1000)
  const rest = amount % 1000
  const parts = []

  if (millions > 0) {
    parts.push(tripletToWords(millions))
    parts.push(plural(millions, 'миллион', 'миллиона', 'миллионов'))
  }
  if (thousands > 0) {
    parts.push(tripletToWords(thousands, true))
    parts.push(plural(thousands, 'тысяча', 'тысячи', 'тысяч'))
  }
  if (rest > 0) parts.push(tripletToWords(rest))

  if (withCurrency) {
    parts.push(plural(amount, 'рубль', 'рубля', 'рублей'))
  }
  return parts.filter(Boolean).join(' ')
}

const PARTY_CONTRACT_TEMPLATE_VARIABLES = [
  'НОМЕР ДОКУМЕНТА',
  'ОСНОВНОЙ ГОРОД',
  'ДАТА ДОГОВОРА',
  'НАИМЕНОВАНИЕ КЛИЕНТА',
  'ФИО КЛИЕНТА',
  'НАИМЕНОВАНИЕ КОМПАНИИ',
  'ФИО РУКОВОДИТЕЛЯ',
  'СТАТУС КОМПАНИИ',
  'ОСНОВАНИЕ КОМПАНИИ',
  'РЕКВИЗИТЫ КОМПАНИИ',
  'ИНН КОМПАНИИ',
  'ОГРНИП КОМПАНИИ',
  'БАНК КОМПАНИИ',
  'БИК КОМПАНИИ',
  'РАСЧЕТНЫЙ СЧЕТ КОМПАНИИ',
  'КОРР СЧЕТ КОМПАНИИ',
  'ЮР АДРЕС КОМПАНИИ',
  'ДАТА',
  'ДАТА СОБЫТИЯ',
  'ВРЕМЯ СОБЫТИЯ',
  'АДРЕС СОБЫТИЯ',
  'МЕСТО ПРОВЕДЕНИЯ',
  'СПИСОК УСЛУГ',
  'ДОГОВОРНАЯ СУММА',
  'ИСПОЛНИТЕЛИ',
  'КОНТАКТЫ КЛИЕНТА',
  'РЕКВИЗИТЫ КЛИЕНТА',
  'РЕКВИЗИТЫ СТОРОН',
  'ПОДПИСИ СТОРОН',
  'ИНН',
  'КПП',
  'ОГРН',
  'БАНК',
  'БИК',
  'РАСЧЕТНЫЙ СЧЕТ',
  'КОРР СЧЕТ',
  'ЮР АДРЕС',
]

const DEFAULT_PARTY_CONTRACT_TEMPLATE = `ДОГОВОР ОКАЗАНИЯ УСЛУГ № {НОМЕР ДОКУМЕНТА}
г. {ОСНОВНОЙ ГОРОД} {ДАТА ДОГОВОРА}

{НАИМЕНОВАНИЕ КЛИЕНТА}, именуемое(-ый, -ая) в дальнейшем «Заказчик», в лице {ФИО КЛИЕНТА}, с одной стороны, и {НАИМЕНОВАНИЕ КОМПАНИИ}, в лице {СТАТУС КОМПАНИИ} {ФИО РУКОВОДИТЕЛЯ}, действующего на основании {ОСНОВАНИЕ КОМПАНИИ}, с другой стороны, вместе именуемые «Стороны», а индивидуально – «Сторона», заключили настоящий договор (далее – Договор), о нижеследующем:

1. ПРЕДМЕТ ДОГОВОРА
1.1. Исполнитель обязуется оказать услуги по организации и проведению мероприятия {ДАТА}, а Заказчик обязуется принять и оплатить оказанные Исполнителем услуги.
1.2. Организуемое Исполнителем мероприятие проводится по адресу: {АДРЕС СОБЫТИЯ}.
1.3. Перечень оказываемых услуг включает в себя:
{СПИСОК УСЛУГ}

2. ПРАВА И ОБЯЗАННОСТИ СТОРОН
2.1. Исполнитель обязан:
2.1.1. Разработать программу и смету мероприятия и согласовать ее с Заказчиком.
2.1.2. Согласовать с Заказчиком список лиц, приглашенных для участия в мероприятии.
2.1.3. Заключить договоры с привлеченными для участия в мероприятии третьими лицами.
2.1.4. Организовать надлежащее техническое обеспечение мероприятия.
2.1.5. Обеспечить соблюдение утвержденной программы мероприятия всеми участниками, обеспечить порядок на мероприятии.
2.1.6. По окончании мероприятия представить Заказчику для подписания Акт об оказании услуг (Приложение N 1 к настоящему Договору).
2.2. Исполнитель вправе:
2.2.1. Получать от Заказчика любую информацию, необходимую для выполнения своих обязательств по настоящему Договору.
2.2.2. Самостоятельно определять порядок оказания услуг по настоящему Договору.
2.2.3. Отказаться от исполнения обязательств по настоящему Договору при условии полного возмещения Заказчику убытков, причиненных таким отказом.
2.3. Заказчик обязан:
2.3.1. Предоставить для подготовки мероприятия необходимую информацию, а именно: место проведения, точную дату и время проведения, контакты ответственных лиц.
2.3.2. Оплатить услуги Исполнителя в порядке и сроки, которые установлены настоящим Договором.
2.3.3. В течение 7 дней с даты получения от Исполнителя Акта об оказании услуг подписать его либо представить мотивированный отказ от подписания Акта. При оказании услуг с недостатками Заказчик указывает это в Акте. В случае если Акт не будет подписан либо Заказчиком не будет представлен мотивированный отказ от его подписания в течение срока, указанного в настоящем пункте, услуги считаются принятыми Заказчиком без замечаний на следующий день после истечения срока, установленного настоящим пунктом.
2.4. Заказчик вправе:
2.4.1. Осуществлять контроль за ходом оказания услуг, не вмешиваясь при этом в деятельность Исполнителя.
2.4.2. Получать от Исполнителя разъяснения, связанные с оказанием услуг, в течение 3 рабочих дней с момента предъявления соответствующего требования.
2.4.3. Отказаться от исполнения настоящего Договора при условии оплаты Исполнителю фактически оказанных им Заказчику услуг на момент такого отказа.
2.4.4. В случае если услуги оказаны с недостатками, потребовать:
- безвозмездного устранения недостатков,
- соразмерного уменьшения стоимости услуг.

3. СТОИМОСТЬ УСЛУГ И ПОРЯДОК РАСЧЕТОВ
3.1. Стоимость услуг Исполнителя по настоящему Договору составляет {ДОГОВОРНАЯ СУММА} рублей, без НДС.
3.2. Оплата услуг Исполнителя осуществляется путем перечисления денежных средств единовременно Заказчиком на банковский счет Исполнителя в течение 7 банковских дней после подписания настоящего Договора.
3.3. Оплата услуг Исполнителя может осуществляться путем перечисления денежных средств на банковский счет Исполнителя, указанный в настоящем Договоре, или путем внесения наличных денежных средств в кассу Исполнителя.

4. ОТВЕТСТВЕННОСТЬ СТОРОН И ФОРС-МАЖОРНЫЕ ОБСТОЯТЕЛЬСТВА
4.1. За неисполнение или ненадлежащее исполнение обязательств по настоящему Договору Стороны несут ответственность, предусмотренную действующим законодательством Российской Федерации.
4.2. В случае нарушения сроков оказания услуг Заказчик вправе потребовать уплаты пеней в размере 10% от стоимости услуг за каждый час просрочки.
4.3. В случае несвоевременной оплаты Заказчиком услуг Исполнителя Исполнитель вправе потребовать уплаты пеней в размере 10% от не уплаченной в срок суммы за каждый день просрочки.
4.4. Уплата пеней не освобождает Стороны от исполнения своих обязательств по настоящему Договору.
4.5. Стороны освобождаются от ответственности за частичное или полное неисполнение обязательств по настоящему Договору, если это неисполнение явилось следствием обстоятельств непреодолимой силы, возникших после заключения настоящего Договора в результате обстоятельств чрезвычайного характера, которые Стороны не могли предвидеть или предотвратить.
4.6. При наступлении обстоятельств, указанных в п. 4.5 настоящего Договора, каждая Сторона должна без промедления известить о них в письменном виде другую Сторону.
4.7. Извещение должно содержать данные о характере обстоятельств, а также официальные документы, удостоверяющие наличие этих обстоятельств и по возможности дающие оценку их влияния на возможность исполнения Стороной своих обязательств по настоящему Договору.
4.8. В случае наступления обстоятельств, предусмотренных в п. 4.5 настоящего Договора, срок выполнения Стороной обязательств по настоящему Договору отодвигается соразмерно времени, в течение которого действуют эти обстоятельства и их последствия.
4.9. Если наступившие обстоятельства, перечисленные в п. 4.5 настоящего Договора, и их последствия продолжают действовать более 7 дней, Стороны проводят дополнительные переговоры для выявления приемлемых альтернативных способов исполнения настоящего Договора.

5. РАЗРЕШЕНИЕ СПОРОВ
5.1. Все споры и разногласия, которые могут возникнуть при исполнении условий настоящего Договора, Стороны будут стремиться разрешать путем переговоров.
5.2. Споры, не урегулированные путем переговоров, разрешаются в судебном порядке, установленном действующим законодательством Российской Федерации.

6. СРОК ДЕЙСТВИЯ ДОГОВОРА. ПОРЯДОК ИЗМЕНЕНИЯ И РАСТОРЖЕНИЯ ДОГОВОРА
6.1. Настоящий Договор вступает в силу с момента подписания его обеими Сторонами и действует до момента исполнения Сторонами всех взятых на себя обязательств.
6.2. Условия настоящего Договора могут быть изменены по взаимному согласию Сторон путем подписания письменного соглашения.
6.3. Настоящий Договор может быть расторгнут по соглашению Сторон либо по иным основаниям, установленным настоящим Договором и действующим законодательством Российской Федерации.

7. КОНФИДЕНЦИАЛЬНОСТЬ
7.1. Любая информация, которая передается Сторонами друг другу в период действия настоящего Договора и разглашение которой может нанести убытки любой из Сторон, является конфиденциальной и не подлежит разглашению третьим лицам, за исключением случаев, предусмотренных действующим законодательством Российской Федерации.

8. ЗАКЛЮЧИТЕЛЬНЫЕ ПОЛОЖЕНИЯ
8.1. Стороны обязуются письменно извещать друг друга о смене реквизитов, адресов и иных существенных изменениях.
8.2. Настоящий Договор составлен в двух экземплярах, имеющих равную юридическую силу, по одному для каждой из Сторон.
8.3. Ни одна из Сторон не вправе передавать свои права и обязанности по настоящему Договору третьим лицам без письменного согласия другой Стороны.
8.4. Во всем остальном, что не урегулировано настоящим Договором, Стороны руководствуются действующим законодательством Российской Федерации.
8.5. Приложения:
8.5.1. Акт об оказании услуг (Приложение N 1).

9. АДРЕСА И РЕКВИЗИТЫ СТОРОН
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

const getOrderLocationName = (order, locationTitle) => {
  if (!order) return EMPTY_VALUE
  if (order.placeType === 'company_location') {
    return locationTitle || order.customAddress || 'Площадка компании'
  }
  return 'Выезд к клиенту'
}

const buildPartyContractVariables = ({
  order,
  client,
  serviceTitles,
  companyRequisites = {},
  locationTitle = '',
  docMeta = {},
}) => {
  const contractDateRaw = docMeta?.contractDate
  const contractDate =
    typeof contractDateRaw === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(contractDateRaw)
      ? (() => {
          const [year, month, day] = contractDateRaw.split('-')
          return `${day}.${month}.${year}`
        })()
      : formatDate(new Date())

  const eventDateDateOnly = order?.eventDate
    ? formatDate(order.eventDate)
    : EMPTY_VALUE
  const eventDateDateTime = order?.eventDate
    ? formatDateTime(order.eventDate)
    : EMPTY_VALUE
  const eventTimeOnly = order?.eventDate
    ? (() => {
        const d = new Date(order.eventDate)
        return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      })()
    : EMPTY_VALUE

  const orderAddress = getOrderAddress(order)
  const locationName = getOrderLocationName(order, locationTitle)
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
  const providerStatusLabel =
    providerStatusRaw === 'self_employed'
      ? 'Самозанятого'
      : 'Индивидуального предпринимателя'
  const providerFullName = clean(
    companyRequisites?.providerFullName ||
      companyRequisites?.providerDisplayName
  )
  const providerDisplayName = clean(
    companyRequisites?.providerDisplayName ||
      companyRequisites?.providerFullName
  )
  const providerOgrnip = clean(companyRequisites?.providerOgrnip)
  const providerBasis =
    providerStatusRaw === 'self_employed'
      ? 'применения специального налогового режима «Налог на профессиональный доход»'
      : providerOgrnip
        ? `ОГРНИП ${providerOgrnip}`
        : 'Устава'
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

  const providerRequisitesLines = [
    `ИНН: ${providerInn}`,
    `Банк: ${providerBank}`,
    `БИК: ${providerBik}`,
    `р/с: ${providerCheckingAccount}`,
    `к/с: ${providerCorrespondentAccount}`,
    `Юр. адрес: ${providerLegalAddress}`,
  ]
  if (providerStatusRaw === 'individual_entrepreneur' && providerOgrnip) {
    providerRequisitesLines.splice(1, 0, `ОГРНИП: ${providerOgrnip}`)
  }
  const providerRequisites = providerRequisitesLines.join('\n')

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

  const contractSumWords = amountToWordsRu(contractSum)
  const contractSumWithWords = `${formatMoneyNoCurrency(contractSum)} (${contractSumWords})`

  const clientLegalName = getClientLegalName(client)
  const clientRows = [
    { key: 'ФИО', value: getClientName(client) },
    { key: 'ИНН', value: clean(client?.inn, EMPTY_VALUE) },
    { key: 'КПП', value: clean(client?.kpp, EMPTY_VALUE) },
    { key: 'ОГРН/ОГРНИП', value: clean(client?.ogrn, EMPTY_VALUE) },
    { key: 'Банк', value: clean(client?.bankName, EMPTY_VALUE) },
    { key: 'БИК', value: clean(client?.bik, EMPTY_VALUE) },
    {
      key: 'р/с',
      value: clean(client?.checkingAccount, EMPTY_VALUE),
    },
    {
      key: 'к/с',
      value: clean(client?.correspondentAccount, EMPTY_VALUE),
    },
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

  // Build staff/performers list
  const assignedStaff = Array.isArray(order?.assignedStaff)
    ? order.assignedStaff
    : []
  const performersList =
    assignedStaff.length > 0
      ? assignedStaff
          .map((s) => s.name || s.staffId || 'Исполнитель')
          .join(', ')
      : 'Сотрудники компании'

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

  const values = {
    'НОМЕР ДОКУМЕНТА': documentNumber,
    'ОСНОВНОЙ ГОРОД': baseTown,
    'ДАТА ДОГОВОРА': contractDate,
    'НАИМЕНОВАНИЕ КЛИЕНТА': clientLegalName,
    'ФИО КЛИЕНТА': getClientName(client),
    'НАИМЕНОВАНИЕ КОМПАНИИ': providerDisplayName,
    'ФИО РУКОВОДИТЕЛЯ': providerFullName,
    'СТАТУС КОМПАНИИ': providerStatusLabel,
    'ОСНОВАНИЕ КОМПАНИИ': providerBasis,
    'РЕКВИЗИТЫ КОМПАНИИ': providerRequisites,
    'ИНН КОМПАНИИ': providerInn,
    'ОГРНИП КОМПАНИИ': providerOgrnip,
    'БАНК КОМПАНИИ': providerBank,
    'БИК КОМПАНИИ': providerBik,
    'РАСЧЕТНЫЙ СЧЕТ КОМПАНИИ': providerCheckingAccount,
    'КОРР СЧЕТ КОМПАНИИ': providerCorrespondentAccount,
    'ЮР АДРЕС КОМПАНИИ': providerLegalAddress,
    ДАТА: eventDateDateOnly,
    'ДАТА СОБЫТИЯ': eventDateDateTime,
    'ВРЕМЯ СОБЫТИЯ': eventTimeOnly,
    'АДРЕС СОБЫТИЯ': orderAddress,
    'МЕСТО ПРОВЕДЕНИЯ': locationName,
    'СПИСОК УСЛУГ': servicesText,
    'ДОГОВОРНАЯ СУММА': contractSumWithWords,
    ИСПОЛНИТЕЛИ: performersList,
    'КОНТАКТЫ КЛИЕНТА': getClientContacts(client),
    'РЕКВИЗИТЫ КЛИЕНТА': getClientRequisites(client),
    ИНН: clean(client?.inn, EMPTY_VALUE),
    КПП: clean(client?.kpp, EMPTY_VALUE),
    ОГРН: clean(client?.ogrn, EMPTY_VALUE),
    БАНК: clean(client?.bankName, EMPTY_VALUE),
    БИК: clean(client?.bik, EMPTY_VALUE),
    'РАСЧЕТНЫЙ СЧЕТ': clean(client?.checkingAccount, EMPTY_VALUE),
    'КОРР СЧЕТ': clean(client?.correspondentAccount, EMPTY_VALUE),
    'ЮР АДРЕС': clean(client?.legalAddress, EMPTY_VALUE),
    'РЕКВИЗИТЫ СТОРОН': partiesTablesValue,
    'ПОДПИСИ СТОРОН': buildPartiesSignaturesText({
      performerFullName: providerFullName,
      clientFullName: getClientName(client),
      mode: requisitesSidesMode,
    }),
    'НАИМЕНОВАНИЕ КЛИЕНТА (КРАТКО)': getClientLegalName(client),
  }

  return values
}

const replaceTemplateVariables = (template, values) => {
  const source =
    typeof template === 'string' && template.trim()
      ? template
      : DEFAULT_PARTY_CONTRACT_TEMPLATE

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

const partyGenerateContractTemplate = ({
  order,
  client,
  serviceTitles = [],
  companyRequisites = {},
  locationTitle = '',
  template = '',
  docMeta = {},
}) => {
  const variables = buildPartyContractVariables({
    order,
    client,
    serviceTitles,
    companyRequisites,
    locationTitle,
    docMeta,
  })
  return replaceTemplateVariables(template, variables)
}

const getPartyContractTemplateVariablesMap = ({
  order,
  client,
  serviceTitles = [],
  companyRequisites = {},
  locationTitle = '',
  docMeta = {},
}) =>
  buildPartyContractVariables({
    order,
    client,
    serviceTitles,
    companyRequisites,
    locationTitle,
    docMeta,
  })

export {
  DEFAULT_PARTY_CONTRACT_TEMPLATE,
  PARTY_CONTRACT_TEMPLATE_VARIABLES,
  getPartyContractTemplateVariablesMap,
}
export default partyGenerateContractTemplate
