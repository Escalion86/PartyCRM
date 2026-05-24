import ErrorsList from '@components/ErrorsList'
import FormWrapper from '@components/FormWrapper'
import Input from '@components/Input'
import IconCheckBox from '@components/IconCheckBox'
import { DEFAULT_TARIFF } from '@helpers/constants'
import useErrors from '@helpers/useErrors'
import itemsFuncAtom from '@state/atoms/itemsFuncAtom'
import tariffSelector from '@state/selectors/tariffSelector'
import { useEffect, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'

const tariffFunc = (tariffId, clone = false) => {
  const TariffModal = ({
    closeModal,
    setOnConfirmFunc,
    setOnShowOnCloseConfirmDialog,
    setDisableConfirm,
  }) => {
    const tariff = useAtomValue(tariffSelector(tariffId))
    const setTariff = useAtomValue(itemsFuncAtom).tariff.set

    const [title, setTitle] = useState(tariff?.title ?? DEFAULT_TARIFF.title)
    const [eventsPerMonth, setEventsPerMonth] = useState(
      tariff?.eventsPerMonth ?? DEFAULT_TARIFF.eventsPerMonth
    )
    const [price, setPrice] = useState(tariff?.price ?? DEFAULT_TARIFF.price)
    const [allowCalendarSync, setAllowCalendarSync] = useState(
      tariff?.allowCalendarSync ?? DEFAULT_TARIFF.allowCalendarSync
    )
    const [allowStatistics, setAllowStatistics] = useState(
      tariff?.allowStatistics ?? DEFAULT_TARIFF.allowStatistics
    )
    const [allowDocuments, setAllowDocuments] = useState(
      tariff?.allowDocuments ?? DEFAULT_TARIFF.allowDocuments
    )
    const [allowTelephony, setAllowTelephony] = useState(
      tariff?.allowTelephony ?? DEFAULT_TARIFF.allowTelephony
    )
    const [allowAi, setAllowAi] = useState(
      tariff?.allowAi ?? DEFAULT_TARIFF.allowAi
    )
    const [hidden, setHidden] = useState(
      tariff?.hidden ?? DEFAULT_TARIFF.hidden
    )

    const [errors, checkErrors, , removeError] = useErrors()
    const onClickConfirmRef = useRef(null)

    useEffect(() => {
      onClickConfirmRef.current = async () => {
        if (!checkErrors({ title })) {
          closeModal()
          setTariff(
            {
              _id: tariff?._id,
              title,
              eventsPerMonth,
              price,
              allowCalendarSync,
              allowStatistics,
              allowDocuments,
              allowTelephony,
              allowAi,
              hidden,
            },
            clone
          )
        }
      }
    }, [
      allowCalendarSync,
      allowDocuments,
      allowStatistics,
      allowTelephony,
      allowAi,
      checkErrors,
      closeModal,
      eventsPerMonth,
      hidden,
      price,
      setTariff,
      tariff?._id,
      title,
    ])

    useEffect(() => {
      const isFormChanged =
        tariff?.title !== title ||
        tariff?.eventsPerMonth !== eventsPerMonth ||
        tariff?.price !== price ||
        tariff?.allowCalendarSync !== allowCalendarSync ||
        tariff?.allowStatistics !== allowStatistics ||
        tariff?.allowDocuments !== allowDocuments ||
        tariff?.allowTelephony !== allowTelephony ||
        tariff?.allowAi !== allowAi ||
        tariff?.hidden !== hidden

      setOnConfirmFunc(
        isFormChanged ? () => onClickConfirmRef.current?.() : undefined
      )
      setOnShowOnCloseConfirmDialog(isFormChanged)
      setDisableConfirm(!isFormChanged)
    }, [
      allowCalendarSync,
      allowDocuments,
      allowStatistics,
      allowTelephony,
      allowAi,
      eventsPerMonth,
      hidden,
      price,
      setDisableConfirm,
      setOnConfirmFunc,
      setOnShowOnCloseConfirmDialog,
      tariff?.allowCalendarSync,
      tariff?.allowDocuments,
      tariff?.allowTelephony,
      tariff?.allowAi,
      tariff?.allowStatistics,
      tariff?.eventsPerMonth,
      tariff?.hidden,
      tariff?.price,
      tariff?.title,
      title,
    ])

    return (
      <>
        <FormWrapper>
          <Input
            label="Название тарифа"
            type="text"
            value={title}
            onChange={(value) => {
              removeError('title')
              setTitle(value)
            }}
            error={errors.title}
            required
          />
          <FormWrapper twoColumns>
            <Input
              label="Мероприятий в месяц"
              type="number"
              value={eventsPerMonth}
              onChange={(value) => {
                removeError('eventsPerMonth')
                setEventsPerMonth(value)
              }}
              min={0}
              step={1}
            />
            <Input
              label="Стоимость (₽)"
              type="number"
              value={price}
              onChange={(value) => {
                removeError('price')
                setPrice(value)
              }}
              min={0}
              step={100}
            />
          </FormWrapper>
          <div className="grid gap-2">
            <IconCheckBox
              checked={allowCalendarSync}
              onClick={() => setAllowCalendarSync((prev) => !prev)}
              label="Синхронизация с календарем"
              noMargin
            />
            <IconCheckBox
              checked={allowStatistics}
              onClick={() => setAllowStatistics((prev) => !prev)}
              label="Просмотр статистики"
              noMargin
            />
            <IconCheckBox
              checked={allowDocuments}
              onClick={() => setAllowDocuments((prev) => !prev)}
              label="Работа с документами"
              noMargin
            />
            <IconCheckBox
              checked={allowTelephony}
              onClick={() => setAllowTelephony((prev) => !prev)}
              label="IP-телефония"
              noMargin
            />
            <IconCheckBox
              checked={allowAi}
              onClick={() => setAllowAi((prev) => !prev)}
              label="ИИ-возможности"
              noMargin
            />
            <IconCheckBox
              checked={hidden}
              onClick={() => setHidden((prev) => !prev)}
              label="Скрытый тариф"
              noMargin
            />
          </div>
        </FormWrapper>
        <ErrorsList errors={errors} />
      </>
    )
  }

  return {
    title: `${tariffId && !clone ? 'Редактирование' : 'Создание'} тарифа`,
    confirmButtonName: tariffId && !clone ? 'Применить' : 'Создать',
    Children: TariffModal,
  }
}

export default tariffFunc
