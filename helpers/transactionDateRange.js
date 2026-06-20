const DATE_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export const WEEKDAY_LABELS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС']

export const MONTHS_FULL = [
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
]

const parseLocalDate = (value) => {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return new Date(value.getFullYear(), value.getMonth(), value.getDate())
  }

  if (typeof value === 'string') {
    const match = value.match(DATE_INPUT_PATTERN)
    if (match) {
      const [, year, month, day] = match
      return new Date(Number(year), Number(month) - 1, Number(day))
    }
  }

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export const toDateInputValue = (value) => {
  const date = parseLocalDate(value)
  if (!date) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export const formatDateRu = (value) => {
  const date = parseLocalDate(value)
  if (!date) return ''
  return date.toLocaleDateString('ru-RU', {
    day: 'numeric',
    month: 'long',
  })
}

export const formatDateRuNoWrap = (value) =>
  formatDateRu(value).replace(' ', '\u00A0')

export const formatDateRangeLabel = ({ from = '', to = '' } = {}) => {
  if (!from) return 'Дата'
  if (!to || from === to) return formatDateRuNoWrap(from)
  return `${formatDateRuNoWrap(from)} - ${formatDateRuNoWrap(to)}`
}

export const buildMonthDays = (cursorDate) => {
  const year = cursorDate.getFullYear()
  const month = cursorDate.getMonth()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const firstDaySundayFirst = new Date(year, month, 1).getDay()
  const firstDayMondayFirst = (firstDaySundayFirst + 6) % 7

  const days = Array.from({ length: daysInMonth }, (_, index) => index + 1)
  const prefix = Array.from({ length: firstDayMondayFirst }, () => null)
  const cells = [...prefix, ...days]
  const tail = (7 - (cells.length % 7)) % 7

  return [...cells, ...Array.from({ length: tail }, () => null)]
}

export const getNextWeekendRange = (baseDate = new Date()) => {
  const today = parseLocalDate(baseDate)
  if (!today) return { from: '', to: '' }
  const day = today.getDay()
  const daysToSaturday = day === 6 ? 0 : (6 - day + 7) % 7
  const saturday = new Date(today)
  saturday.setDate(today.getDate() + daysToSaturday)
  const sunday = new Date(saturday)
  sunday.setDate(saturday.getDate() + 1)
  return {
    from: toDateInputValue(saturday),
    to: toDateInputValue(sunday),
  }
}

export const normalizeRangeByDate = (currentRange, value) => {
  const day = toDateInputValue(value)
  if (!day) return currentRange

  if (!currentRange?.from || (currentRange?.from && currentRange?.to)) {
    return { from: day, to: '' }
  }

  const start = parseLocalDate(currentRange.from)
  const selected = parseLocalDate(day)
  if (!start || !selected) return { from: day, to: '' }

  if (selected.getTime() < start.getTime()) {
    return { from: day, to: currentRange.from }
  }

  return { from: currentRange.from, to: day }
}

export const isDateInRange = (dateValue, range = {}) => {
  const day = parseLocalDate(dateValue)
  const from = parseLocalDate(range.from)
  if (!day || !from) return false
  const to = parseLocalDate(range.to || range.from)
  if (!to) return false
  const ms = day.getTime()
  return ms >= from.getTime() && ms <= to.getTime()
}

export const isDateRangeEdge = (dateValue, range = {}) => {
  const key = toDateInputValue(dateValue)
  if (!key || !range.from) return false
  return key === range.from || key === (range.to || range.from)
}

export const isTransactionInDateRange = (transaction, range = {}) => {
  if (!range?.from) return true
  if (!transaction?.date) return false
  return isDateInRange(transaction.date, range)
}

export const calculateDateRangePanelPosition = ({
  buttonRect,
  viewportWidth,
  panelMaxWidth = 760,
  margin = 12,
  gap = 8,
} = {}) => {
  if (!buttonRect || !viewportWidth) {
    return {
      left: margin,
      top: margin,
      width: panelMaxWidth,
    }
  }

  const availableWidth = Math.max(0, viewportWidth - margin * 2)
  const width = Math.min(panelMaxWidth, availableWidth)
  const maxLeft = Math.max(margin, viewportWidth - width - margin)
  const preferredLeft = Math.max(margin, buttonRect.left)

  return {
    left: Math.min(preferredLeft, maxLeft),
    top: Math.round(buttonRect.bottom + gap),
    width,
  }
}
