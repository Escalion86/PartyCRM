export const PARTY_BUILT_IN_CONTRACT_TEMPLATES = [
  {
    id: 'standard',
    name: 'Стандартный договор',
    description: 'Для организации мероприятия с условиями оплаты, приёмки и переноса.',
    fileName: 'partycrm-standard-contract.docx',
  },
  {
    id: 'short',
    name: 'Краткий договор',
    description: 'Компактный образец с услугами, датой и местом проведения, ценой и подписями.',
    fileName: 'partycrm-short-contract.docx',
  },
  {
    id: 'offsite',
    name: 'Выездное мероприятие',
    description: 'Для работы на площадке заказчика. Включает подготовку, доступ и оборудование.',
    fileName: 'partycrm-offsite-contract.docx',
  },
]

const services = 'Состав услуг — {СПИСОК_УСЛУГ}.'
const eventDetails = 'Дата и время начала — {ДАТА_СОБЫТИЯ}. Место проведения — {АДРЕС_СОБЫТИЯ}.'
const payment = 'Общая стоимость услуг составляет {ДОГОВОРНАЯ_СУММА} рублей.'
const paymentSchedule = 'Сроки, суммы и способ оплаты — ____________________________________________.'
const changes = 'Изменения состава услуг, даты, времени или места стороны согласуют письменно. При согласовании стороны уточняют, меняется ли стоимость.'
const acceptance = 'По окончании мероприятия стороны подтверждают оказанные услуги актом или иным согласованным способом. Заказчик сообщает о замечаниях, чтобы стороны могли обсудить их и согласовать дальнейшие действия.'

const contractSections = {
  standard: [
    [
      'Предмет договора',
      services,
      eventDetails,
      'Исполнитель оказывает согласованные услуги, а Заказчик принимает и оплачивает их.',
    ],
    [
      'Подготовка и проведение',
      'Стороны заранее согласуют программу, продолжительность и условия работы на площадке.',
      'Заказчик передаёт сведения, необходимые для подготовки, и сообщает об изменениях, которые могут повлиять на проведение мероприятия. Исполнитель сообщает о готовности к мероприятию и организует оказание услуг в согласованное время.',
    ],
    [
      'Стоимость и оплата',
      payment,
      paymentSchedule,
      'Дополнительные услуги и их стоимость стороны согласуют до начала их оказания.',
    ],
    [
      'Приёмка, изменения и перенос',
      acceptance,
      changes,
      'Если провести мероприятие в согласованный срок невозможно, сторона, которой стало известно об этом, уведомляет другую сторону. Стороны обсуждают новую дату и порядок расчётов.',
    ],
  ],
  short: [
    [
      'Услуги и мероприятие',
      'Исполнитель оказывает перечисленные ниже услуги. Заказчик принимает и оплачивает их.',
      services,
      eventDetails,
    ],
    ['Оплата и согласование изменений', payment, paymentSchedule, changes],
  ],
  offsite: [
    [
      'Услуги на выезде',
      'Исполнитель оказывает согласованные услуги на площадке мероприятия. Заказчик принимает и оплачивает их.',
      services,
      eventDetails,
    ],
    [
      'Доступ и подготовка площадки',
      'До начала мероприятия стороны согласуют время доступа на площадку, порядок въезда и разгрузки, место для подготовки и время монтажа и демонтажа.',
      'Стороны заранее распределяют, кто предоставляет оборудование, мебель и электропитание. Заказчик передаёт Исполнителю правила площадки и контакты ответственного за доступ. Исполнитель сообщает о требованиях к подготовке и условиям работы.',
      'Контакт на площадке и особые условия — _____________________________________.',
    ],
    [
      'Стоимость и дополнительные работы',
      payment,
      paymentSchedule,
      'Расходы на выезд, аренду оборудования и другие работы сверх перечисленных услуг стороны согласуют до заказа этих работ.',
    ],
    [
      'Приёмка и перенос',
      acceptance,
      changes,
      'Если местом проведения станет другая площадка, стороны дополнительно согласуют доступ, оборудование и время подготовки.',
    ],
  ],
}

export const buildPartyBuiltInContractTemplateBuffer = async (id) => {
  const metadata = PARTY_BUILT_IN_CONTRACT_TEMPLATES.find((template) => template.id === id)
  if (!metadata) return null

  const {
    AlignmentType,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    Tab,
    TabStopType,
    TextRun,
  } = await import('docx')
  const heading = (text) => new Paragraph({ text, heading: HeadingLevel.HEADING_1, keepNext: true })
  const body = (text) => new Paragraph({ text })
  const doc = new Document({
    title: metadata.name,
    subject: metadata.description,
    styles: {
      default: {
        document: {
          run: { font: 'Times New Roman', size: 22, color: '171717' },
          paragraph: { spacing: { line: 274, after: 120 } },
        },
        title: {
          run: { font: 'Times New Roman', size: 29, bold: true, color: '171717' },
          paragraph: { spacing: { after: 210 } },
        },
        heading1: {
          run: { font: 'Times New Roman', size: 23, bold: true, color: '171717' },
          paragraph: { spacing: { before: 200, after: 90 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838 },
          margin: { top: 1020, right: 1120, bottom: 1020, left: 1320 },
        },
      },
      children: [
        new Paragraph({
          text: 'Договор оказания услуг № {НОМЕР_ДОКУМЕНТА}',
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
          keepNext: true,
        }),
        new Paragraph({
          children: [new TextRun({ children: ['г. {ОСНОВНОЙ_ГОРОД}', new Tab(), '{ДАТА_ДОГОВОРА}'] })],
          tabStops: [{ type: TabStopType.RIGHT, position: 9466 }],
        }),
        body('{НАИМЕНОВАНИЕ_КОМПАНИИ} (Исполнитель) и {НАИМЕНОВАНИЕ_КЛИЕНТА} (Заказчик) заключили настоящий договор.'),
        ...contractSections[id].flatMap(([title, ...paragraphs], index) => [
          heading(`${index + 1}. ${title}`),
          ...paragraphs.map(body),
        ]),
        heading('Реквизиты и подписи сторон'),
        body('{РЕКВИЗИТЫ_СТОРОН}'),
        body('{ПОДПИСИ_СТОРОН}'),
      ],
    }],
  })

  return Packer.toBuffer(doc)
}
