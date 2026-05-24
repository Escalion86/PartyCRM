import { USERS_ROLES } from '@helpers/constants'
import ValuePicker from './ValuePicker'

const UserRolePicker = ({
  roleId,
  onChange = null,
  required = false,
  error = false,
  noDev = true,
}) => {
  const rolesValues = USERS_ROLES.filter(({ value }) =>
    ['user', 'admin', 'dev'].includes(value)
  )
  return (
    <ValuePicker
      value={roleId}
      valuesArray={
        noDev ? rolesValues.filter(({ value }) => value !== 'dev') : rolesValues
      }
      label="Роль"
      onChange={onChange}
      name="role"
      required={required}
      error={error}
    />
  )
}

export default UserRolePicker
