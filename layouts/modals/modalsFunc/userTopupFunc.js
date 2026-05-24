/* eslint-disable react-hooks/exhaustive-deps */
import Button from '@components/Button'
import FormWrapper from '@components/FormWrapper'
import Input from '@components/Input'
import UserName from '@components/UserName'
import { postData } from '@helpers/CRUD'
import useSnackbar from '@helpers/useSnackbar'
import loggedUserActiveRoleSelector from '@state/selectors/loggedUserActiveRoleSelector'
import userEditSelector from '@state/selectors/userEditSelector'
import userSelector from '@state/selectors/userSelector'
import { useEffect, useState } from 'react'
import { useAtomValue, useSetAtom } from 'jotai'

const userTopupFunc = (userId, onSuccess) => {
  const UserTopupModal = ({ closeModal }) => {
    const loggedUserActiveRole = useAtomValue(loggedUserActiveRoleSelector)
    const canManageUsers = loggedUserActiveRole?.users?.setRole
    const user = useAtomValue(userSelector(userId))
    const setUser = useSetAtom(userEditSelector)
    const snackbar = useSnackbar()

    const [amount, setAmount] = useState('')
    const [comment, setComment] = useState('')
    const [isSaving, setIsSaving] = useState(false)

    useEffect(() => {
      if (!user) closeModal()
    }, [user])

    const handleTopup = async () => {
      if (!user?._id) return
      const value = Number(amount)
      if (!Number.isFinite(value) || value <= 0) {
        snackbar.error('Укажите сумму пополнения')
        return
      }
      setIsSaving(true)
      const result = await postData(
        '/api/payments',
        {
          userId: user._id,
          amount: value,
          comment,
        },
        null,
        null,
        true
      )
      if (result?.success) {
        if (result?.data?.user) setUser(result.data.user)
        snackbar.success('Баланс пополнен')
        if (onSuccess) onSuccess()
        closeModal()
      } else {
        snackbar.error(result?.error || 'Не удалось пополнить баланс')
      }
      setIsSaving(false)
    }

    if (!user) return null
    if (!canManageUsers) {
      return (
        <FormWrapper>
          <div className="text-sm text-gray-500">
            Доступно только администраторам
          </div>
        </FormWrapper>
      )
    }

    return (
      <FormWrapper flex className="flex-col gap-3">
        <UserName user={user} className="text-lg font-bold" />
        <Input
          label="Сумма (руб.)"
          type="number"
          value={amount}
          onChange={setAmount}
          step={100}
        />
        <Input label="Комментарий" value={comment} onChange={setComment} />
        <div className="flex justify-end">
          <Button
            name="Пополнить"
            className="h-9 px-4 text-sm"
            onClick={handleTopup}
            disabled={isSaving}
            loading={isSaving}
          />
        </div>
      </FormWrapper>
    )
  }

  return {
    title: 'Пополнение баланса',
    declineButtonName: 'Закрыть',
    closeButtonShow: true,
    Children: UserTopupModal,
  }
}

export default userTopupFunc

