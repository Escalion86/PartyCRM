const toDocxTemplateKey = (rawKey) =>
  String(rawKey ?? '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')

const toDocxtemplaterData = (variables) => {
  const entries = Object.entries(variables ?? {})
  const result = {}

  entries.forEach(([key, value]) => {
    const normalizedKey = toDocxTemplateKey(key)
    if (!normalizedKey) return
    result[normalizedKey] = value ?? ''
  })

  return result
}

const downloadBlob = (blob, fileName) => {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  window.URL.revokeObjectURL(url)
}

const base64ToUint8Array = (base64) => {
  const cleanBase64 = String(base64 ?? '').trim()
  if (!cleanBase64) return null
  const binary = window.atob(cleanBase64)
  const len = binary.length
  const bytes = new Uint8Array(len)
  for (let i = 0; i < len; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const MARKER_PARTIES_TABLES_REGEX = /\[\[PARTIES_TABLES:([^[\]]+)\]\]/
const MARKER_SIGNATURES_TABLE_REGEX = /\[\[SIGNATURES_TABLE:([^[\]]+)\]\]/
const WORD_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
const XML_NS = 'http://www.w3.org/XML/1998/namespace'

const parsePartiesMarker = (rawPayload) => {
  try {
    const decoded = decodeURIComponent(String(rawPayload ?? ''))
    const parsed = JSON.parse(decoded)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      performer: {
        title: String(parsed?.performer?.title ?? ''),
        rows: Array.isArray(parsed?.performer?.rows)
          ? parsed.performer.rows
          : [],
      },
      customer: {
        title: String(parsed?.customer?.title ?? ''),
        rows: Array.isArray(parsed?.customer?.rows) ? parsed.customer.rows : [],
      },
    }
  } catch (error) {
    return null
  }
}

const createWordElement = (doc, tag) => doc.createElementNS(WORD_NS, `w:${tag}`)
const setWordAttr = (node, name, value) =>
  node.setAttributeNS(WORD_NS, `w:${name}`, String(value))

const normalizeCellText = (value) => {
  const text = String(value ?? '').trim()
  if (!text) return ''
  if (/^_+$/.test(text)) return ''
  return text
}

const appendTextParagraph = (doc, parent, text = '') => {
  const paragraph = createWordElement(doc, 'p')
  const run = createWordElement(doc, 'r')
  const t = createWordElement(doc, 't')
  if (String(text).startsWith(' ') || String(text).endsWith(' ')) {
    t.setAttributeNS(XML_NS, 'xml:space', 'preserve')
  }
  t.textContent = String(text ?? '')
  run.appendChild(t)
  paragraph.appendChild(run)
  parent.appendChild(paragraph)
}

const applyTableBorders = (doc, table, borderValue = 'single') => {
  const tblPr = createWordElement(doc, 'tblPr')
  const tblW = createWordElement(doc, 'tblW')
  setWordAttr(tblW, 'w', '0')
  setWordAttr(tblW, 'type', 'auto')
  tblPr.appendChild(tblW)

  const tblBorders = createWordElement(doc, 'tblBorders')
  ;['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].forEach((name) => {
    const border = createWordElement(doc, name)
    setWordAttr(border, 'val', borderValue)
    setWordAttr(border, 'sz', borderValue === 'nil' ? '0' : '4')
    setWordAttr(border, 'space', '0')
    setWordAttr(border, 'color', borderValue === 'nil' ? 'FFFFFF' : '000000')
    tblBorders.appendChild(border)
  })
  tblPr.appendChild(tblBorders)
  table.appendChild(tblPr)
}

const setCellBorders = (doc, tcPr, borderValue = 'single') => {
  const tcBorders = createWordElement(doc, 'tcBorders')
  ;['top', 'left', 'bottom', 'right'].forEach((name) => {
    const border = createWordElement(doc, name)
    setWordAttr(border, 'val', borderValue)
    setWordAttr(border, 'sz', borderValue === 'nil' ? '0' : '4')
    setWordAttr(border, 'space', '0')
    setWordAttr(border, 'color', borderValue === 'nil' ? 'FFFFFF' : '000000')
    tcBorders.appendChild(border)
  })
  tcPr.appendChild(tcBorders)
}

