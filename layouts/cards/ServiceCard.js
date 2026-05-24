/* eslint-disable @next/next/no-img-element */
'use client'

import loadingAtom from '@state/atoms/loadingAtom'
import errorAtom from '@state/atoms/errorAtom'
import PropTypes from 'prop-types'
import CardButtons from '@components/CardButtons'
import CardOverlay from '@components/CardOverlay'
import CardActions from '@components/CardActions'
import TextLinesLimiter from '@components/TextLinesLimiter'
import formatMinutes from '@helpers/formatMinutes'
import { modalsFuncAtom } from '@state/atoms'
import { useAtomValue } from 'jotai'
import CardWrapper from '@components/CardWrapper'

const ServiceCard = ({ service, style }) => {
  const modalsFunc = useAtomValue(modalsFuncAtom)
  const loading = useAtomValue(loadingAtom('service' + service?._id))
  const error = useAtomValue(errorAtom('service' + service?._id))

  if (!service) return null

  const durationLabel = service.duration
    ? formatMinutes(service.duration)
    : 'Не указана'
  const description = service.description || 'Описание отсутствует'
  const previewImage =
    Array.isArray(service.images) && service.images.length > 0
      ? service.images[0]
      : null

  return (
    <CardWrapper
      style={style}
      onClick={() => !loading && modalsFunc.service?.view(service._id)}
      className="card-body-pad group flex h-full w-full cursor-pointer p-4 text-left hover:border-gray-300"
    >
      <CardOverlay loading={loading} error={error} />
      <CardActions>
        <CardButtons
          item={service}
          typeOfItem="service"
          minimalActions
          alwaysCompact
          onEdit={() => modalsFunc.service?.edit(service._id)}
        />
      </CardActions>

      <div className="flex h-full w-full gap-3">
        {previewImage && (
          <img
            src={previewImage}
            alt="service"
            className="h-16 w-16 min-w-[64px] rounded-lg object-cover"
          />
        )}
        <div className="flex h-full w-full flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="card-title text-base">
              {service.title || 'Без названия'}
            </div>
          </div>
          <div className="card-meta flex flex-wrap gap-3 text-sm">
            <div>
              <span className="font-medium">Продолжительность:</span>{' '}
              {durationLabel}
            </div>
          </div>
          <TextLinesLimiter className="card-muted text-sm" lines={3}>
            {description}
          </TextLinesLimiter>
        </div>
      </div>
    </CardWrapper>
  )
}

ServiceCard.propTypes = {
  service: PropTypes.shape({
    _id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    title: PropTypes.string,
    description: PropTypes.string,
    images: PropTypes.arrayOf(PropTypes.string),
    duration: PropTypes.number,
  }).isRequired,
  style: PropTypes.shape({}),
}

ServiceCard.defaultProps = {
  style: null,
}

export default ServiceCard

