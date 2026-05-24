/* eslint-disable react-hooks/exhaustive-deps */
import ErrorsList from '@components/ErrorsList'
import FormWrapper from '@components/FormWrapper'
import Input from '@components/Input'
import InputImages from '@components/InputImages'
import Textarea from '@components/Textarea'
import { DEFAULT_SERVICE } from '@helpers/constants'
import compareArrays from '@helpers/compareArrays'
import useErrors from '@helpers/useErrors'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import serviceSelector from '@state/selectors/serviceSelector'
import { useEffect, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'

const serviceFunc = (serviceId, clone = false, onSuccess) => {
  const ServiceModal = ({
    closeModal,
    setOnConfirmFunc,
    setOnDeclineFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
    setDisableDecline,
  }) => {
    const service = useAtomValue(serviceSelector(serviceId))

    const setService = useAtomValue(itemsFuncAtom).service.set

    const [title, setTitle] = useState(service?.title ?? DEFAULT_SERVICE.title)
    const [description, setDescription] = useState(
      service?.description ?? DEFAULT_SERVICE.description
    )
    const [images, setImages] = useState(
      service?.images ?? DEFAULT_SERVICE.images
    )
    const [duration, setDuration] = useState(
      service?.duration ?? DEFAULT_SERVICE.duration ?? 0
    )

    const [errors, checkErrors, , removeError] = useErrors()

    const onClickConfirm = async () => {
      if (
        !checkErrors({
          title,
          description,
        })
      ) {
        closeModal()
        const result = await setService(
          {
            _id: service?._id,
            title,
            description,
            images,
            duration,
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
      const isFormChanged =
        service?.title !== title ||
        service?.description !== description ||
        service?.duration !== duration ||
        !compareArrays(service?.images, images)

      setOnConfirmFunc(
        isFormChanged ? () => onClickConfirmRef.current() : undefined
      )
      setOnShowOnCloseConfirmDialog(isFormChanged)
      setDisableConfirm(!isFormChanged)
    }, [title, duration, description])

    return (
      <>
        <FormWrapper>
          <InputImages
            label="Изображение"
            images={images}
            onChange={setImages}
            directory="services"
            maxImages={1}
          />
          <Input
            label="Название"
            type="text"
            value={title}
            onChange={(value) => {
              removeError('title')
              setTitle(value)
            }}
            error={errors.title}
            required
          />
          <Textarea
            label="Описание"
            value={description}
            onChange={(value) => {
              removeError('description')
              setDescription(value)
            }}
            error={errors.description}
            rows={4}
          />
          <Input
            label="Продолжительность (мин.)"
            type="number"
            value={duration}
            onChange={(value) => {
              removeError('duration')
              setDuration(value)
            }}
            min={0}
            step={5}
          />
        </FormWrapper>
        <ErrorsList errors={errors} />
      </>
    )
  }

  return {
    title: `${serviceId && !clone ? 'Редактирование' : 'Создание'} услуги`,
    confirmButtonName: serviceId && !clone ? 'Применить' : 'Создать',
    Children: ServiceModal,
  }
}

export default serviceFunc