const appendCell = (
  doc,
  row,
  { text = '', width = null, colSpan = null, borderValue = null }
) => {
  const cell = createWordElement(doc, 'tc')
  const tcPr = createWordElement(doc, 'tcPr')
  if (width) {
    const tcW = createWordElement(doc, 'tcW')
    setWordAttr(tcW, 'w', width)
    setWordAttr(tcW, 'type', 'dxa')
    tcPr.appendChild(tcW)
  }
  if (colSpan) {
    const gridSpan = createWordElement(doc, 'gridSpan')
    setWordAttr(gridSpan, 'val', colSpan)
    tcPr.appendChild(gridSpan)
  }
  if (borderValue) setCellBorders(doc, tcPr, borderValue)
  cell.appendChild(tcPr)
  appendTextParagraph(doc, cell, normalizeCellText(text) || ' ')
  row.appendChild(cell)
  return cell
}

const buildPartyInnerTableNode = (doc, party) => {
  const table = createWordElement(doc, 'tbl')
  applyTableBorders(doc, table, 'single')

  const tblGrid = createWordElement(doc, 'tblGrid')
  ;[1417, 3000].forEach((width) => {
    const gridCol = createWordElement(doc, 'gridCol')
    setWordAttr(gridCol, 'w', width)
    tblGrid.appendChild(gridCol)
  })
  table.appendChild(tblGrid)

  const headerRow = createWordElement(doc, 'tr')
  appendCell(doc, headerRow, {
    text: party?.title || '',
    colSpan: 2,
  })
  table.appendChild(headerRow)

  const rows = Array.isArray(party?.rows) ? party.rows : []
  const maxRows = Math.max(rows.length, 1)

  for (let i = 0; i < maxRows; i += 1) {
    const row = createWordElement(doc, 'tr')
    const item = rows[i] ?? {}
    appendCell(doc, row, { text: String(item?.key ?? ''), width: 1417 })
    appendCell(doc, row, {
      text: normalizeCellText(item?.value),
      width: 3000,
    })
    table.appendChild(row)
  }

  return table
}

const buildPartiesTableNode = (doc, payload) => {
  const outerTable = createWordElement(doc, 'tbl')
  applyTableBorders(doc, outerTable, 'nil')

  const outerGrid = createWordElement(doc, 'tblGrid')
  ;[4300, 300, 4300].forEach((width) => {
    const gridCol = createWordElement(doc, 'gridCol')
    setWordAttr(gridCol, 'w', width)
    outerGrid.appendChild(gridCol)
  })
  outerTable.appendChild(outerGrid)

  const row = createWordElement(doc, 'tr')

  const leftCell = appendCell(doc, row, { text: '', width: 4300, borderValue: 'nil' })
  leftCell.removeChild(leftCell.lastChild)
  leftCell.appendChild(buildPartyInnerTableNode(doc, payload?.performer))
  appendTextParagraph(doc, leftCell, ' ')

  appendCell(doc, row, { text: ' ', width: 300, borderValue: 'nil' })

  const rightCell = appendCell(doc, row, { text: '', width: 4300, borderValue: 'nil' })
  rightCell.removeChild(rightCell.lastChild)
  rightCell.appendChild(buildPartyInnerTableNode(doc, payload?.customer))
  appendTextParagraph(doc, rightCell, ' ')

  outerTable.appendChild(row)
  return outerTable
}

const parseSignaturesMarker = (rawPayload) => {
  try {
    const decoded = decodeURIComponent(String(rawPayload ?? ''))
    const parsed = JSON.parse(decoded)
    if (!parsed || typeof parsed !== 'object') return null
    return {
      leftTitle: String(parsed?.leftTitle ?? 'Исполнитель'),
      rightTitle: String(parsed?.rightTitle ?? 'Заказчик'),
      leftValue: String(parsed?.leftValue ?? ''),
      rightValue: String(parsed?.rightValue ?? ''),
    }
  } catch (error) {
    return null
  }
}

