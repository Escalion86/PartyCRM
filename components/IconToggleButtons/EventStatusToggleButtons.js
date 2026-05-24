import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import windowDimensionsNumSelector from '@state/selectors/windowDimensionsNumSelector'
import { useAtomValue } from 'jotai'

const BUTTON_STYLES = {
  request: {
    bg: '#6b7280',
    bgHover: '#4b5563',
    border: '#6b7280',
    text: '#6b7280',
    label: 'Заявки',
  },
  active: {
    bg: '#2563eb',
    bgHover: '#1d4ed8',
    border: '#2563eb',
    text: '#2563eb',
    label: 'Мероприятия',
  },
  finished: {
    bg: '#16a34a',
    bgHover: '#15803d',
    border: '#16a34a',
    text: '#16a34a',
    label: 'Завершены',
  },
  closed: {
    bg: '#0ea5e9',
    bgHover: '#0284c7',
    border: '#0ea5e9',
    text: '#0ea5e9',
    label: 'Закрыты',
  },
  canceled: {
    bg: '#dc2626',
    bgHover: '#b91c1c',
    border: '#dc2626',
    text: '#dc2626',
    label: 'Отменены',
  },
}

const MODE_KEYS = {
  upcoming: ['request', 'active', 'canceled'],
  past: ['finished', 'closed', 'canceled'],
  all: ['request', 'active', 'finished', 'closed', 'canceled'],
}

const getButtonSx = (selected, tone) => {
  const palette = BUTTON_STYLES[tone]
  return {
    borderColor: palette.border,
    color: selected ? '#ffffff' : palette.text,
    backgroundColor: selected ? palette.bg : 'transparent',
    '&:hover': {
      borderColor: palette.bgHover,
      backgroundColor: selected ? palette.bgHover : `${palette.bg}22`,
    },
  }
}

const getModeKeys = (mode) => MODE_KEYS[mode] || MODE_KEYS.all

const EventStatusToggleButtons = ({ value, onChange, mode = 'all' }) => {
  const windowDimensionsNum = useAtomValue(windowDimensionsNumSelector)
  const keys = getModeKeys(mode)

  const handleToggle = (key) => {
    const next = { ...value, [key]: !value[key] }
    const hasAnySelected = keys.some((statusKey) => Boolean(next[statusKey]))
    if (!hasAnySelected) {
      next[key] = true
    }
    onChange(next)
  }

  return (
    <ButtonGroup size={windowDimensionsNum < 2 ? 'small' : undefined}>
      {keys.map((key) => (
        <Button
          key={key}
          onClick={() => handleToggle(key)}
          variant={value[key] ? 'contained' : 'outlined'}
          color="inherit"
          sx={getButtonSx(value[key], key)}
        >
          {BUTTON_STYLES[key].label}
        </Button>
      ))}
    </ButtonGroup>
  )
}

export default EventStatusToggleButtons
