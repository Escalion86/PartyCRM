'use client'

import FormWrapper from './FormWrapper'
import Input from './Input'
import InputWrapper from './InputWrapper'
import ComboBox from './ComboBox'
import AddIconButton from './AddIconButton'
import { useMemo, useRef } from 'react'

const AddressPicker = ({
  address,
  onChange,
  label = 'Адрес',
  labelClassName,
  wrapperClassName,
  errors,
  required,
  townOptions = [],
  onCreateTown,
  allowTownCreate = true,
  noWrapper = false,
  tone = 'default',
  fieldsVariant = 'artist',
}) => {
  const isPartyFields = fieldsVariant === 'party'
  const townItems = useMemo(() => {
    const items = new Set()
    townOptions.forEach((town) => {
      if (typeof town === 'string' && town.trim()) items.add(town.trim())
    })
    if (address?.town && typeof address.town === 'string')
      items.add(address.town.trim())
    return Array.from(items).sort((a, b) => a.localeCompare(b, 'ru'))
  }, [address?.town, townOptions])
  const addressContentRef = useRef(null)

  const handleAddressFocusCapture = () => {
    if (addressContentRef.current) {
      addressContentRef.current.scrollLeft = 0
    }
  }

  const handleAddressScroll = () => {
    const node = addressContentRef.current
    if (!node) return
    if (node.scrollLeft !== 0) node.scrollLeft = 0
  }

  const handleCreateTown = () => {
    if (!allowTownCreate) return
    const newTown = window.prompt('Новый город')
    const trimmedTown = newTown?.trim()
    if (!trimmedTown) return
    onCreateTown?.(trimmedTown)
    onChange({ ...address, town: trimmedTown })
  }

  const content = (
    <div
      ref={addressContentRef}
      className="mt-0.5 mb-1 flex min-w-0 flex-1 flex-col gap-y-1.5 overflow-x-hidden"
      onFocusCapture={handleAddressFocusCapture}
      onScroll={handleAddressScroll}
      style={{ overscrollBehaviorX: 'none' }}
    >
        <FormWrapper className="flex flex-wrap mt-3 gap-x-2 gap-y-3">
          <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-1">
            <ComboBox
              label="Город"
              items={townItems}
              value={address.town}
              onChange={(town) => onChange({ ...address, town: town ?? '' })}
              placeholder="Выберите город"
              tone={tone}
              noMargin
              fullWidth
              error={errors?.address?.town}
              className="w-full min-w-0"
            />
            {allowTownCreate && (
              <AddIconButton
                onClick={handleCreateTown}
                title="Добавить город"
                size="md"
                tone={tone}
              />
            )}
          </div>
        </FormWrapper>
        <FormWrapper className="grid grid-cols-2 mt-1 gap-x-2 gap-y-3">
          <Input
            label="Улица"
            type="text"
            value={address.street}
            onChange={(street) => onChange({ ...address, street })}
            error={errors?.address?.street}
            noMargin
            className="w-full min-w-0"
            fullWidth
            tone={tone}
          />
          <Input
            label="Дом"
            type="text"
            value={address.house}
            onChange={(house) => onChange({ ...address, house })}
            error={errors?.address?.house}
            noMargin
            className="w-full min-w-0"
            fullWidth
            tone={tone}
          />
        </FormWrapper>
        {isPartyFields ? (
          <FormWrapper className="grid grid-cols-1 mt-1 gap-x-2 gap-y-3 sm:grid-cols-2">
            <Input
              label="Квартира / офис / комната"
              type="text"
              value={address.room}
              onChange={(room) => onChange({ ...address, room })}
              error={errors?.address?.room}
              noMargin
              className="w-full min-w-0"
              fullWidth
              tone={tone}
            />
          </FormWrapper>
        ) : (
          <FormWrapper className="grid grid-cols-3 mt-1 gap-x-2 gap-y-3">
            <Input
              label="Подъезд"
              type="text"
              value={address.entrance}
              onChange={(entrance) => onChange({ ...address, entrance })}
              error={errors?.address?.entrance}
              noMargin
              className="w-full min-w-0"
              fullWidth
              tone={tone}
            />
            <Input
              label="Этаж"
              type="text"
              value={address.floor}
              onChange={(floor) => onChange({ ...address, floor })}
              error={errors?.address?.floor}
              noMargin
              className="w-full min-w-0"
              fullWidth
              tone={tone}
            />
            <Input
              label="Кв. / Офис"
              type="text"
              value={address.flat}
              onChange={(flat) => onChange({ ...address, flat })}
              error={errors?.address?.flat}
              noMargin
              className="w-full min-w-0"
              fullWidth
              tone={tone}
            />
          </FormWrapper>
        )}
        <Input
          label={isPartyFields ? 'Комментарий' : 'Уточнения по адресу'}
          type="text"
          value={address.comment}
          onChange={(comment) => onChange({ ...address, comment })}
          noMargin
          error={errors?.address?.comment}
          fullWidth
          className="mt-1"
          tone={tone}
        />
        {!isPartyFields && (
          <>
            <FormWrapper className="grid grid-cols-2 mt-1 gap-x-2 gap-y-3">
              <Input
                label="Широта"
                type="text"
                value={address.latitude}
                onChange={(latitude) => onChange({ ...address, latitude })}
                error={errors?.address?.latitude}
                noMargin
                className="w-full min-w-0"
                fullWidth
                tone={tone}
              />
              <Input
                label="Долгота"
                type="text"
                value={address.longitude}
                onChange={(longitude) => onChange({ ...address, longitude })}
                error={errors?.address?.longitude}
                noMargin
                className="w-full min-w-0"
                fullWidth
                tone={tone}
              />
            </FormWrapper>
            <Input
              label="Ссылка 2ГИС"
              type="link"
              value={address.link2Gis}
              onChange={(link2Gis) => onChange({ ...address, link2Gis })}
              error={errors?.address?.link2Gis}
              noMargin
              className="mt-0.5"
              fullWidth
              tone={tone}
            />
            <Input
              label="Ссылка Yandex Navigator"
              type="link"
              value={address.linkYandexNavigator}
              onChange={(linkYandexNavigator) =>
                onChange({ ...address, linkYandexNavigator })
              }
              error={errors?.address?.linkYandexNavigator}
              noMargin
              className="mt-0.5"
              fullWidth
              tone={tone}
            />
          </>
        )}
    </div>
  )

  if (noWrapper) {
    return content
  }

  return (
    <InputWrapper
      label={label}
      labelClassName={labelClassName}
      value={address}
      className={wrapperClassName}
      required={required}
      paddingY={false}
      paddingX="small"
      centerLabel={true}
      tone={tone}
    >
      {content}
    </InputWrapper>
  )
}

export default AddressPicker
