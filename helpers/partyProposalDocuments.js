const formatDate = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleDateString('ru-RU')
}

const formatDateTime = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatMoney = (value) =>
  `${Number(value || 0).toLocaleString('ru-RU', {
    minimumFractionDigits: Number(value || 0) % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })} ₽`

const plural = (number, one, few, many) => {
  const mod100 = number % 100
  const mod10 = number % 10
  if (mod100 >= 11 && mod100 <= 14) return many
  if (mod10 === 1) return one
  if (mod10 >= 2 && mod10 <= 4) return few
  return many
}

const unitsMale = [
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
const unitsFemale = [
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
const teens = [
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
const tens = [
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
const hundreds = [
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

const tripletToWords = (value, female = false) => {
  const number = Math.max(0, Math.floor(value))
  const words = []
  const hundred = Math.floor(number / 100)
  const ten = Math.floor((number % 100) / 10)
  const unit = number % 10
  if (hundred) words.push(hundreds[hundred])
  if (ten === 1) words.push(teens[unit])
  else {
    if (ten > 1) words.push(tens[ten])
    if (unit) words.push((female ? unitsFemale : unitsMale)[unit])
  }
  return words.filter(Boolean).join(' ')
}

export const partyProposalAmountToWords = (value) => {
  const amount = Math.max(0, Math.floor(Number(value) || 0))
  if (amount === 0) return 'ноль рублей'
  const millions = Math.floor(amount / 1000000)
  const thousands = Math.floor((amount % 1000000) / 1000)
  const rest = amount % 1000
  const words = []
  if (millions) {
    words.push(tripletToWords(millions))
    words.push(plural(millions, 'миллион', 'миллиона', 'миллионов'))
  }
  if (thousands) {
    words.push(tripletToWords(thousands, true))
    words.push(plural(thousands, 'тысяча', 'тысячи', 'тысяч'))
  }
  if (rest) words.push(tripletToWords(rest))
  words.push(plural(amount, 'рубль', 'рубля', 'рублей'))
  return words.join(' ')
}

const encodeItemsTableMarker = (proposal) => {
  try {
    return `[[PROPOSAL_ITEMS:${encodeURIComponent(
      JSON.stringify({
        items: proposal.items || [],
        subtotal: proposal.subtotal || 0,
        discount: proposal.discount || 0,
        total: proposal.total || 0,
      })
    )}]]`
  } catch {
    return ''
  }
}

export const getPartyProposalTemplateVariablesMap = (proposal = {}) => ({
  'НОМЕР КП': proposal.number || '',
  'ВЕРСИЯ КП': proposal.version || '',
  'ДАТА КП': formatDate(proposal.proposalDate),
  'СРОК ДЕЙСТВИЯ': formatDate(proposal.validUntil),
  'НАИМЕНОВАНИЕ КОМПАНИИ': proposal.senderSnapshot?.displayName || '',
  'ФИО ПОДПИСАНТА': proposal.senderSnapshot?.fullName || '',
  'ИНН КОМПАНИИ': proposal.senderSnapshot?.inn || '',
  'ОГРН КОМПАНИИ': proposal.senderSnapshot?.ogrn || '',
  'ЮР АДРЕС КОМПАНИИ': proposal.senderSnapshot?.legalAddress || '',
  'АДРЕСАТ ОРГАНИЗАЦИЯ': proposal.recipientSnapshot?.displayName || '',
  'АДРЕСАТ ДОЛЖНОСТЬ': proposal.recipientSnapshot?.position || '',
  'АДРЕСАТ ФИО': proposal.recipientSnapshot?.fullName || '',
  'НОМЕР ЗАПРОСА': proposal.requestNumber || '',
  'ДАТА ЗАПРОСА': formatDate(proposal.requestDate),
  'НАЗВАНИЕ МЕРОПРИЯТИЯ': proposal.eventSnapshot?.title || '',
  'ДАТА МЕРОПРИЯТИЯ': formatDateTime(proposal.eventSnapshot?.date),
  'АДРЕС МЕРОПРИЯТИЯ': proposal.eventSnapshot?.address || '',
  'ТАБЛИЦА УСЛУГ': encodeItemsTableMarker(proposal),
  'ИТОГОВАЯ СУММА': formatMoney(proposal.total),
  'СУММА ПРОПИСЬЮ': partyProposalAmountToWords(proposal.total),
  'НАЛОГОВАЯ ФОРМУЛИРОВКА': proposal.taxText || '',
  'УСЛОВИЯ ОПЛАТЫ': proposal.paymentTerms || '',
  'ВКЛЮЧЕНО В СТОИМОСТЬ': proposal.includedText || '',
  'ДОПОЛНИТЕЛЬНЫЕ УСЛОВИЯ': proposal.additionalTerms || '',
})

const downloadBlob = (blob, fileName) => {
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.URL.revokeObjectURL(url)
}

export const exportPartyProposalDocx = async (proposal = {}) => {
  if (typeof window === 'undefined') return false
  const {
    AlignmentType,
    BorderStyle,
    Document,
    Packer,
    Paragraph,
    Table,
    TableCell,
    TableRow,
    TextRun,
    WidthType,
  } = await import('docx')

  const border = { style: BorderStyle.SINGLE, size: 4, color: 'B6C9D8' }
  const cell = (text, options = {}) =>
    new TableCell({
      width: options.width
        ? { size: options.width, type: WidthType.PERCENTAGE }
        : undefined,
      columnSpan: options.columnSpan,
      shading: options.header ? { fill: 'EAF6FB' } : undefined,
      margins: { top: 100, bottom: 100, left: 120, right: 120 },
      borders: {
        top: border,
        bottom: border,
        left: border,
        right: border,
      },
      children: [
        new Paragraph({
          alignment: options.align || AlignmentType.LEFT,
          children: [new TextRun({ text: String(text ?? ''), bold: options.bold })],
        }),
      ],
    })

  const itemRows = (proposal.items || []).map(
    (item, index) =>
      new TableRow({
        children: [
          cell(index + 1, { width: 7, align: AlignmentType.CENTER }),
          cell(item.title, { width: 43 }),
          cell(`${item.quantity} ${item.unit}`, {
            width: 15,
            align: AlignmentType.CENTER,
          }),
          cell(formatMoney(item.unitPrice), {
            width: 17,
            align: AlignmentType.RIGHT,
          }),
          cell(formatMoney(item.total), {
            width: 18,
            align: AlignmentType.RIGHT,
          }),
        ],
      })
  )

  const sender = proposal.senderSnapshot || {}
  const recipient = proposal.recipientSnapshot || {}
  const event = proposal.eventSnapshot || {}
  const children = [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: sender.displayName || '', bold: true })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      text: [sender.inn ? `ИНН ${sender.inn}` : '', sender.ogrn ? `ОГРН/ОГРНИП ${sender.ogrn}` : '']
        .filter(Boolean)
        .join(', '),
    }),
    new Paragraph({ text: ' ' }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      text: [recipient.position, recipient.displayName, recipient.fullName]
        .filter(Boolean)
        .join('\n'),
    }),
    new Paragraph({ text: ' ' }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ № ${proposal.number || ''}`,
          bold: true,
          size: 28,
          color: '0A5B78',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      text: `от ${formatDate(proposal.proposalDate)}`,
    }),
    new Paragraph({ text: ' ' }),
    ...(proposal.requestNumber || proposal.requestDate
      ? [
          new Paragraph({
            text: `В ответ на запрос${proposal.requestNumber ? ` № ${proposal.requestNumber}` : ''}${proposal.requestDate ? ` от ${formatDate(proposal.requestDate)}` : ''} направляем расчет стоимости услуг.`,
          }),
        ]
      : []),
    new Paragraph({
      text: [
        event.title ? `Мероприятие: ${event.title}.` : '',
        event.date ? `Дата и время: ${formatDateTime(event.date)}.` : '',
        event.address ? `Место проведения: ${event.address}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    }),
    new Paragraph({ text: ' ' }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            cell('№', { header: true, bold: true, width: 7 }),
            cell('Наименование услуги', { header: true, bold: true, width: 43 }),
            cell('Количество', { header: true, bold: true, width: 15 }),
            cell('Цена', { header: true, bold: true, width: 17 }),
            cell('Стоимость', { header: true, bold: true, width: 18 }),
          ],
        }),
        ...itemRows,
        new TableRow({
          children: [
            cell('Итого', { columnSpan: 4, bold: true, align: AlignmentType.RIGHT }),
            cell(formatMoney(proposal.total), { bold: true, align: AlignmentType.RIGHT }),
          ],
        }),
      ],
    }),
    new Paragraph({ text: ' ' }),
    new Paragraph({
      text: `Всего: ${formatMoney(proposal.total)} (${partyProposalAmountToWords(proposal.total)}). ${proposal.taxText || ''}`,
    }),
    ...(proposal.paymentTerms
      ? [new Paragraph({ text: `Условия оплаты: ${proposal.paymentTerms}` })]
      : []),
    ...(proposal.includedText
      ? [new Paragraph({ text: `В стоимость включено: ${proposal.includedText}` })]
      : []),
    ...(proposal.additionalTerms
      ? [new Paragraph({ text: proposal.additionalTerms })]
      : []),
    ...(proposal.validUntil
      ? [
          new Paragraph({
            text: `Предложение действительно до ${formatDate(proposal.validUntil)}.`,
          }),
        ]
      : []),
    new Paragraph({ text: ' ' }),
    new Paragraph({
      text: `${sender.position || 'Исполнитель'} __________________ ${sender.fullName || sender.displayName || ''}`,
    }),
  ]

  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  downloadBlob(
    blob,
    `Коммерческое предложение №${proposal.number || 'без номера'} v${proposal.version || 1}.docx`
  )
  return true
}

