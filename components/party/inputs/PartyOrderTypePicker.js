import PartyDictionaryPicker from './PartyDictionaryPicker'

const PartyOrderTypePicker = ({
  value,
  onChange,
  orderTypes = [],
  onCreateOrderType,
  allowCreate = true,
  disabled = false,
}) => {
  return (
    <PartyDictionaryPicker
      label="Тип"
      value={value}
      onChange={onChange}
      items={orderTypes}
      onCreateItem={onCreateOrderType}
      allowCreate={allowCreate}
      disabled={disabled}
      placeholder="Выберите тип"
      createPrompt="Новый тип заказа"
      addTitle="Добавить тип заказа"
    />
  )
}

export default PartyOrderTypePicker
