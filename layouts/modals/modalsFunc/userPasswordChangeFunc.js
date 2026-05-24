import FormWrapper from '@components/FormWrapper'
import Input from '@components/Input'
import UserName from '@components/UserName'
import useSnackbar from '@helpers/useSnackbar'
import userSelector from '@state/selectors/userSelector'
import { useAtomValue } from 'jotai'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const userPasswordChangeFunc = (userId) => {
  const UserPasswordChangeModal = ({
    closeModal,
    setOnConfirmFunc,
    setDisableConfirm,
    setConfirmButtonName,
  }) => {
    const user = useAtomValue(userSelector(userId))
    const snackbar = useSnackbar()
    const [newPassword, setNewPassword] = useState('')
    const [repeatPassword, setRepeatPassword] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
      if (!user) closeModal()
    }, [closeModal, user])

    useEffect(() => {
      setConfirmButtonName('Сменить пароль')
    }, [setConfirmButtonName])

    const repeatError = useMemo(() => {
      if (!newPassword || !repeatPassword || newPassword === repeatPassword) {
        return null
      }
      return 'Пароли не совпадают'
    }, [newPassword, repeatPassword])

    const passwordError = useMemo(() => {
      if (!newPassword || String(newPassword).length >= 8) return null
      return 'Минимум 8 символов'
    }, [newPassword])

    const isValid = useMemo(() => {
      if (!newPassword || !repeatPassword) return false
      if (String(newPassword).length < 8) return false
      return newPassword === repeatPassword
    }, [newPassword, repeatPassword])

    useEffect(() => {
      setDisableConfirm(!isValid || isSaving)
    }, [isSaving, isValid, setDisableConfirm])

    const handleSave = useCallback(async () => {
      if (!isValid || !user?._id) return
      setIsSaving(true)
      try {
        const response = await fetch(`/api/users/${user._id}/password`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ newPassword }),
        })
        const payload = await response.json().catch(() => ({}))
        if (!response.ok || payload?.success === false) {
          snackbar.error(payload?.error || 'Не удалось сменить пароль')
          return
        }
        snackbar.success('Пароль пользователя обновлен')
        closeModal()
      } finally {
        setIsSaving(false)
      }
    }, [closeModal, isValid, newPassword, snackbar, user?._id])

    const onConfirmRef = useRef(handleSave)

    useEffect(() => {
      onConfirmRef.current = handleSave
    }, [handleSave])

    useEffect(() => {
      setOnConfirmFunc(() => onConfirmRef.current?.())
    }, [setOnConfirmFunc])

    if (!user) return null

    return (
      <FormWrapper flex className="flex-col gap-3">
        <UserName user={user} className="text-lg font-bold" />
        <Input
          label="Новый пароль"
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          error={passwordError}
        />
        <Input
          label="Повторите пароль"
          type="password"
          value={repeatPassword}
          onChange={setRepeatPassword}
          error={repeatError}
        />
      </FormWrapper>
    )
  }

  return {
    title: 'Смена пароля пользователя',
    confirmButtonName: 'Сменить пароль',
    declineButtonName: 'Отмена',
    Children: UserPasswordChangeModal,
  }
}

export default userPasswordChangeFunc