const buildSignaturesTableNode = (doc, payload) => {
  const table = createWordElement(doc, 'tbl')
  applyTableBorders(doc, table, 'nil')

  const grid = createWordElement(doc, 'tblGrid')
  ;[4500, 4500].forEach((width) => {
    const gridCol = createWordElement(doc, 'gridCol')
    setWordAttr(gridCol, 'w', width)
    grid.appendChild(gridCol)
  })
  table.appendChild(grid)

  const row1 = createWordElement(doc, 'tr')
  appendCell(doc, row1, {
    text: payload?.leftTitle || 'Исполнитель',
    width: 4500,
    borderValue: 'nil',
  })
  appendCell(doc, row1, {
    text: payload?.rightTitle || 'Заказчик',
    width: 4500,
    borderValue: 'nil',
  })
  table.appendChild(row1)

  const row2 = createWordElement(doc, 'tr')
  appendCell(doc, row2, {
    text: payload?.leftValue || '',
    width: 4500,
    borderValue: 'nil',
  })
  appendCell(doc, row2, {
    text: payload?.rightValue || '',
    width: 4500,
    borderValue: 'nil',
  })
  table.appendChild(row2)

  return table
}

const replacePartiesTablesInXml = (documentXml) => {
  if (typeof DOMParser === 'undefined' || typeof XMLSerializer === 'undefined') {
    return documentXml
  }

  const parser = new DOMParser()
  const xmlDoc = parser.parseFromString(String(documentXml ?? ''), 'application/xml')
  if (xmlDoc.getElementsByTagName('parsererror').length > 0) return documentXml

  const texts = Array.from(xmlDoc.getElementsByTagNameNS(WORD_NS, 't'))
  const replacements = []

  texts.forEach((node) => {
    const value = String(node.textContent ?? '')
    let parent = node
    while (parent && parent.nodeName !== 'w:p') {
      parent = parent.parentNode
    }
    if (!parent) return

    const partiesMatch = value.match(MARKER_PARTIES_TABLES_REGEX)
    if (partiesMatch?.[1]) {
      const payload = parsePartiesMarker(partiesMatch[1])
      if (payload) replacements.push({ paragraph: parent, type: 'parties', payload })
      return
    }

    const signaturesMatch = value.match(MARKER_SIGNATURES_TABLE_REGEX)
    if (signaturesMatch?.[1]) {
      const payload = parseSignaturesMarker(signaturesMatch[1])
      if (payload) {
        replacements.push({ paragraph: parent, type: 'signatures', payload })
      }
    }
  })

  replacements.forEach(({ paragraph, type, payload }) => {
    if (!paragraph?.parentNode) return
    const tableNode =
      type === 'signatures'
        ? buildSignaturesTableNode(xmlDoc, payload)
        : buildPartiesTableNode(xmlDoc, payload)
    paragraph.parentNode.replaceChild(tableNode, paragraph)
  })

  return new XMLSerializer().serializeToString(xmlDoc)
}


const exportDocxFromTemplate = async ({
  templateBase64,
  fileName = 'document.docx',
  variables = {},
}) => {
  if (typeof window === 'undefined') return false
  const bytes = base64ToUint8Array(templateBase64)
  if (!bytes) return false

  const [{ default: PizZip }, { default: Docxtemplater }] = await Promise.all([
    import('pizzip'),
    import('docxtemplater'),
  ])
  const zip = new PizZip(bytes)
  const normalizedData = toDocxtemplaterData(variables)
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    parser: (rawTag) => {
      const key = toDocxTemplateKey(rawTag)
      return {
        get: () => normalizedData[key] ?? '',
      }
    },
  })
  doc.render(normalizedData)
  const zipAfterRender = doc.getZip()
  const documentXmlFile = zipAfterRender.file('word/document.xml')
  if (documentXmlFile) {
    const originalXml = documentXmlFile.asText()
    const nextXml = replacePartiesTablesInXml(originalXml)
    if (nextXml !== originalXml) {
      zipAfterRender.file('word/document.xml', nextXml)
    }
  }
  const output = doc.getZip().generate({
    type: 'blob',
    mimeType:
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  downloadBlob(output, fileName)
  return true
}

export default exportDocxFromTemplate
