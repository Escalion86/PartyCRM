/* eslint-disable react-hooks/exhaustive-deps */
import FormWrapper from '@components/FormWrapper'
import Input from '@components/Input'
import { postData } from '@helpers/CRUD'
import useSnackbar from '@helpers/useSnackbar'
import { useEffect, useMemo, useRef, useState } from 'react'

const changePasswordFunc = () => {
  const ChangePasswordModal = ({
    closeModal,
    setOnConfirmFunc,
    setDisableConfirm,
    setConfirmButtonName,
  }) => {
    const snackbar = useSnackbar()
    const [currentPassword, setCurrentPassword] = useState('')
    const [newPassword, setNewPassword] = useState('')
    const [repeatPassword, setRepeatPassword] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
      setConfirmButtonName('Сменить пароль')
    }, [setConfirmButtonName])

    const errors = useMemo(() => {
      if (!newPassword && !repeatPassword) return {}
      return {
        repeatPassword:
          newPassword && repeatPassword && newPassword !== repeatPassword
            ? 'Пароли не совпадают'
            : null,
      }
    }, [newPassword, repeatPassword])

    const isValid = useMemo(() => {
      if (!currentPassword || !newPassword || !repeatPassword) return false
      if (String(newPassword).length < 8) return false
      if (newPassword !== repeatPassword) return false
      return true
    }, [currentPassword, newPassword, repeatPassword])

    useEffect(() => {
      setDisableConfirm(!isValid || isSaving)
    }, [isSaving, isValid, setDisableConfirm])

    const handleSave = async () => {
      if (!isValid) return
      setIsSaving(true)
      await postData(
        '/api/auth/change-password',
        { currentPassword, newPassword },
        (result) => {
          if (result?.success === false) {
            snackbar.error(result?.error ?? 'Не удалось обновить пароль')
            return
          }
          snackbar.success('Пароль обновлен')
          closeModal()
        },
        () => snackbar.error('Не удалось обновить пароль'),
        true
      )
      setIsSaving(false)
    }

    const onConfirmRef = useRef(handleSave)

    useEffect(() => {
      onConfirmRef.current = handleSave
    }, [handleSave])

    useEffect(() => {
      setOnConfirmFunc(() => onConfirmRef.current?.())
    }, [setOnConfirmFunc])

    return (
      <FormWrapper flex className="flex-col gap-3">
        <Input
          label="Текущий пароль"
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
        />
        <Input
          label="Новый пароль"
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          error={
            newPassword && String(newPassword).length < 8
              ? 'Минимум 8 символов'
              : null
          }
        />
        <Input
          label="Повторите пароль"
          type="password"
          value={repeatPassword}
          onChange={setRepeatPassword}
          error={errors.repeatPassword}
        />
      </FormWrapper>
    )
  }

  return {
    title: 'Смена пароля',
    confirmButtonName: 'Сменить пароль',
    declineButtonName: 'Отмена',
    Children: ChangePasswordModal,
  }
}

export default changePasswordFunc

