const splitToParagraphs = (text) =>
  String(text ?? '')
    .replace(/\r/g, '')
    .split('\n')

const findFirstNonEmptyIndex = (lines) =>
  lines.findIndex((line) => String(line ?? '').trim().length > 0)

const splitCityDateLine = (line) => {
  const value = String(line ?? '').trim()
  if (!value) return null
  const dateMatch = value.match(/(\d{2}\.\d{2}\.\d{4})\.?$/)
  if (!dateMatch) return null
  const date = dateMatch[1]
  const left = value.slice(0, dateMatch.index).trim()
  return { left: left || value, right: date }
}

const isTopLevelSectionHeader = (line) =>
  /^\d+\.\s+.+$/.test(String(line ?? '').trim())

const PARTIES_TABLES_MARKER_REGEX = /\[\[PARTIES_TABLES:([^[\]]+)\]\]/
const PLACEHOLDER_VALUE_REGEX = /^_+$/
const CM_TO_DXA = 567
const FIRST_COLUMN_WIDTH_DXA = Math.round(2.5 * CM_TO_DXA)
const TABLE_GAP_WIDTH_DXA = Math.round(0.5 * CM_TO_DXA)
const CELL_MARGIN_DXA = Math.round(0.1 * CM_TO_DXA)

const parseTablesMarker = (line) => {
  const input = String(line ?? '')
  const match = input.match(PARTIES_TABLES_MARKER_REGEX)
  if (!match?.[1]) return null
  try {
    const decoded = decodeURIComponent(match[1])
    const parsed = JSON.parse(decoded)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch (error) {
    return null
  }
}

const isPlaceholderValue = (value) => {
  const normalized = String(value ?? '').trim()
  if (!normalized) return true
  return PLACEHOLDER_VALUE_REGEX.test(normalized)
}

const normalizeCellValue = (value) => {
  if (isPlaceholderValue(value)) return ''
  return String(value ?? '')
}

const cellMargins = {
  top: CELL_MARGIN_DXA,
  bottom: CELL_MARGIN_DXA,
  left: CELL_MARGIN_DXA,
  right: CELL_MARGIN_DXA,
}

const exportContractTemplateDocx = async (text, fileName = 'dogovor.docx') => {
  if (typeof window === 'undefined') return

  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    Table,
    TableRow,
    TableCell,
    BorderStyle,
    AlignmentType,
    TabStopType,
    WidthType,
  } = await import('docx')

  const makeTableRow = (key, value) =>
    new TableRow({
      children: [
        new TableCell({
          width: { size: FIRST_COLUMN_WIDTH_DXA, type: WidthType.DXA },
          margins: cellMargins,
          children: [new Paragraph({ text: key || ' ' })],
        }),
        new TableCell({
          margins: cellMargins,
          children: [new Paragraph({ text: value || ' ' })],
        }),
      ],
    })

  const makePartyTable = (party) => {
    const rows = Array.isArray(party?.rows) ? party.rows : []
    const title = String(party?.title ?? '').trim()

    return new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        ...(title
          ? [
              new TableRow({
                children: [
                  new TableCell({
                    columnSpan: 2,
                    margins: cellMargins,
                    children: [new Paragraph({ text: title })],
                  }),
                ],
              }),
            ]
          : []),
        ...rows.map((row) =>
          makeTableRow(
            String(row?.key ?? ''),
            normalizeCellValue(row?.value)
          )
        ),
      ],
    })
  }

  const makeCombinedPartiesTable = (performer, customer) =>
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
        insideHorizontal: {
          style: BorderStyle.NONE,
          size: 0,
          color: 'FFFFFF',
        },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 49, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              },
              children: [makePartyTable(performer)],
            }),
            new TableCell({
              width: { size: TABLE_GAP_WIDTH_DXA, type: WidthType.DXA },
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              },
              children: [new Paragraph({ text: ' ' })],
            }),
            new TableCell({
              width: { size: 49, type: WidthType.PERCENTAGE },
              borders: {
                top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
                right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              },
              children: [makePartyTable(customer)],
            }),
          ],
        }),
      ],
    })

  const lines = splitToParagraphs(text)
  const titleIndex = findFirstNonEmptyIndex(lines)
  const cityDateIndex = titleIndex >= 0 ? titleIndex + 1 : -1

  const children = []

  lines.forEach((line, index) => {
    const safeLine = line || ' '

    if (index === titleIndex) {
      children.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: safeLine, bold: true })],
        })
      )
      return
    }

    if (index === cityDateIndex) {
      const parsed = splitCityDateLine(line)
      if (parsed) {
        children.push(
          new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: 9000 }],
            children: [
              new TextRun(parsed.left),
              new TextRun('\t'),
              new TextRun(parsed.right),
            ],
          })
        )
        return
      }
    }

    const tablesData = parseTablesMarker(line)
    if (tablesData) {
      const performer = tablesData?.performer
      const customer = tablesData?.customer
      if (performer && customer) {
        children.push(makeCombinedPartiesTable(performer, customer))
      } else if (performer) {
        children.push(makePartyTable(performer))
      } else if (customer) {
        children.push(makePartyTable(customer))
      }
      return
    }

    if (isTopLevelSectionHeader(safeLine)) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: safeLine, bold: true })],
        })
      )
      return
    }

    children.push(new Paragraph({ text: safeLine }))
  })

  const doc = new Document({
    sections: [
      {
        children,
      },
    ],
  })

  const blob = await Packer.toBlob(doc)
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

export default exportContractTemplateDocx