const escapeHtml = (value) =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')

export const printPartyProposal = (proposal = {}) => {
  if (typeof window === 'undefined') return false
  const popup = window.open('', '_blank')
  if (!popup) return false
  popup.opener = null
  const rows = (proposal.items || [])
    .map(
      (item, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(item.title)}</td><td>${escapeHtml(item.quantity)} ${escapeHtml(item.unit)}</td><td class="num">${escapeHtml(formatMoney(item.unitPrice))}</td><td class="num">${escapeHtml(formatMoney(item.total))}</td></tr>`
    )
    .join('')
  const sender = proposal.senderSnapshot || {}
  const recipient = proposal.recipientSnapshot || {}
  const event = proposal.eventSnapshot || {}
  popup.document.write(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>КП №${escapeHtml(proposal.number)}</title><style>@page{size:A4;margin:18mm 15mm 18mm 25mm}*{box-sizing:border-box}body{font:12pt "Times New Roman",serif;color:#111;margin:0}.sender,.recipient{text-align:right}.recipient{margin-top:28px}.title{text-align:center;color:#063f59;font-size:15pt;font-weight:700;margin:28px 0 4px}.date{text-align:center;margin-bottom:24px}.context{line-height:1.45}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{border:1px solid #555;padding:7px 6px;vertical-align:top}th{background:#eaf6fb}.num{text-align:right;white-space:nowrap}.total{font-weight:700}.terms{margin-top:10px;line-height:1.45}.signature{margin-top:36px}@media print{button{display:none}}</style></head><body><div class="sender"><strong>${escapeHtml(sender.displayName)}</strong><br>${sender.inn ? `ИНН ${escapeHtml(sender.inn)}` : ''}${sender.ogrn ? `, ОГРН/ОГРНИП ${escapeHtml(sender.ogrn)}` : ''}</div><div class="recipient">${escapeHtml(recipient.position)}<br>${escapeHtml(recipient.displayName)}<br>${escapeHtml(recipient.fullName)}</div><div class="title">КОММЕРЧЕСКОЕ ПРЕДЛОЖЕНИЕ № ${escapeHtml(proposal.number)}</div><div class="date">от ${escapeHtml(formatDate(proposal.proposalDate))}</div><div class="context">${proposal.requestNumber || proposal.requestDate ? `В ответ на запрос${proposal.requestNumber ? ` № ${escapeHtml(proposal.requestNumber)}` : ''}${proposal.requestDate ? ` от ${escapeHtml(formatDate(proposal.requestDate))}` : ''} направляем расчет стоимости услуг.<br>` : ''}${event.title ? `<strong>Мероприятие:</strong> ${escapeHtml(event.title)}.<br>` : ''}${event.date ? `<strong>Дата и время:</strong> ${escapeHtml(formatDateTime(event.date))}.<br>` : ''}${event.address ? `<strong>Место:</strong> ${escapeHtml(event.address)}.` : ''}</div><table><thead><tr><th>№</th><th>Наименование услуги</th><th>Количество</th><th>Цена</th><th>Стоимость</th></tr></thead><tbody>${rows}<tr class="total"><td colspan="4">Итого</td><td class="num">${escapeHtml(formatMoney(proposal.total))}</td></tr></tbody></table><div class="terms">Всего: ${escapeHtml(formatMoney(proposal.total))} (${escapeHtml(partyProposalAmountToWords(proposal.total))}). ${escapeHtml(proposal.taxText)}${proposal.paymentTerms ? `<br><strong>Условия оплаты:</strong> ${escapeHtml(proposal.paymentTerms)}` : ''}${proposal.includedText ? `<br><strong>В стоимость включено:</strong> ${escapeHtml(proposal.includedText)}` : ''}${proposal.additionalTerms ? `<br>${escapeHtml(proposal.additionalTerms)}` : ''}${proposal.validUntil ? `<br>Предложение действительно до ${escapeHtml(formatDate(proposal.validUntil))}.` : ''}</div><div class="signature">${escapeHtml(sender.position || 'Исполнитель')} __________________ ${escapeHtml(sender.fullName || sender.displayName)}</div><script>window.addEventListener('load',()=>window.print())<\/script></body></html>`)
  popup.document.close()
  return true
}

export { formatDate as formatPartyProposalDate, formatMoney as formatPartyProposalMoney }
