/* eslint-disable react-hooks/exhaustive-deps */
import CardButtons from '@components/CardButtons'
import Divider from '@components/Divider'
import ImageGallery from '@components/ImageGallery'
import TextLine from '@components/TextLine'
import serviceSelector from '@state/selectors/serviceSelector'
import { useEffect } from 'react'
import { useAtomValue } from 'jotai'
import { modalsFuncAtom } from '@state/atoms'

const CardButtonsComponent = ({ service, onEdit }) => (
  <CardButtons
    item={service}
    typeOfItem="service"
    minimalActions
    alwaysCompact
    onEdit={onEdit}
    dropDownPlacement="left"
  />
)

const serviceViewFunc = (serviceId) => {
  const ServiceViewModal = ({
    closeModal,
    setOnConfirmFunc,
    setOnDeclineFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
    setDisableDecline,
    setTopLeftComponent,
  }) => {
    const service = useAtomValue(serviceSelector(serviceId))
    const modalsFunc = useAtomValue(modalsFuncAtom)

    useEffect(() => {
      if (setTopLeftComponent)
        setTopLeftComponent(() => (
          <CardButtonsComponent
            service={service}
            onEdit={() => modalsFunc.service?.edit(serviceId)}
          />
        ))
    }, [service, serviceId, modalsFunc.service, setTopLeftComponent])

    if (!service || !serviceId)
      return (
        <div className="flex w-full justify-center text-lg ">
          ОШИБКА! Услуга не найдена!
        </div>
    )

    return (
      <div className="flex flex-col gap-y-2">
        <ImageGallery images={service?.images} />
        <div className="flex flex-1 flex-col">
          <div className="relative flex w-full max-w-full flex-1 flex-col px-2 py-2">
            <div className="flex w-full justify-center text-3xl font-bold">
              {service?.title}
            </div>
            {!setTopLeftComponent && (
              <div className="absolute right-0">
                <CardButtonsComponent
                  service={service}
                  onEdit={() => modalsFunc.service?.edit(serviceId)}
                />
              </div>
            )}
            <div className="whitespace-pre-line text-sm text-gray-700">
              {service?.description || 'Описание отсутствует'}
            </div>

            <Divider thin light />
            <TextLine label="ID">{service?._id}</TextLine>
            {service?.duration !== undefined && (
              <TextLine label="Продолжительность">
                {service?.duration ? `${service.duration} мин.` : '-'}
              </TextLine>
            )}
          </div>
        </div>
      </div>
    )
  }

  return {
    title: `Услуга`,
    confirmButtonName: 'Закрыть',
    Children: ServiceViewModal,
  }
}

export default serviceViewFunc

