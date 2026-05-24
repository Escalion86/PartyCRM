import Button from '@mui/material/Button'
import ButtonGroup from '@mui/material/ButtonGroup'
import windowDimensionsNumSelector from '@state/selectors/windowDimensionsNumSelector'
import { useAtomValue } from 'jotai'

const TransactionTypeToggleButtons = ({ value, onChange }) => {
  const windowDimensionsNum = useAtomValue(windowDimensionsNumSelector)

  const handleToggle = (key) => {
    const next = { ...value, [key]: !value[key] }
    if (!next.income && !next.expense) {
      const fallbackKey = key === 'income' ? 'expense' : 'income'
      next[fallbackKey] = true
    }
    onChange(next)
  }

  return (
    <ButtonGroup size={windowDimensionsNum < 2 ? 'small' : undefined}>
      <Button
        onClick={() => handleToggle('income')}
        variant={value.income ? 'contained' : 'outlined'}
        color="inherit"
        sx={{
          color: value.income
            ? 'var(--tx-income-text)'
            : 'var(--tx-income-outline)',
          borderColor: 'var(--tx-income)',
          backgroundColor: value.income ? 'var(--tx-income)' : 'transparent',
          '&:hover': {
            borderColor: 'var(--tx-income-hover)',
            backgroundColor: value.income
              ? 'var(--tx-income-hover)'
              : 'var(--tx-income-hover-bg)',
          },
        }}
      >
        Доход
      </Button>
      <Button
        onClick={() => handleToggle('expense')}
        variant={value.expense ? 'contained' : 'outlined'}
        color="inherit"
        sx={{
          color: value.expense
            ? 'var(--tx-expense-text)'
            : 'var(--tx-expense-outline)',
          borderColor: 'var(--tx-expense)',
          backgroundColor: value.expense ? 'var(--tx-expense)' : 'transparent',
          '&:hover': {
            borderColor: 'var(--tx-expense-hover)',
            backgroundColor: value.expense
              ? 'var(--tx-expense-hover)'
              : 'var(--tx-expense-hover-bg)',
          },
        }}
      >
        Расход
      </Button>
    </ButtonGroup>
  )
}

export default TransactionTypeToggleButtons
