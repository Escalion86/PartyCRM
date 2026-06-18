/* eslint-disable react-hooks/exhaustive-deps */
import ErrorsList from '@components/ErrorsList'
import FormWrapper from '@components/FormWrapper'
import Input from '@components/Input'
import useErrors from '@helpers/useErrors'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import { useAtomValue } from 'jotai'
import { useEffect, useRef, useState } from 'react'

const serviceGroupFunc = (serviceGroupId, clone = false, onSuccess) => {
  const ServiceGroupModal = ({
    closeModal,
    setOnConfirmFunc,
    setOnDeclineFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
    setDisableDecline,
  }) => {
    const [title, setTitle] = useState('')
    const [errors, checkErrors, , removeError] = useErrors()
    const setServiceGroup = useAtomValue(itemsFuncAtom).serviceGroup.set

    const onClickConfirm = async () => {
      if (
        !checkErrors({
          title,
        })
      ) {
        closeModal()
        const result = await setServiceGroup(
          {
            _id: serviceGroupId,
            title,
          },
          clone
        )
        if (typeof onSuccess === 'function' && result?._id) {
          onSuccess(result)
        }
      }
    }

    const onClickConfirmRef = useRef(onClickConfirm)

    useEffect(() => {
      onClickConfirmRef.current = onClickConfirm
    }, [onClickConfirm])

    useEffect(() => {
      const isFormChanged = title !== ''

      setOnConfirmFunc(
        isFormChanged ? () => onClickConfirmRef.current() : undefined
      )
      setOnShowOnCloseConfirmDialog(isFormChanged)
      setDisableConfirm(!isFormChanged)
    }, [title])

    return (
      <>
        <FormWrapper>
          <Input
            label="Название группы"
            type="text"
            value={title}
            onChange={(value) => {
              removeError('title')
              setTitle(value)
            }}
            error={errors.title}
            required
          />
        </FormWrapper>
        <ErrorsList errors={errors} />
      </>
    )
  }

  return {
    title: `${serviceGroupId && !clone ? 'Редактирование' : 'Создание'} группы услуг`,
    confirmButtonName: serviceGroupId && !clone ? 'Применить' : 'Создать',
    Children: ServiceGroupModal,
  }
}

export default serviceGroupFunc
