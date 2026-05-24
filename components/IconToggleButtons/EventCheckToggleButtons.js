import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import windowDimensionsNumSelector from '@state/selectors/windowDimensionsNumSelector'
import { useAtomValue } from 'jotai'

const EventCheckToggleButtons = ({ value, onChange }) => {
  const windowDimensionsNum = useAtomValue(windowDimensionsNumSelector)

  const handleToggle = (key) => {
    const next = { ...value, [key]: !value[key] }
    if (!next.checked && !next.unchecked) {
      const fallbackKey = key === 'checked' ? 'unchecked' : 'checked'
      next[fallbackKey] = true
    }
    onChange(next)
  }

  return (
    <ButtonGroup size={windowDimensionsNum < 2 ? 'small' : undefined}>
      <Button
        onClick={() => handleToggle('checked')}
        variant={value.checked ? 'contained' : 'outlined'}
        color="inherit"
        sx={{
          color: value.checked ? '#ffffff' : '#16a34a',
          borderColor: '#16a34a',
          backgroundColor: value.checked ? '#16a34a' : 'transparent',
          '&:hover': {
            borderColor: '#15803d',
            backgroundColor: value.checked ? '#15803d' : 'rgba(22, 163, 74, 0.14)',
          },
        }}
      >
        Проверенные
      </Button>
      <Button
        onClick={() => handleToggle('unchecked')}
        variant={value.unchecked ? 'contained' : 'outlined'}
        color="inherit"
        sx={{
          color: value.unchecked ? '#ffffff' : '#f59e0b',
          borderColor: '#f59e0b',
          backgroundColor: value.unchecked ? '#f59e0b' : 'transparent',
          '&:hover': {
            borderColor: '#d97706',
            backgroundColor: value.unchecked ? '#d97706' : 'rgba(245, 158, 11, 0.14)',
          },
        }}
      >
        Не проверенные
      </Button>
    </ButtonGroup>
  )
}

export default EventCheckToggleButtons
